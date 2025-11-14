import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ConversationService } from '../../application/services/ConversationService.js';
import { JobService } from '../../application/services/JobService.js';
import { OllamaApiClient } from '../../infrastructure/http/OllamaApiClient.js';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection.js';

/**
 * Register the health-check tool
 */
export function registerHealthCheckTool(
  server: McpServer,
  ollamaClient: OllamaApiClient,
  conversationService: ConversationService,
  jobService: JobService,
  dbConnection: DatabaseConnection
) {
  server.tool(
    'health-check',
    'Check the health of the MCP server and its components (Ollama connectivity, database status, circuit breaker state)',
    {},
    async () => {
      try {
        const health: any = {
          timestamp: new Date().toISOString(),
          status: 'healthy',
          components: {
            database: {
              status: 'unknown',
              message: '',
            },
            ollama: {
              status: 'unknown',
              message: '',
            },
            circuitBreaker: {
              state: ollamaClient.getCircuitBreakerState(),
              stats: ollamaClient.getCircuitBreakerStats(),
            },
            conversation: {
              sessions: conversationService.getAllSessions().length,
              totalMessages: conversationService
                .getAllSessions()
                .reduce((sum, id) => sum + conversationService.getHistory(id).length, 0),
            },
            jobQueue: {
              statistics: jobService.getStatistics(),
            },
          },
        };

        // Check database
        try {
          const stats = dbConnection.getStatistics();
          health.components.database = {
            status: 'healthy',
            message: `Database connected - ${stats.totalMessages} messages in ${stats.totalSessions} sessions`,
            statistics: stats,
          };
        } catch (error) {
          health.components.database = {
            status: 'error',
            message: (error as Error).message,
          };
          health.status = 'degraded';
        }

        // Check Ollama connectivity
        try {
          const isHealthy = await ollamaClient.healthCheck();
          if (isHealthy) {
            const data = await ollamaClient.listModels();
            health.components.ollama = {
              status: 'healthy',
              message: `Ollama is running with ${data.models.length} models available`,
              models_count: data.models.length,
            };
          } else {
            throw new Error('Health check failed');
          }
        } catch (error) {
          health.components.ollama = {
            status: 'error',
            message: (error as Error).message,
          };
          health.status = 'degraded';
        }

        return {
          content: [
            {
              type: 'text',
              text: `# System Health Check\n\n\`\`\`json\n${JSON.stringify(health, null, 2)}\n\`\`\``,
            },
          ],
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Health check error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
