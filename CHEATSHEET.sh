#!/usr/bin/env bash

# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                   MULTI-MODEL ADVISOR - CHEAT SHEET                        ║
# ╚════════════════════════════════════════════════════════════════════════════╝

# 🔨 BUILD
npm run build

# ▶️  START WITH DEFAULTS
npm start

# 🐛 START WITH DEBUG
npm run start:debug

# 📋 EXAMPLES
# ──────────────────────────────────────────────────────────────────────────

# 1️⃣  Basic start
#    node build/index.js

# 2️⃣  With debug mode
#    node build/index.js --debug

# 3️⃣  Remote Ollama server
#    node build/index.js --ollama-url http://192.168.1.100:11434

# 4️⃣  Custom models
#    node build/index.js --models llama3:latest,mistral,neural-chat

# 5️⃣  Custom prompts (RECOMMENDED - Works with ANY models!)
#    node build/index.js \
#      --models llama3:latest,mistral,neural-chat \
#      --model1-prompt "You are creative" \
#      --model2-prompt "You are analytical" \
#      --model3-prompt "You are helpful"

# 6️⃣  Everything combined
#    node build/index.js \
#      --ollama-url http://192.168.1.100:11434 \
#      --models llama3:latest,mistral,neural-chat \
#      --model1-prompt "Creative thinker" \
#      --model2-prompt "Analytical thinker" \
#      --model3-prompt "Empathetic listener" \
#      --debug

# 7️⃣  Using environment variables
#    export MODEL_1_PROMPT="Your prompt here"
#    export DEFAULT_MODELS="model1,model2"
#    node build/index.js

# 8️⃣  Docker
#    docker run my-image node build/index.js \
#      --models llama3:latest,mistral \
#      --model1-prompt "Prompt 1" \
#      --model2-prompt "Prompt 2"

# 📖 CLI OPTIONS
# ──────────────────────────────────────────────────────────────────────────
# --server-name NAME              Server name (default: multi-model-advisor)
# --server-version VERSION        Version (default: 1.0.0)
# --debug                         Enable debug mode
# --ollama-url URL                Ollama API URL
# --models LIST                   Comma-separated models
# --model1-prompt TEXT            Prompt for 1st model position
# --model2-prompt TEXT            Prompt for 2nd model position
# --model3-prompt TEXT            Prompt for 3rd model position
# --gemma-prompt TEXT             (Legacy) Prompt for Gemma
# --llama-prompt TEXT             (Legacy) Prompt for Llama
# --deepseek-prompt TEXT          (Legacy) Prompt for Deepseek

# 🌍 ENVIRONMENT VARIABLES
# ──────────────────────────────────────────────────────────────────────────
# SERVER_NAME                     Server name
# SERVER_VERSION                  Version
# DEBUG                           true/false
# OLLAMA_API_URL                  Ollama URL
# DEFAULT_MODELS                  Models list
# MODEL_1_PROMPT                  Prompt for position 1
# MODEL_2_PROMPT                  Prompt for position 2
# MODEL_3_PROMPT                  Prompt for position 3
# GEMMA_SYSTEM_PROMPT             (Legacy)
# LLAMA_SYSTEM_PROMPT             (Legacy)
# DEEPSEEK_SYSTEM_PROMPT          (Legacy)

# ⚡ QUICK TEMPLATES
# ──────────────────────────────────────────────────────────────────────────

# Template 1: Basic
node build/index.js

# Template 2: Debug
node build/index.js --debug

# Template 3: Remote Ollama
node build/index.js --ollama-url http://ai-server:11434 --debug

# Template 4: Three models with roles
node build/index.js \
  --models llama3:latest,mistral,neural-chat \
  --model1-prompt "You are funny and creative" \
  --model2-prompt "You are serious and analytical" \
  --model3-prompt "You are kind and empathetic"

# Template 5: Two models with roles
node build/index.js \
  --models llama3:latest,mistral \
  --model1-prompt "You are pro this idea" \
  --model2-prompt "You are against this idea"

# Template 6: From .env
export MODEL_1_PROMPT="Creative"
export MODEL_2_PROMPT="Analytical"
export DEFAULT_MODELS="llama3:latest,mistral"
node build/index.js

# 🎯 PRIORITY ORDER
# ──────────────────────────────────────────────────────────────────────────
# When starting: node build/index.js --model1-prompt "CLI"
# 
# System checks:
# 1. CLI argument (--model1-prompt)        ← Highest priority ⭐
# 2. Environment variable (MODEL_1_PROMPT)
# 3. Default value                         ← Lowest priority
#
# Winner: CLI argument "CLI" is used!

# 💡 TIPS
# ──────────────────────────────────────────────────────────────────────────

# Tip 1: Use --debug to see all configuration
#   node build/index.js --debug

# Tip 2: Test with any models
#   node build/index.js --models model1,model2 --model1-prompt "test"

# Tip 3: Override just one prompt
#   DEFAULT_MODELS="a,b,c" node build/index.js --model1-prompt "override"

# Tip 4: Use in shell scripts
#   #!/bin/bash
#   PROMPT_1="$1"
#   PROMPT_2="$2"
#   node build/index.js --model1-prompt "$PROMPT_1" --model2-prompt "$PROMPT_2"

# Tip 5: Use with Docker environment variables
#   docker run -e OLLAMA_API_URL="http://host.docker.internal:11434" my-image \
#     node build/index.js

# 📚 DOCUMENTATION
# ──────────────────────────────────────────────────────────────────────────
# README.md              - Main documentation
# QUICK_REFERENCE.md     - Quick command reference
# .env.example           - Configuration options
# DYNAMIC_PROMPTS.md     - Deep dive on prompts
# CONFIG_IMPROVEMENTS.md - What was improved
# SETUP_COMPLETE.md      - Setup summary

echo "✅ Multi-Model Advisor - Configuration System Ready!"
echo ""
echo "📖 For examples, check the commented lines above."
echo "🚀 Ready to start: npm start"
