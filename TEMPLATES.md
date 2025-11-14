# Template System Documentation

The Multi-Model Advisor MCP Server now supports multiple prompt template formats, enabling better compatibility with different model types including Llama3, Command-R, ChatML, and more.

## Overview

Different AI models expect prompts in different formats. Previously, the system used a simple text-based format (Legacy Template). Now, it supports structured message arrays (Chat Template) that work better with modern models.

### Template Types

#### 1. **Legacy Template** (Text-based)
- Format: Plain text with role labels
- Endpoint: Ollama's `/api/generate`
- Best for: Older models, custom models without specific chat formats
- Example format:
  ```
  Previous conversation:

  User: question 1

  Assistant (model-name): response 1

  ---

  New user question: question 2
  ```

#### 2. **Chat Template** (Structured Messages)
- Format: Array of message objects with roles
- Endpoint: Ollama's `/api/chat`
- Best for: Llama3, Command-R, ChatML, Mistral, Qwen, and other modern models
- Ollama automatically applies the correct template based on the model
- Supports: Llama3 format, Command-R format, ChatML format, etc.

## How It Works

### Automatic Template Detection

The system automatically detects which template to use based on model names:

| Model Pattern | Template Type | Reason |
|--------------|---------------|--------|
| `llama3`, `llama-3` | Chat | Llama 3.x models use special tokens format |
| `command-r`, `cohere` | Chat | Command-R/Cohere models have specific chat format |
| `chatml` | Chat | ChatML is a structured chat format |
| `mistral` | Chat | Mistral models benefit from chat format |
| `qwen` | Chat | Qwen models use chat format |
| Others | Legacy | Default for backward compatibility |

### Manual Override

You can override the automatic detection using CLI arguments or environment variables.

## Usage Examples

### Basic Usage (Auto-detection)

```bash
# Llama3 and Command-R will automatically use chat template
# deepseek-r1 will use legacy template
node build/index.js --models llama3.2:1b,deepseek-r1:1.5b,command-r:latest
```

Output shows detected templates:
```
💭 System Prompts:
  llama3.2:1b (📱 chat):
    "You are a helpful AI assistant (llama3.2:1b)."
  deepseek-r1:1.5b (📄 legacy):
    "You are a helpful AI assistant (deepseek-r1:1.5b)."
  command-r:latest (📱 chat):
    "You are a helpful AI assistant (command-r:latest)."
```

### Manual Template Override

#### CLI Arguments

```bash
# Force model 1 to use chat template
node build/index.js \
  --models deepseek-r1:1.5b \
  --model1-template chat

# Force model 2 to use legacy template
node build/index.js \
  --models llama3:latest,custom-model:latest \
  --model1-template chat \
  --model2-template legacy

# Override by model name
node build/index.js \
  --models llama3:latest \
  --llama3-template legacy
```

#### Environment Variables

```bash
# By model index
export MODEL_1_TEMPLATE=chat
export MODEL_2_TEMPLATE=legacy

# By model name prefix
export LLAMA3_TEMPLATE=chat
export DEEPSEEK_TEMPLATE=legacy

node build/index.js
```

### Configuration Priority

Template selection follows this priority order:
1. CLI argument by position: `--model1-template=chat`
2. CLI argument by name: `--llama3-template=chat`
3. Environment variable by position: `MODEL_1_TEMPLATE=chat`
4. Environment variable by name: `LLAMA3_TEMPLATE=chat`
5. Auto-detection based on model name
6. Default: `legacy`

## Supported Models

### Recommended for Chat Template

These models work best with the **chat template**:

- **Llama 3.x family**: `llama3.2:1b`, `llama3:8b`, `llama-3:70b`
- **Command-R family**: `command-r:latest`, `command-r-plus:latest`
- **Mistral family**: `mistral:latest`, `mistral:7b`
- **Qwen family**: `qwen:latest`, `qwen2:7b`
- **ChatML models**: Any model using ChatML format

### Works with Legacy Template

These models work fine with the **legacy template**:

- **DeepSeek family**: `deepseek-r1:1.5b`, `deepseek-coder:latest`
- **Gemma family**: `gemma:2b`, `gemma:7b`
- **Custom models**: Any custom model without specific chat requirements
- **Older models**: Models that don't have structured chat formats

## Technical Details

### Template Architecture

```
src/core/templates/
├── types.ts              # Interfaces and types
├── PromptTemplate        # Abstract interface
├── LegacyTemplate.ts     # Text-based implementation
├── ChatTemplate.ts       # Messages array implementation
├── TemplateFactory.ts    # Factory for creating templates
└── index.ts              # Public exports
```

### Ollama API Endpoints

#### Legacy Template → `/api/generate`
```json
{
  "model": "deepseek-r1:1.5b",
  "prompt": "Previous conversation:\n\nUser: ...",
  "system": "You are a helpful AI assistant.",
  "stream": false
}
```

#### Chat Template → `/api/chat`
```json
{
  "model": "llama3.2:1b",
  "messages": [
    { "role": "system", "content": "You are a helpful AI assistant." },
    { "role": "user", "content": "question 1" },
    { "role": "assistant", "content": "response 1" },
    { "role": "user", "content": "question 2" }
  ],
  "stream": false
}
```

### Template Format Examples

#### Llama3 Format (Applied by Ollama)
```
<|start_header_id|>system<|end_header_id|>

You are a helpful AI assistant.<|eot_id|>
<|start_header_id|>user<|end_header_id|>

What is AI?<|eot_id|>
<|start_header_id|>assistant<|end_header_id|>
```

#### Command-R Format (Applied by Ollama)
```
<BOS_TOKEN><|START_OF_TURN_TOKEN|><|SYSTEM_TOKEN|>
You are a helpful AI assistant.<|END_OF_TURN_TOKEN|>
<|START_OF_TURN_TOKEN|><|USER_TOKEN|>
What is AI?<|END_OF_TURN_TOKEN|>
<|START_OF_TURN_TOKEN|><|CHATBOT_TOKEN|>
```

#### ChatML Format (Applied by Ollama)
```
<|im_start|>system
You are a helpful AI assistant.<|im_end|>
<|im_start|>user
What is AI?<|im_end|>
<|im_start|>assistant
```

**Note**: You don't need to format these manually! The Chat Template just sends structured messages, and Ollama automatically applies the correct format based on the model.

## Benefits

### 1. **Better Model Compatibility**
- Models perform better with their native format
- Proper handling of system prompts, user messages, and assistant responses

### 2. **Backward Compatibility**
- Existing models continue to work with legacy template
- No breaking changes for existing configurations

### 3. **Flexibility**
- Auto-detection for convenience
- Manual override for fine control
- Per-model template configuration

### 4. **Extensibility**
- Easy to add new template types in the future
- Clean separation of concerns

## Troubleshooting

### Model not responding correctly?

Try switching templates:
```bash
# If using legacy, try chat
node build/index.js --models your-model:latest --model1-template chat

# If using chat, try legacy
node build/index.js --models your-model:latest --model1-template legacy
```

### How do I know which template my model is using?

Check the startup output:
```
💭 System Prompts:
  your-model:latest (📱 chat):     ← This shows the template type
    "Your system prompt..."
```

### Can I use different templates for different models?

Yes! Each model can have its own template:
```bash
node build/index.js \
  --models llama3:latest,deepseek-r1:1.5b,command-r:latest \
  --model1-template chat \
  --model2-template legacy \
  --model3-template chat
```

## Future Enhancements

Potential future additions:
- More template types (Alpaca, Vicuna, etc.)
- Custom template definitions
- Template performance metrics
- Automatic template benchmarking

## Contributing

To add support for a new model family:

1. Update `TemplateFactory.detectTemplateType()` in [src/core/templates/TemplateFactory.ts](src/core/templates/TemplateFactory.ts)
2. Add detection pattern for the model name
3. Test with the actual model
4. Update this documentation

Example:
```typescript
// Add support for new "amazing-model" family
if (name.includes('amazing-model')) {
  return 'chat';
}
```

## References

- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
- [Llama 3 Prompt Format](https://llama.meta.com/docs/model-cards-and-prompt-formats/meta-llama-3/)
- [Command-R Documentation](https://docs.cohere.com/docs/command-r)
- [ChatML Format](https://github.com/openai/openai-python/blob/main/chatml.md)
