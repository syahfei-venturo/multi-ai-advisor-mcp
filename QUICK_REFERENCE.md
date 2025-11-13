# Multi-Model Advisor - Quick Reference Card

## ⚡ Fastest Way to Get Started

```bash
# 1. Build
npm run build

# 2. Start with your preferences
node build/index.js --debug --ollama-url http://localhost:11434
```

## 📋 Command Reference

### Basic Commands
| Command | What it does |
|---------|-------------|
| `npm start` | Start with .env config |
| `npm run build` | Compile TypeScript |
| `npm run start:debug` | Start with debug enabled |

### CLI Arguments - System Prompts
**Dynamic format (works with ANY models):**
| Argument | Example |
|----------|---------|
| `--model1-prompt TEXT` | `--model1-prompt "You are funny"` |
| `--model2-prompt TEXT` | `--model2-prompt "You are helpful"` |
| `--model3-prompt TEXT` | `--model3-prompt "You are analytical"` |

**Legacy format (for specific model names):**
| Argument | Example |
|----------|---------|
| `--gemma-prompt TEXT` | `--gemma-prompt "You are creative"` |
| `--llama-prompt TEXT` | `--llama-prompt "You are thoughtful"` |
| `--deepseek-prompt TEXT` | `--deepseek-prompt "You are logical"` |

## 🎯 Common Scenarios

### Local Development
```bash
npm run start:debug
```

### Any Models with Custom Personalities
```bash
node build/index.js \
  --models llama3:latest,mistral,neural-chat \
  --model1-prompt "You are funny and entertaining" \
  --model2-prompt "You are serious and analytical" \
  --model3-prompt "You are kind and empathetic"
```

### Remote Ollama Server
```bash
node build/index.js --ollama-url http://ai-server.local:11434 --debug
```

### Multiple Models with Environment Variables
```bash
# In .env or shell:
# MODEL_1_PROMPT="You are creative"
# MODEL_2_PROMPT="You are helpful"
# MODEL_3_PROMPT="You are analytical"

node build/index.js --models my-model1,my-model2,my-model3
```

### Docker / CI-CD (no .env needed!)
```bash
docker run -e DEBUG=true my-app node build/index.js \
  --models llama3:latest,neural-chat \
  --model1-prompt "You are helpful" \
  --model2-prompt "You are creative"
```

## 🔍 How Configuration Priority Works

**When starting:** `DEBUG=true node build/index.js --debug --ollama-url http://custom:11434`

1. **CLI Argument** (`--debug` from command line) ✅ **WINS**
2. Environment Variable (`DEBUG=true`) ❌ Ignored
3. Hardcoded Default ❌ Ignored

Result: Debug is **enabled** because CLI takes priority!

## 🆘 Debugging

```bash
# See all configuration at startup
node build/index.js --debug

# Look for these in output:
# - Current Configuration section
# - System Prompts section
# - Available Options section
```

## 📝 Configuration Files

- **`.env`** - Environment variables (no CLI override)
- **`.env.example`** - Reference of all options
- **`src/config.ts`** - Configuration loading logic

## ✨ Key Features

✅ CLI arguments override environment variables  
✅ Environment variables as fallback  
✅ No configuration file needed!  
✅ Mix and match (CLI + .env + defaults)  
✅ Beautiful startup information display  
✅ Full TypeScript support  
✅ Backward compatible with existing .env setups  
