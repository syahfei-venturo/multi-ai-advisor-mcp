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
import { SSETransportManager, SessionFactory as SSESessionFactory } from '../infrastructure/transport/SSETransportManager.js';
import { StreamableHTTPTransportManager, SessionFactory } from '../infrastructure/transport/StreamableHTTPTransportManager.js';

/**
 * Main MCP Server class that orchestrates all components
 */
export class McpServer implements SessionFactory, SSESessionFactory {
  private server: BaseMcpServer | null = null; // null for HTTP-based modes (per-session servers)
  private conversationService: ConversationService;
  private ollamaService: OllamaService;
  private jobService: JobService;
  private ollamaClient: OllamaApiClient;
  private webServer: WebServer | null = null;
  private conversationRepo: ConversationRepository;
  private jobRepo: JobRepository;
  private dbConnection: ReturnType<typeof getDatabaseConnection>;
  private debugLog: (message: string) => void;
  private sseTransportManager: SSETransportManager | null = null;
  private streamableTransportManager: StreamableHTTPTransportManager | null = null;

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
      config.jobQueue?.maxConcurrentJobs || 3,
      this.jobRepo
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
        this.jobService,
        this.ollamaService,
        this.conversationService,
        config.webUI.backendPort || 3001
      );
    }

    // Setup global job handlers for query-models (used by both MCP and web API)
    this.setupQueryModelsJobHandlers();

    // Create MCP server only for stdio mode
    // For HTTP-based modes (SSE/Streamable), servers are created per-session
    const transportMode = config.mcp?.transport || 'stdio';

    if (transportMode === 'stdio') {
      this.server = new BaseMcpServer({
        name: config.server.name,
        version: config.server.version,
      });

      // Register all tools for stdio mode
      this.registerTools();
    } else if (transportMode === 'sse') {
      // SSE mode (deprecated): setup transport manager
      const sessionTimeout = config.mcp?.sessionTimeoutMinutes || 60;
      this.sseTransportManager = new SSETransportManager(this, sessionTimeout);
    } else if (transportMode === 'streamable') {
      // Streamable HTTP mode (recommended): setup transport manager
      const sessionTimeout = config.mcp?.sessionTimeoutMinutes || 60;
      this.streamableTransportManager = new StreamableHTTPTransportManager(this, sessionTimeout);
    }
  }

  /**
   * Create a new MCP server instance for a session (SessionFactory implementation)
   */
  createServerForSession(sessionId: string): BaseMcpServer {
    this.debugLog(`Creating MCP server for session: ${sessionId}`);

    const server = new BaseMcpServer({
      name: this.config.server.name,
      version: this.config.server.version,
    });

    // Register tools for this session's server
    this.registerToolsForServer(server);

    return server;
  }

  /**
   * Register tools on the default server (stdio mode)
   */
  private registerTools() {
    if (!this.server) {
      throw new Error('Cannot register tools: server not initialized');
    }
    this.registerToolsForServer(this.server);
  }

  /**
   * Setup job handlers for query-models jobs
   * This is called globally so that both MCP and web API jobs are handled
   */
  private setupQueryModelsJobHandlers() {
    const notifyConversationUpdate = (sessionId: string) => {
      this.notifyConversationUpdate(sessionId);
    };

    const notifyJobUpdate = (jobId: string, status: string, sessionId?: string) => {
      this.notifyJobUpdate(jobId, status, sessionId);
    };

    // Setup job execution handler
    this.jobService.onJobStarted(async (job) => {
      if (job.type === 'query-models') {
        let cancellationCheck: NodeJS.Timeout | null = null;
        try {
          const input = job.input as any;
          const { question, system_prompt, model_system_prompts, session_id, include_history } =
            input;

          this.debugLog(`[QueryModels] Job ${job.id} started: question="${question.substring(0, 50)}..."`);

          // Create a cancellation check that monitors the job status
          cancellationCheck = setInterval(() => {
            const currentJob = this.jobService.getJobStatus(job.id);
            if (currentJob && currentJob.status === 'cancelled') {
              if (cancellationCheck) clearInterval(cancellationCheck);
              // Trigger abort if abort controller exists
              const jobWithAbort = currentJob as any;
              if (jobWithAbort.abortController) {
                jobWithAbort.abortController.abort();
              }
              this.debugLog(`[QueryModels] Job ${job.id} cancellation signal received, aborting...`);
            }
          }, 100);

          const result = await this.ollamaService.queryModels(
            {
              question,
              systemPrompt: system_prompt,
              modelSystemPrompts: model_system_prompts,
              sessionId: session_id,
              includeHistory: include_history,
            },
            (percentage, message) => {
              this.jobService.updateProgress(job.id, percentage, message);
            },
            (job as any).abortController?.signal
          );

          if (cancellationCheck) clearInterval(cancellationCheck);
          this.debugLog(`[QueryModels] Job ${job.id} completed successfully`);
          this.jobService.completeJob(job.id, result);
        } catch (error) {
          if (cancellationCheck) clearInterval(cancellationCheck);
          
          const errorMsg = error instanceof Error ? error.message : String(error);
          const isAbortError = errorMsg.includes('aborted') || errorMsg.includes('AbortError') || 
                              (error as any)?.type === 'aborted';
          
          this.debugLog(`[QueryModels] Job ${job.id} failed: ${errorMsg}`);
          
          // Check if it was cancelled
          const currentJob = this.jobService.getJobStatus(job.id);
          if (currentJob?.status === 'cancelled' || isAbortError) {
            this.debugLog(`[QueryModels] Job ${job.id} was cancelled, marking as complete`);
            // Mark job as cancelled instead of failed
            this.jobService.completeJob(job.id, { cancelled: true });
          } else {
            this.jobService.failJob(job.id, errorMsg);
          }
        }
      }
    });

    // Setup job completion handler for real-time notifications
    this.jobService.onJobCompleted(async (job) => {
      if (job.type === 'query-models') {
        const input = job.input as any;
        const sessionId = input.session_id;

        this.debugLog(`[QueryModels] Job ${job.id} completed, notifying session ${sessionId}`);

        // Notify WebUI about conversation update
        notifyConversationUpdate(sessionId);

        // Notify WebUI about job completion
        notifyJobUpdate(job.id, job.status, sessionId);
      }
    });
  }

  /**
   * Register tools on a specific server instance
   */
  private registerToolsForServer(server: BaseMcpServer) {
    // Create notification callback for real-time updates
    const notifyConversationUpdate = (sessionId: string) => {
      this.notifyConversationUpdate(sessionId);
    };

    const notifyJobUpdate = (jobId: string, status: string, sessionId?: string) => {
      this.notifyJobUpdate(jobId, status, sessionId);
    };

    registerQueryModelsTool(
      server,
      this.jobService,
      this.ollamaService,
      this.config.ollama.models,
      this.debugLog,
      notifyConversationUpdate,
      notifyJobUpdate,
      this.conversationRepo
    );

    registerManageConversationTool(server, this.conversationService, notifyConversationUpdate);

    registerHealthCheckTool(
      server,
      this.ollamaClient,
      this.conversationService,
      this.jobService,
      this.dbConnection
    );

    registerJobManagementTools(server, this.jobService);
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

        // Enable MCP transport on web server based on mode
        if (this.sseTransportManager) {
          this.webServer.enableMcpTransport(this.sseTransportManager);
        } else if (this.streamableTransportManager) {
          this.webServer.enableStreamableTransport(this.streamableTransportManager);
        }
      } catch (error) {
        console.error(`⚠️ Failed to start Web UI:`, error);
      }
    }

    // Connect server transport based on mode
    const transportMode = this.config.mcp?.transport || 'stdio';

    if (transportMode === 'stdio') {
      if (!this.server) {
        throw new Error('MCP server not initialized for stdio mode');
      }
      const transport = new StdioServerTransport();

      // Add stdio error handling to prevent unexpected disconnections
      process.stdin.on('error', (error) => {
        console.error('⚠️ stdin error (non-fatal):', error.message);
      });

      process.stdout.on('error', (error) => {
        console.error('⚠️ stdout error (non-fatal):', error.message);
      });

      // Monitor pipe status
      process.stdin.on('end', () => {
        console.error('⚠️ stdin ended - client may have disconnected');
      });

      await this.server.connect(transport);
      console.error(`\n✅ Multi-Model Advisor MCP Server running on stdio`);
      this.debugLog('stdio transport connected successfully');
    } else if (transportMode === 'sse') {
      // SSE mode (deprecated): server runs persistently, clients connect via HTTP
      const backendPort = this.config.webUI?.backendPort || 3001;
      const frontendPort = this.config.webUI?.frontendPort || 3000;
      console.error(`\n✅ Multi-Model Advisor MCP Server running on SSE mode (deprecated)`);
      console.error(`📡 MCP Endpoint: http://localhost:${backendPort}/mcp/sse`);
      console.error(`📋 Session Info: http://localhost:${backendPort}/mcp/sessions`);
      console.error(`🌐 Backend API: http://localhost:${backendPort}`);
      console.error(`🎨 Frontend UI: http://localhost:${frontendPort}`);
      console.error(`⚠️  Note: SSE transport is deprecated. Please migrate to 'streamable' mode.`);
    } else if (transportMode === 'streamable') {
      // Streamable HTTP mode: server runs persistently, clients connect via HTTP
      const backendPort = this.config.webUI?.backendPort || 3001;
      const frontendPort = this.config.webUI?.frontendPort || 3000;
      console.error(`\n✅ Multi-Model Advisor MCP Server running on Streamable HTTP mode`);
      console.error(`📡 MCP Endpoint: http://localhost:${backendPort}/mcp`);
      console.error(`📋 Session Info: http://localhost:${backendPort}/mcp/sessions`);
      console.error(`🌐 Backend API: http://localhost:${backendPort}`);
      console.error(`🎨 Frontend UI: http://localhost:${frontendPort}`);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.error('\n👋 Shutting down gracefully...');

    // Close all sessions based on mode
    if (this.sseTransportManager) {
      await this.sseTransportManager.closeAll();
    }
    if (this.streamableTransportManager) {
      await this.streamableTransportManager.closeAll();
    }

    // Stop Web Server
    if (this.webServer) {
      await this.webServer.stop();
    }

    // Close main server if stdio mode
    if (this.server) {
      await this.server.close();
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
  notifyJobUpdate(jobId: string, status: string, sessionId?: string) {
    if (this.webServer) {
      this.webServer.notifyJobUpdate(jobId, status, sessionId);
    }
  }
}
