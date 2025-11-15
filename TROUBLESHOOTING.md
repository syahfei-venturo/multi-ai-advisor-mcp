# Troubleshooting Guide

Common issues and solutions for Multi-Model Advisor MCP Server.

## Port Conflicts

### Error: "EADDRINUSE: address already in use"

**Cause:** Another process is using the port you're trying to use.

**Solutions:**

#### Option 1: Use Different Ports

```bash
# Change both frontend and backend ports
node build/index.js \
  --mcp-transport sse \
  --frontend-port 8080 \
  --backend-port 8081
```

#### Option 2: Find and Kill the Process

**Windows:**
```bash
# Find what's using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

**Linux/Mac:**
```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

#### Option 3: Disable Web UI

If you only need MCP SSE (e.g., for Gemini CLI), disable the Web UI:

```bash
node build/index.js \
  --mcp-transport sse \
  --web-ui false \
  --backend-port 3001
```

### Port Configuration Summary

The server uses separate ports for different services:

| Service | Default Port | Config Option | Environment Variable |
|---------|--------------|---------------|---------------------|
| **Next.js Frontend** | 3000 | `--frontend-port` | `FRONTEND_PORT` |
| **Backend API + MCP SSE** | 3001 | `--backend-port` | `BACKEND_PORT` |
| **Ollama** | 11434 | `--ollama-url` | `OLLAMA_API_URL` |

**Example with all custom ports:**
```bash
node build/index.js \
  --mcp-transport sse \
  --frontend-port 8080 \
  --backend-port 8081 \
  --ollama-url http://localhost:11434
```

## Next.js Errors

### Error: "Invalid source map"

**Message:**
```
[Web UI Error] D:\...\next\dist\server\lib\start-server.js: Invalid source map
```

**Impact:** Warning only, does not affect functionality.

**Cause:** Next.js development build has invalid source maps.

**Solution:** Safe to ignore, or rebuild Next.js dependencies:
```bash
cd web-ui
rm -rf node_modules .next
npm install
```

### Error: "Failed to start server"

**Full error:**
```
[Web UI] Process exited with code 1
```

**Causes:**
1. Port conflict (see above)
2. Missing dependencies
3. Corrupted Next.js cache

**Solutions:**

**1. Check for port conflicts:**
```bash
# Windows
netstat -ano | findstr :3000

# Linux/Mac
lsof -i :3000
```

**2. Reinstall dependencies:**
```bash
cd web-ui
rm -rf node_modules .next package-lock.json
npm install
```

**3. Clear Next.js cache:**
```bash
cd web-ui
rm -rf .next
```

## Ollama Connection Issues

### Error: "Failed to connect to Ollama"

**Symptoms:**
- Health check fails
- Models don't respond
- Connection refused errors

**Solutions:**

**1. Verify Ollama is running:**
```bash
# Check if Ollama is running
curl http://localhost:11434/api/version

# Start Ollama if not running
ollama serve
```

**2. Check Ollama URL:**
```bash
# If Ollama is on different port/host
node build/index.js --ollama-url http://localhost:11434
```

**3. Verify model is installed:**
```bash
# List installed models
ollama list

# Pull model if needed
ollama pull deepseek-r1:1.5b
```

## MCP Connection Issues

### Gemini CLI: "Session not found"

**Cause:** Session timed out or server restarted.

**Solution:**

1. Check if server is running:
```bash
curl http://localhost:3001/mcp/sessions
```

2. Restart Gemini CLI connection.

3. Increase session timeout:
```bash
node build/index.js \
  --mcp-transport sse \
  --mcp-session-timeout 120
```

### Claude Desktop: "Server not responding"

**Cause:** Server not started or wrong transport mode.

**Solution:**

1. Verify stdio mode (Claude Desktop doesn't support SSE):
```json
// claude_desktop_config.json
{
  "mcpServers": {
    "multi-model-advisor": {
      "command": "node",
      "args": ["/absolute/path/to/multi-ai-advisor-mcp/build/index.js"]
    }
  }
}
```

2. Don't use `--mcp-transport sse` for Claude Desktop.

3. Check server logs for errors.

## Database Issues

### Error: "Database locked"

**Cause:** Multiple instances trying to access same database.

**Solution:**

1. Stop all server instances:
```bash
# Windows
taskkill /IM node.exe /F

# Linux/Mac
pkill -f "node.*index.js"
```

2. Start single instance:
```bash
node build/index.js --mcp-transport sse
```

### Error: "Cannot find database"

**Cause:** Database not initialized or wrong path.

**Solution:**

Database is automatically created at `./data/conversations.db`. If missing:

1. Check directory permissions.
2. Ensure `data` directory exists:
```bash
mkdir -p data
```

## Build Errors

### Error: "Cannot find module"

**Cause:** Missing dependencies or incorrect imports.

**Solution:**

1. Reinstall dependencies:
```bash
rm -rf node_modules package-lock.json
npm install
```

2. Rebuild:
```bash
npm run build
```

### Error: "TypeScript compilation failed"

**Cause:** Type errors or syntax errors.

**Solution:**

1. Check TypeScript version:
```bash
npx tsc --version
```

2. Clean and rebuild:
```bash
rm -rf build
npm run build
```

## Configuration Issues

### Models not found

**Error:**
```
Model 'xyz' not found in Ollama
```

**Solution:**

1. List available models:
```bash
ollama list
```

2. Pull missing model:
```bash
ollama pull xyz
```

3. Use exact model name from `ollama list`:
```bash
node build/index.js --models "modelname:tag"
```

### Environment variables not working

**Cause:** `.env` file not loaded or wrong format.

**Solution:**

1. Create `.env` in project root (not in subdirectories).

2. Use correct format:
```bash
# Correct
MCP_TRANSPORT=sse
BACKEND_PORT=3001

# Incorrect (no quotes for simple values)
MCP_TRANSPORT="sse"  # Wrong
```

3. Restart server after changing `.env`.

## Performance Issues

### Slow model responses

**Causes:**
1. Model too large for hardware
2. Too many concurrent jobs
3. Ollama using CPU instead of GPU

**Solutions:**

1. Use smaller model:
```bash
node build/index.js --models deepseek-r1:1.5b
```

2. Reduce concurrent jobs:
```bash
node build/index.js --max-concurrent-jobs 1
```

3. Check Ollama GPU usage:
```bash
ollama list
# Look for GPU indicator
```

### Memory issues

**Error:** Out of memory or system slowdown.

**Solution:**

1. Use smaller models
2. Reduce concurrent jobs
3. Disable Web UI if not needed:
```bash
node build/index.js --web-ui false
```

## Getting Help

If you encounter issues not covered here:

1. **Check logs:** Enable debug mode:
   ```bash
   node build/index.js --debug
   ```

2. **Search existing issues:**
   - [GitHub Issues](https://github.com/YuChenSSR/multi-ai-advisor-mcp/issues)

3. **Report new issue:**
   - Provide debug logs
   - Include configuration
   - Describe steps to reproduce

4. **Check documentation:**
   - [README.md](README.md) - General usage
   - [CLAUDE.md](CLAUDE.md) - Developer guide
   - [GEMINI_CLI.md](GEMINI_CLI.md) - Gemini integration
   - [TEMPLATES.md](TEMPLATES.md) - Template system

## Quick Diagnostic Commands

```bash
# Check all ports
netstat -ano | findstr "3000 3001 11434"  # Windows
lsof -i :3000 -i :3001 -i :11434          # Linux/Mac

# Check Ollama
curl http://localhost:11434/api/version

# Check MCP server
curl http://localhost:3001/mcp/sessions

# Test health
curl http://localhost:3001/api/stats

# View logs with debug
node build/index.js --debug --mcp-transport sse
```
