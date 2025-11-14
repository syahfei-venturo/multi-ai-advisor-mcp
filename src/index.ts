#!/usr/bin/env node

/**
 * Multi-Model Advisor MCP Server - Entry Point
 *
 * This is the main entry point for the MCP server.
 * All application logic has been refactored into modular components.
 */

import { getConfig, printConfigInfo } from './config.js';
import { McpServer } from './presentation/McpServer.js';

async function main() {
  try {
    // Load configuration
    const config = getConfig();

    // Print configuration info
    printConfigInfo(config);

    // Create and start MCP server
    const mcpServer = new McpServer(config);
    await mcpServer.start();

    // Print statistics
    mcpServer.printStats();

    // Setup graceful shutdown
    process.on('SIGINT', () => mcpServer.shutdown());
  } catch (error) {
    console.error('Fatal error in main():', error);
    process.exit(1);
  }
}

// Start the server
main();
