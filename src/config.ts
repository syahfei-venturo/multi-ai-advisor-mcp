import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

// Load environment variables from .env file
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Config {
  server: {
    name: string;
    version: string;
    debug: boolean;
  };
  ollama: {
    apiUrl: string;
    models: string[];
  };
  prompts: {
    [key: string]: string;
  };
  templates?: {
    [key: string]: 'legacy' | 'chat';
  };
  thinking?: {
    defaultThinkingSteps: number;
    maxThinkingSteps: number;
  };
  jobQueue?: {
    maxConcurrentJobs: number;
    defaultRetryAttempts: number;
    defaultInitialDelayMs: number;
    defaultMaxDelayMs: number;
  };
  webUI?: {
    enabled: boolean;
    frontendPort: number;  // Next.js dev server port
    backendPort: number;   // Express API + MCP SSE port
  };
  mcp?: {
    transport: 'stdio' | 'sse' | 'streamable';
    sessionTimeoutMinutes: number;
  };
}

// Zod validation schema
const ConfigSchema = z.object({
  server: z.object({
    name: z.string().min(1, 'Server name must not be empty'),
    version: z.string().min(1, 'Version must not be empty'),
    debug: z.boolean(),
  }),
  ollama: z.object({
    apiUrl: z.string().url('Invalid Ollama URL format'),
    models: z.array(z.string().min(1)).min(1, 'At least 1 model is required'),
  }),
  prompts: z.record(z.string()),
  templates: z.record(z.enum(['legacy', 'chat'])).optional(),
  thinking: z.object({
    defaultThinkingSteps: z.number().int().min(1).max(5),
    maxThinkingSteps: z.number().int().min(1).max(5),
  }).optional(),
  jobQueue: z.object({
    maxConcurrentJobs: z.number().int().min(1).max(2),
    defaultRetryAttempts: z.number().int().min(1).max(10),
    defaultInitialDelayMs: z.number().int().min(100).max(10000),
    defaultMaxDelayMs: z.number().int().min(1000).max(60000),
  }).optional(),
  webUI: z.object({
    enabled: z.boolean(),
    frontendPort: z.number().int().min(1024).max(65535),
    backendPort: z.number().int().min(1024).max(65535),
  }).optional(),
  mcp: z.object({
    transport: z.enum(['stdio', 'sse', 'streamable']),
    sessionTimeoutMinutes: z.number().int().min(5).max(1440),
  }).optional(),
});

/**
 * Parse command line arguments
 * Usage: node build/index.js --ollama-url http://localhost:11434 --models gemma3:1b,llama3.2:1b --debug
 */
function parseArgs(): Record<string, string | boolean> {
  const args: Record<string, string | boolean> = {};
  
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      
      // Check if next arg is a value or another flag
      if (i + 1 < process.argv.length && !process.argv[i + 1].startsWith('--')) {
        args[key] = process.argv[++i];
      } else {
        args[key] = true;
      }
    }
  }
  
  return args;
}

/**
 * Get configuration from environment variables or CLI arguments
 * Validates configuration against schema and throws error if invalid
 */
export function getConfig(): Config {
  const cliArgs = parseArgs();
  
  // Helper to get value from CLI args or env, with type conversion
  const getString = (cliKey: string, envKey: string, defaultValue: string): string => {
    if (cliArgs[cliKey]) return String(cliArgs[cliKey]);
    return process.env[envKey] || defaultValue;
  };
  
  const getBoolean = (cliKey: string, envKey: string, defaultValue: boolean): boolean => {
    if (cliArgs[cliKey] !== undefined) return cliArgs[cliKey] === true || cliArgs[cliKey] === 'true';
    const envValue = process.env[envKey];
    return envValue === 'true' ? true : (envValue === 'false' ? false : defaultValue);
  };
  
  const getNumber = (cliKey: string, envKey: string, defaultValue: number): number => {
    if (cliArgs[cliKey]) return parseInt(String(cliArgs[cliKey]), 10);
    const envValue = process.env[envKey];
    return envValue ? parseInt(envValue, 10) : defaultValue;
  };
  
  const getStringArray = (cliKey: string, envKey: string, defaultValue: string[]): string[] => {
    const value = cliArgs[cliKey] || process.env[envKey];
    if (!value) return defaultValue;
    return String(value).split(',').map(s => s.trim());
  };
  
  const serverName = getString('server-name', 'SERVER_NAME', 'multi-model-advisor');
  const serverVersion = getString('server-version', 'SERVER_VERSION', '1.0.0');
  const debug = getBoolean('debug', 'DEBUG', false);
  
  const ollamaUrl = getString('ollama-url', 'OLLAMA_API_URL', 'http://localhost:11434');
  const models = getStringArray('models', 'DEFAULT_MODELS', ['deepseek-r1:1.5b']);
  
  // Get system prompts - fully dynamic for any model
  const prompts: Record<string, string> = {};

  models.forEach((model, index) => {
    let prompt = '';
    const modelIndex = index + 1;
    const modelPrefix = model.split(':')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();

    if (cliArgs[`model${modelIndex}-prompt`]) {
      prompt = String(cliArgs[`model${modelIndex}-prompt`]);
    }
    else if (cliArgs[`${modelPrefix}-prompt`]) {
      prompt = String(cliArgs[`${modelPrefix}-prompt`]);
    }
    else if (process.env[`MODEL_${modelIndex}_PROMPT`]) {
      prompt = process.env[`MODEL_${modelIndex}_PROMPT`] || '';
    }
    else if (process.env[`${modelPrefix.toUpperCase()}_SYSTEM_PROMPT`]) {
      prompt = process.env[`${modelPrefix.toUpperCase()}_SYSTEM_PROMPT`] || '';
    }
    else {
      prompt = `You are a helpful AI assistant (${model}).`;
    }

    prompts[model] = prompt;
  });

  // Get template types - auto-detect or manual override
  const templates: Record<string, 'legacy' | 'chat'> = {};

  models.forEach((model, index) => {
    const modelIndex = index + 1;
    const modelPrefix = model.split(':')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
    const modelLower = model.toLowerCase();

    // Priority: CLI args > Env vars > Auto-detection
    let templateType: 'legacy' | 'chat' | undefined;

    // CLI argument: --model1-template=chat
    if (cliArgs[`model${modelIndex}-template`]) {
      const value = String(cliArgs[`model${modelIndex}-template`]).toLowerCase();
      templateType = value === 'chat' ? 'chat' : 'legacy';
    }
    // CLI argument by model name: --llama3-template=chat
    else if (cliArgs[`${modelPrefix}-template`]) {
      const value = String(cliArgs[`${modelPrefix}-template`]).toLowerCase();
      templateType = value === 'chat' ? 'chat' : 'legacy';
    }
    // Environment variable: MODEL_1_TEMPLATE=chat
    else if (process.env[`MODEL_${modelIndex}_TEMPLATE`]) {
      const value = (process.env[`MODEL_${modelIndex}_TEMPLATE`] || '').toLowerCase();
      templateType = value === 'chat' ? 'chat' : 'legacy';
    }
    // Environment variable by model name: LLAMA3_TEMPLATE=chat
    else if (process.env[`${modelPrefix.toUpperCase()}_TEMPLATE`]) {
      const value = (process.env[`${modelPrefix.toUpperCase()}_TEMPLATE`] || '').toLowerCase();
      templateType = value === 'chat' ? 'chat' : 'legacy';
    }
    // Auto-detection based on model name
    else {
      // Command-R, Cohere models
      if (modelLower.includes('command-r') || modelLower.includes('cohere')) {
        templateType = 'chat';
      }
      // Llama 3.x models
      else if (modelLower.includes('llama3') || modelLower.includes('llama-3')) {
        templateType = 'chat';
      }
      // ChatML models
      else if (modelLower.includes('chatml')) {
        templateType = 'chat';
      }
      // Mistral models
      else if (modelLower.includes('mistral')) {
        templateType = 'chat';
      }
      // Qwen models
      else if (modelLower.includes('qwen')) {
        templateType = 'chat';
      }
      // Default to legacy
      else {
        templateType = 'legacy';
      }
    }

    templates[model] = templateType;
  });

  // Job queue configuration
  const jobQueueConfig = {
    maxConcurrentJobs: getNumber('max-concurrent-jobs', 'MAX_CONCURRENT_JOBS', 2),
    defaultRetryAttempts: getNumber('retry-attempts', 'RETRY_MAX_ATTEMPTS', 4),
    defaultInitialDelayMs: getNumber('retry-initial-delay', 'RETRY_INITIAL_DELAY_MS', 3000),
    defaultMaxDelayMs: getNumber('retry-max-delay', 'RETRY_MAX_DELAY_MS', 10000),
  };

  // Thinking configuration
  const thinkingConfig = {
    defaultThinkingSteps: getNumber('default-thinking-steps', 'DEFAULT_THINKING_STEPS', 3),
    maxThinkingSteps: getNumber('max-thinking-steps', 'MAX_THINKING_STEPS', 4),
  };

  // Web UI configuration
  const webUIConfig = {
    enabled: getBoolean('web-ui', 'WEB_UI_ENABLED', true),
    frontendPort: getNumber('frontend-port', 'FRONTEND_PORT', 3000), // Next.js dev server
    backendPort: getNumber('backend-port', 'BACKEND_PORT', 3001),   // Express API + MCP SSE
  };

  // MCP configuration
  const mcpConfig = {
    transport: (cliArgs['mcp-transport'] || process.env.MCP_TRANSPORT || 'stdio') as 'stdio' | 'sse' | 'streamable',
    sessionTimeoutMinutes: getNumber('mcp-session-timeout', 'MCP_SESSION_TIMEOUT_MINUTES', 60),
  };

  const rawConfig = {
    server: {
      name: serverName,
      version: serverVersion,
      debug,
    },
    ollama: {
      apiUrl: ollamaUrl,
      models,
    },
    prompts,
    templates,
    thinking: thinkingConfig,
    jobQueue: jobQueueConfig,
    webUI: webUIConfig,
    mcp: mcpConfig,
  };

  // Validate configuration
  try {
    const validatedConfig = ConfigSchema.parse(rawConfig);
    return validatedConfig as Config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('\n❌ Configuration Validation Failed!\n');
      console.error('Errors:');
      error.errors.forEach(err => {
        const path = err.path.join('.');
        console.error(`  • ${path || 'root'}: ${err.message}`);
      });
      console.error('\n💡 Tips:');
      console.error('  - Check your .env file');
      console.error('  - Verify CLI arguments');
      console.error('  - Ollama URL must be valid (e.g., http://localhost:11434)');
      console.error('  - At least 1 model must be specified');
      console.error();
      process.exit(1);
    }
    throw error;
  }
}

/**
 * Print configuration and available CLI options
 */
export function printConfigInfo(config: Config): void {
  console.error('╔══════════════════════════════════════════════════════════════════╗');
  console.error('║         Multi-Model Advisor MCP Server - Configuration          ║');
  console.error('╚══════════════════════════════════════════════════════════════════╝');

  // Server info
  console.error(`\n📊 Server: ${config.server.name} v${config.server.version} ${config.server.debug ? '(Debug Mode)' : ''}`);
  console.error(`🔗 Ollama: ${config.ollama.apiUrl}`);
  console.error(`🤖 Models: ${config.ollama.models.length} configured`);
  config.ollama.models.forEach((model, idx) => {
    const template = config.templates?.[model] || 'legacy';
    const icon = template === 'chat' ? '💬' : '📝';
    console.error(`   ${idx + 1}. ${icon} ${model}`);
  });

  // Job Queue
  if (config.jobQueue) {
    console.error(`\n⚙️  Queue: ${config.jobQueue.maxConcurrentJobs} concurrent | Retry: ${config.jobQueue.defaultRetryAttempts}x (${config.jobQueue.defaultInitialDelayMs}-${config.jobQueue.defaultMaxDelayMs}ms)`);
  }

  // Thinking
  if (config.thinking) {
    console.error(`💭 Thinking: ${config.thinking.defaultThinkingSteps} default steps (max: ${config.thinking.maxThinkingSteps})`);
  }

  // Web UI
  if (config.webUI && config.webUI.enabled) {
    console.error(`\n🌐 Web UI:`);
    console.error(`   Frontend: http://localhost:${config.webUI.frontendPort}`);
    console.error(`   Backend:  http://localhost:${config.webUI.backendPort}`);
  }

  // MCP Transport
  if (config.mcp) {
    const transportLabel = config.mcp.transport === 'streamable' ? 'STREAMABLE HTTP' : config.mcp.transport.toUpperCase();
    const isHttpMode = config.mcp.transport === 'sse' || config.mcp.transport === 'streamable';
    const deprecated = config.mcp.transport === 'sse' ? ' (deprecated)' : '';
    console.error(`\n📡 MCP: ${transportLabel} mode${deprecated} ${isHttpMode ? `(session timeout: ${config.mcp.sessionTimeoutMinutes}m)` : ''}`);
  }

  console.error('\n' + '─'.repeat(68));
}
