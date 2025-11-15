/**
 * Example MCP Streamable HTTP Client
 *
 * This example demonstrates how to connect to the Multi-Model Advisor MCP server
 * using Streamable HTTP transport (the new recommended standard).
 *
 * Usage:
 *   1. Start the server with Streamable mode:
 *      npm run build
 *      node build/index.js --mcp-transport streamable
 *
 *   2. Run this client:
 *      npm run build
 *      node build/examples/streamable-client.js
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

async function main() {
  const serverUrl = 'http://localhost:3001';
  const endpoint = `${serverUrl}/mcp`;

  console.log('🔌 Connecting to MCP server via Streamable HTTP...');
  console.log(`   Server URL: ${endpoint}\n`);

  // Create Streamable HTTP transport
  const transport = new StreamableHTTPClientTransport(new URL(endpoint));

  // Create MCP client
  const client = new Client({
    name: 'streamable-example-client',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {},
    },
  });

  try {
    // Connect to server
    await client.connect(transport);
    console.log('✅ Connected to MCP server!\n');

    // List available tools
    const toolsResponse = await client.listTools();
    console.log('📋 Available tools:');
    toolsResponse.tools.forEach((tool, index) => {
      console.log(`   ${index + 1}. ${tool.name}`);
      console.log(`      ${tool.description || 'No description'}`);
    });
    console.log();

    // Example 1: Query models with a simple question
    console.log('🤖 Example 1: Querying models...');
    const queryResult = await client.callTool({
      name: 'query-models',
      arguments: {
        question: 'What is the capital of France?',
        models: ['deepseek-r1:1.5b'],
        use_history: false,
        async: false,
      },
    });
    console.log('Response:', JSON.stringify(queryResult, null, 2));
    console.log();

    // Example 2: Health check
    console.log('🏥 Example 2: Health check...');
    const healthResult = await client.callTool({
      name: 'health-check',
      arguments: {},
    });
    console.log('Health status:', JSON.stringify(healthResult, null, 2));
    console.log();

    // Example 3: Get conversation history
    console.log('💬 Example 3: Get conversation history...');
    const conversationResult = await client.callTool({
      name: 'manage-conversation',
      arguments: {
        action: 'get',
      },
    });
    console.log('Conversation:', JSON.stringify(conversationResult, null, 2));
    console.log();

    console.log('✅ All examples completed successfully!');

    // Close connection
    await client.close();
    console.log('👋 Disconnected from server');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
