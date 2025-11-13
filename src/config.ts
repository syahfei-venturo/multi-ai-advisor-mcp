import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables from .env file
dotenv.config();

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Config {
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
}

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
  
  const getStringArray = (cliKey: string, envKey: string, defaultValue: string[]): string[] => {
    const value = cliArgs[cliKey] || process.env[envKey];
    if (!value) return defaultValue;
    return String(value).split(',').map(s => s.trim());
  };
  
  const serverName = getString('server-name', 'SERVER_NAME', 'multi-model-advisor');
  const serverVersion = getString('server-version', 'SERVER_VERSION', '1.0.0');
  const debug = getBoolean('debug', 'DEBUG', false);
  
  const ollamaUrl = getString('ollama-url', 'OLLAMA_API_URL', 'http://localhost:11434');
  const models = getStringArray('models', 'DEFAULT_MODELS', ['gemma3:1b', 'llama3.2:1b', 'deepseek-r1:1.5b']);
  
  // Get system prompts - fully dynamic for any model
  // Priority: CLI args (--model1-prompt, --model2-prompt) > ENV vars (MODEL_1_PROMPT, MODEL_2_PROMPT) > defaults
  const prompts: Record<string, string> = {};
  
  models.forEach((model, index) => {
    // Try multiple CLI key formats:
    // 1. Exact model name: --llama3:latest-prompt (unusual)
    // 2. Model number: --model1-prompt, --model2-prompt (clean!)
    // 3. Model prefix: --llama-prompt, --gemma-prompt (convenient)
    
    let prompt = '';
    const modelIndex = index + 1; // 1-indexed for CLI (model1, model2, model3)
    const modelPrefix = model.split(':')[0].replace(/[^a-z0-9]/gi, '').toLowerCase();
    
    // 1. Try model number format first (most explicit): --model1-prompt
    if (cliArgs[`model${modelIndex}-prompt`]) {
      prompt = String(cliArgs[`model${modelIndex}-prompt`]);
    }
    // 2. Try model prefix format: --llama-prompt, --gemma-prompt
    else if (cliArgs[`${modelPrefix}-prompt`]) {
      prompt = String(cliArgs[`${modelPrefix}-prompt`]);
    }
    // 3. Try indexed env var: MODEL_1_PROMPT, MODEL_2_PROMPT
    else if (process.env[`MODEL_${modelIndex}_PROMPT`]) {
      prompt = process.env[`MODEL_${modelIndex}_PROMPT`] || '';
    }
    // 4. Try model-specific env vars (legacy support)
    else if (process.env[`${modelPrefix.toUpperCase()}_SYSTEM_PROMPT`]) {
      prompt = process.env[`${modelPrefix.toUpperCase()}_SYSTEM_PROMPT`] || '';
    }
    // 5. Default fallback
    else {
      prompt = `You are a helpful AI assistant (${model}).`;
    }
    
    prompts[model] = prompt;
  })
  
  return {
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
  };
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
  console.error('  --model3-prompt "TEXT"          System prompt for 3rd model (etc.)\n');
  
  console.error('📚 Examples:');
  console.error('  # Basic start with defaults');
  console.error('  node build/index.js\n');
  console.error('  # Use different models with dynamic prompts');
  console.error('  node build/index.js --models llama3:latest,neural-chat,mistral \\');
  console.error('    --model1-prompt "You are funny" \\');
  console.error('    --model2-prompt "You are helpful" \\');
  console.error('    --model3-prompt "You are analytical"\n');
  console.error('  # Enable debug with custom Ollama URL');
  console.error('  node build/index.js --debug --ollama-url http://192.168.1.10:11434\n');
  console.error('  # Override via environment variables');
  console.error('  OLLAMA_API_URL=http://remote:11434 DEBUG=true node build/index.js\n');
}
