#!/bin/bash

# Quick Setup and Test Script
# This script helps you test the new CLI configuration system

echo "🔧 Multi-Model Advisor - CLI Configuration Test"
echo "=============================================="
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if build exists
if [ ! -d "build" ]; then
    echo "🔨 Building project..."
    npm run build
fi

echo ""
echo "✅ Setup complete! Here are some commands to try:"
echo ""
echo "1️⃣  Start with defaults:"
echo "   npm start"
echo ""
echo "2️⃣  Start with debug mode:"
echo "   npm run start:debug"
echo "   # or: node build/index.js --debug"
echo ""
echo "3️⃣  Connect to remote Ollama:"
echo "   node build/index.js --ollama-url http://192.168.1.100:11434"
echo ""
echo "4️⃣  Use different models:"
echo "   node build/index.js --models llama3:latest,neural-chat"
echo ""
echo "5️⃣  Custom system prompts:"
echo "   node build/index.js --gemma-prompt \"You are funny\""
echo ""
echo "📖 For more info, check CONFIG_IMPROVEMENTS.md"
echo ""
