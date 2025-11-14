import { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Config } from '../config.js';
import { initializeDatabase, getDatabaseConnection, closeDatabase } from '../infrastructure/database/DatabaseConnection.js';
import { ConversationRepository } from '../infrastructure/database/repositories/ConversationRepository.js';
import { JobRepository } from '../infrastructure/database/repositories/JobRepository.js';
import { OllamaApiClient } from '../infrastructure/http/OllamaApiClient.js';
import { JobQueue } from '../infrastructure/queue/JobQueue.js';
import { WebServer } from '../infrastructure/web/WebServer.js';
import { ConversationService } from '../application/services/ConversationService.js';
import { OllamaService } from '../application/services/OllamaService.js';
import { JobService } from '../application/services/JobService.js';
import { CircuitBreaker, DEFAULT_RETRY_CONFIG } from '../utils/retry.js';
import { registerQueryModelsTool } from './tools/QueryModelsTool.js';
import { registerManageConversationTool } from './tools/ManageConversationTool.js';
import { registerHealthCheckTool } from './tools/HealthCheckTool.js';
import { registerJobManagementTools } from './tools/JobManagementTools.js';

/**
 * Main MCP Server class that orchestrates all components
 */
export class McpServer {
  private server: BaseMcpServer;
  private conversationService: ConversationService;
  private ollamaService: OllamaService;
  private jobService: JobService;
  private ollamaClient: OllamaApiClient;
  private webServer: WebServer | null = null;
  private conversationRepo: ConversationRepository;
  private jobRepo: JobRepository;
  private dbConnection: ReturnType<typeof getDatabaseConnection>;
  private debugLog: (message: string) => void;

  constructor(private config: Config) {
    // Initialize debug logger
    this.debugLog = (message: string) => {
      if (config.server.debug) {
        console.error(`[DEBUG] ${message}`);
      }
    };

    // Initialize database
    initializeDatabase();
    this.dbConnection = getDatabaseConnection();
    const db = this.dbConnection.getDatabase();

    // Initialize repositories
    this.conversationRepo = new ConversationRepository(db);
    this.jobRepo = new JobRepository(db);

    // Initialize infrastructure
    const retryConfig = config.jobQueue
      ? {
          maxAttempts: config.jobQueue.defaultRetryAttempts,
          initialDelayMs: config.jobQueue.defaultInitialDelayMs,
          maxDelayMs: config.jobQueue.defaultMaxDelayMs,
          multiplier: 2,
          timeoutMs: 500000,
        }
      : DEFAULT_RETRY_CONFIG;

    const circuitBreaker = new CircuitBreaker(5, 60000);
    this.ollamaClient = new OllamaApiClient(
      config.ollama.apiUrl,
      circuitBreaker,
      retryConfig
    );

    const jobQueue = new JobQueue(
      config.jobQueue?.maxConcurrentJobs || 3
    );

    // Initialize services
    this.conversationService = new ConversationService(this.conversationRepo);
    this.ollamaService = new OllamaService(
      this.ollamaClient,
      this.conversationService,
      config.ollama.models,
      config.prompts,
      config.templates
    );
    this.jobService = new JobService(jobQueue, this.jobRepo);

    // Initialize Web Server if enabled
    if (config.webUI?.enabled) {
      this.webServer = new WebServer(
        this.conversationRepo,
        this.jobRepo,
        config.webUI.port || 3000
      );
    }

    // Create MCP server
    this.server = new BaseMcpServer({
      name: config.server.name,
      version: config.server.version,
    });

    // Register all tools
    this.registerTools();
  }

  /**
   * Register all MCP tools
   */
  private registerTools() {
    registerQueryModelsTool(
      this.server,
      this.jobService,
      this.ollamaService,
      this.config.ollama.models,
      this.debugLog
    );

    registerManageConversationTool(this.server, this.conversationService);

    registerHealthCheckTool(
      this.server,
      this.ollamaClient,
      this.conversationService,
      this.jobService,
      this.dbConnection
    );

    registerJobManagementTools(this.server, this.jobService);
  }

  /**
   * Load existing sessions from database
   */
  private async loadExistingSessions() {
    try {
      this.conversationService.loadExistingSessions();
      const sessions = this.conversationService.getAllSessions();

      if (sessions.length > 0) {
        const totalMessages = sessions.reduce(
          (sum, id) => sum + this.conversationService.getHistory(id).length,
          0
        );
        console.error(
          `✅ Database: Loaded ${sessions.length} existing sessions with ${totalMessages} messages`
        );
      }
    } catch (error) {
      console.error(`⚠️ Database: Error loading existing sessions:`, error);
    }
  }

  /**
   * Restore incomplete jobs from database
   */
  private async restoreIncompleteJobs() {
    try {
      await this.jobService.restoreIncompleteJobs();
    } catch (error) {
      console.error(`⚠️ Database: Error restoring jobs:`, error);
    }
  }

  /**
   * Print database statistics
   */
  printStats() {
    const stats = this.dbConnection.getStatistics();
    console.error(
      `📊 Database Statistics: ${stats.totalSessions} sessions, ${stats.totalMessages} messages, ${(stats.databaseSize / 1024).toFixed(2)} KB`
    );
    if (stats.jobStats) {
      console.error(
        `📋 Job Statistics: ${stats.totalJobs} total, ${stats.jobStats.pending} pending, ${stats.jobStats.running} running, ${stats.jobStats.completed} completed, ${stats.jobStats.failed} failed`
      );
    }
  }

  /**
   * Start the MCP server
   */
  async start() {
    this.debugLog(`Database initialized at: ${this.dbConnection.getDatabasePath()}`);

    // Load existing data
    await this.loadExistingSessions();
    await this.restoreIncompleteJobs();

    // Start Web Server if enabled
    if (this.webServer) {
      try {
        await this.webServer.start();
      } catch (error) {
        console.error(`⚠️ Failed to start Web UI:`, error);
      }
    }

    // Connect server transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error(`\n✅ Multi-Model Advisor MCP Server running on stdio`);
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.error('\n👋 Shutting down gracefully...');

    // Stop Web Server
    if (this.webServer) {
      await this.webServer.stop();
    }

    closeDatabase();
    process.exit(0);
  }

  /**
   * Notify web UI of conversation updates
   */
  notifyConversationUpdate(sessionId: string) {
    if (this.webServer) {
      this.webServer.notifyConversationUpdate(sessionId);
    }
  }

  /**
   * Notify web UI of job updates
   */
  notifyJobUpdate(jobId: string, status: string) {
    if (this.webServer) {
      this.webServer.notifyJobUpdate(jobId, status);
    }
  }
}
