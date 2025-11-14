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
    thinking: thinkingConfig,
    jobQueue: jobQueueConfig,
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
  console.error('╔════════════════════════════════════════════════════════════╗');
  console.error('║     Multi-Model Advisor MCP Server Configuration          ║');
  console.error('╚════════════════════════════════════════════════════════════╝\n');
  
  console.error('📊 Current Configuration:');
  console.error(`  Server: ${config.server.name} v${config.server.version}`);
  console.error(`  Debug Mode: ${config.server.debug ? '✓ Enabled' : '✗ Disabled'}`);
  console.error(`  Ollama API URL: ${config.ollama.apiUrl}`);
  console.error(`  Models: ${config.ollama.models.join(', ')}\n`);
  
  if (config.jobQueue) {
    console.error('⚙️  Job Queue Configuration:');
    console.error(`  Max Concurrent Jobs: ${config.jobQueue.maxConcurrentJobs}`);
    console.error(`  Retry Attempts: ${config.jobQueue.defaultRetryAttempts}`);
    console.error(`  Retry Initial Delay: ${config.jobQueue.defaultInitialDelayMs}ms`);
    console.error(`  Retry Max Delay: ${config.jobQueue.defaultMaxDelayMs}ms\n`);
  }

  if (config.thinking) {
    console.error('💭 Thinking Configuration:');
    console.error(`  Default Thinking Steps: ${config.thinking.defaultThinkingSteps}`);
    console.error(`  Max Thinking Steps: ${config.thinking.maxThinkingSteps}\n`);
  }
  
  console.error('💭 System Prompts:');
  Object.entries(config.prompts).forEach(([model, prompt]) => {
    console.error(`  ${model}:`);
    console.error(`    "${prompt.substring(0, 70)}${prompt.length > 70 ? '...' : ''}"`);
  });
  
  console.error('\n📝 Usage with CLI Arguments:');
  console.error('  node build/index.js [OPTIONS]\n');
  
  console.error('🔧 Available Options:');
  console.error('  --server-name NAME              Server name (default: multi-model-advisor)');
  console.error('  --server-version VERSION        Server version (default: 1.0.0)');
  console.error('  --debug                         Enable debug mode (default: false)');
  console.error('  --ollama-url URL                Ollama API URL (default: http://localhost:11434)');
  console.error('  --models MODEL1,MODEL2,...      Comma-separated list of models to use');
  console.error('  --model1-prompt "TEXT"          System prompt for 1st model (works with ANY models!)');
  console.error('  --model2-prompt "TEXT"          System prompt for 2nd model');
  console.error('  --model3-prompt "TEXT"          System prompt for 3rd model (etc.)');
  console.error('  --max-concurrent-jobs NUM       Max concurrent jobs (default: 2)');
  console.error('  --retry-attempts NUM            Max retry attempts (default: 4)');
  console.error('  --retry-initial-delay NUM       Initial retry delay in ms (default: 2000)');
  console.error('  --retry-max-delay NUM           Max retry delay in ms (default: 10000)');
  console.error('  --default-thinking-steps NUM    Default thinking steps (default: 3)');
  console.error('  --max-thinking-steps NUM        Max thinking steps allowed (default: 4)\n');
  
  console.error('📚 Examples:');
  console.error('  # Basic start with defaults');
  console.error('  node build/index.js\n');
  console.error('  # Use different models with dynamic prompts');
  console.error('  node build/index.js --models llama3:latest,neural-chat,mistral \\');
  console.error('    --model1-prompt "You are funny" \\');
  console.error('    --model2-prompt "You are helpful" \\');
  console.error('    --model3-prompt "You are analytical"\n');
  console.error('  # Enable debug with custom Ollama URL and concurrency');
  console.error('  node build/index.js --debug --ollama-url http://192.168.1.10:11434 --max-concurrent-jobs 5\n');
  console.error('  # Override via environment variables');
  console.error('  OLLAMA_API_URL=http://remote:11434 MAX_CONCURRENT_JOBS=10 DEBUG=true node build/index.js\n');
}
