#!/usr/bin/env node

/**
 * Multi-Model Advisor MCP Server - Entry Point
 *
 * This is the main entry point for the MCP server.
 * All application logic has been refactored into modular components.
 */

import { getConfig, printConfigInfo } from './config.js';
import { McpServer } from './presentation/McpServer.js';
import { WebServerManager } from './infrastructure/web/WebServerManager.js';

async function main() {
  let mcpServer: McpServer | null = null;
  let webServer: WebServerManager | null = null;

  try {
    // Load configuration
    const config = getConfig();

    // Print configuration info
    printConfigInfo(config);

    // Create and start Web UI server (if enabled)
    if (config.webUI?.enabled) {
      webServer = new WebServerManager(true, config.webUI.frontendPort);
      await webServer.start();
    }

    // Create and start MCP server
    mcpServer = new McpServer(config);
    await mcpServer.start();

    // Print statistics
    mcpServer.printStats();

    // If running in SSE mode, keep the process alive
    if (config.mcp?.transport === 'sse') {
      console.error('\n🚀 Server is running. Press Ctrl+C to stop.\n');
    }

    // Setup graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`\n\n📛 Received ${signal}, shutting down gracefully...`);

      // Stop MCP server first
      if (mcpServer) {
        await mcpServer.shutdown();
      }

      // Then stop web server
      if (webServer && webServer.isRunning()) {
        await webServer.stop();
      }

      console.log('👋 Goodbye!\n');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Also handle uncaught errors
    process.on('uncaughtException', async (error) => {
      console.error('💥 Uncaught Exception:', error);
      await shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
      await shutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    console.error('💥 Fatal error in main():', error);

    // Cleanup on error
    if (webServer && webServer.isRunning()) {
      await webServer.stop();
    }

    process.exit(1);
  }
}

// Start the server
main();
