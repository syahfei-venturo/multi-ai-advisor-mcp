# MCP Client Examples

This directory contains example clients for connecting to the Multi-Model Advisor MCP server.

## Prerequisites

1. Build the project:
   ```bash
   npm run build
   ```

2. Ensure Ollama is running with the required models:
   ```bash
   ollama serve
   ollama pull deepseek-r1:1.5b
   ```

## SSE Client Example

The SSE (Server-Sent Events) client demonstrates how to connect to a persistent MCP server over HTTP instead of using stdio.

### Start the Server

First, start the MCP server in SSE mode:

```bash
# Option 1: Using environment variable
MCP_TRANSPORT=sse node build/index.js

# Option 2: Using CLI argument
node build/index.js --mcp-transport sse
```

You should see:
```
✅ Multi-Model Advisor MCP Server running on SSE mode
📡 MCP Endpoint: http://localhost:3001/mcp/sse
📋 Session Info: http://localhost:3001/mcp/sessions
🌐 Web UI: http://localhost:3001
```

### Run the Client

In a **separate terminal**, run the example client:

```bash
node build/examples/sse-client.js
```

### What the Client Does

The example client demonstrates:
1. **Connecting** to the SSE-based MCP server
2. **Listing** available tools
3. **Querying models** with a question
4. **Health check** to verify server status
5. **Managing conversations** to view history
6. **Disconnecting** gracefully

## Monitoring Active Sessions

While the server is running, you can view active MCP sessions:

```bash
# Using curl
curl http://localhost:3001/mcp/sessions

# Or open in browser
open http://localhost:3001/mcp/sessions
```

Response example:
```json
{
  "success": true,
  "activeSessionCount": 2,
  "sessions": [
    {
      "sessionId": "client-1234567890",
      "createdAt": "2025-01-15T10:30:00.000Z",
      "lastActivity": "2025-01-15T10:31:00.000Z",
      "ageMinutes": 5,
      "inactiveMinutes": 0
    }
  ]
}
```

## Differences: stdio vs SSE

| Feature | stdio (Default) | SSE (Persistent) |
|---------|----------------|------------------|
| **Connection** | Process spawn per client | HTTP/SSE connection |
| **Server Lifecycle** | Dies with client | Persistent server |
| **Multi-Client** | No (1 client per process) | Yes (multiple clients) |
| **State Sharing** | No (isolated processes) | Yes (shared database & queue) |
| **Discovery** | Requires Claude Desktop config | HTTP endpoint |
| **Monitoring** | Limited | `/mcp/sessions` endpoint |
| **Use Case** | Claude Desktop integration | Programmatic access, APIs |

## Advanced: Custom Client

You can build your own client using the MCP SDK:

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

const transport = new SSEClientTransport(
  new URL('http://localhost:3001/mcp/sse/my-session-id')
);

const client = new Client({
  name: 'my-custom-client',
  version: '1.0.0',
}, {
  capabilities: { tools: {} },
});

await client.connect(transport);

// Use the client
const result = await client.callTool({
  name: 'query-models',
  arguments: { question: 'Hello!', async: false },
});

console.log(result);

await client.close();
```

## Configuration

### Server Configuration

Configure SSE transport via:

1. **Environment variables** (`.env`):
   ```bash
   MCP_TRANSPORT=sse
   MCP_SESSION_TIMEOUT_MINUTES=60
   WEB_UI_PORT=3001
   ```

2. **CLI arguments**:
   ```bash
   node build/index.js \
     --mcp-transport sse \
     --mcp-session-timeout 60 \
     --web-ui-port 3001
   ```

### Session Timeout

Sessions automatically timeout after inactivity:
- Default: 60 minutes
- Configurable: 5-1440 minutes (24 hours max)
- Cleanup runs every 5 minutes

## Troubleshooting

### "Connection refused"

Make sure the server is running in SSE mode:
```bash
node build/index.js --mcp-transport sse
```

### "Session not found"

The session may have timed out. Restart the client with a new session ID.

### Port already in use

Change the port:
```bash
node build/index.js --mcp-transport sse --web-ui-port 3002
```

### Can't connect from remote machine

The server binds to `localhost` by default. To allow remote connections, you'll need to modify `WebServer.ts` to bind to `0.0.0.0`.

## Next Steps

- Check out the [main README](../README.md) for more information
- Read about [Templates](../TEMPLATES.md) for prompt formatting
- Explore the [Web UI](http://localhost:3001) when the server is running
