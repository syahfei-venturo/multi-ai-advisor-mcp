import express, { Express, Request, Response } from 'express';
import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { spawn, ChildProcess } from 'child_process';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import type { IConversationRepository } from '../../core/interfaces/IConversationRepository.js';
import type { IJobRepository } from '../../core/interfaces/IJobRepository.js';
import type { SSETransportManager } from '../transport/SSETransportManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class WebServer {
  private app: Express;
  private httpServer: HttpServer | null = null;
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private nextJsProcess: ChildProcess | null = null;
  private sseTransportManager: SSETransportManager | null = null;

  constructor(
    private conversationRepo: IConversationRepository,
    private jobRepo: IJobRepository,
    private backendPort: number = 3001,
    private frontendPort: number = 3000
  ) {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Enable SSE-based MCP transport
   */
  public enableMcpTransport(manager: SSETransportManager): void {
    this.sseTransportManager = manager;
    this.setupMcpRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../../../public')));
  }

  private setupRoutes(): void {
    // Serve main page
    this.app.get('/', (req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, '../../../public/index.html'));
    });

    // API: Get all conversations
    this.app.get('/api/conversations', (req: Request, res: Response) => {
      try {
        const sessionId = req.query.session_id as string | undefined;
        const conversations = sessionId
          ? this.conversationRepo.getHistory(sessionId)
          : this.conversationRepo.getAllConversations();
        res.json({ success: true, data: conversations });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API: Get all unique session IDs
    this.app.get('/api/sessions', (req: Request, res: Response) => {
      try {
        const sessions = this.conversationRepo.getAllSessions();
        res.json({ success: true, data: sessions });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API: Clear conversation history
    this.app.delete('/api/conversations/:sessionId', (req: Request, res: Response) => {
      try {
        const { sessionId } = req.params;
        this.conversationRepo.clearHistory(sessionId);
        this.broadcast({ type: 'conversation_cleared', sessionId });
        res.json({ success: true, message: 'Conversation cleared' });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API: Get all jobs
    this.app.get('/api/jobs', (req: Request, res: Response) => {
      try {
        const jobs = this.jobRepo.getAllJobs();
        // Convert Job objects to serializable format
        const serializedJobs = jobs.map(job => ({
          id: job.id,
          type: job.type,
          status: job.status,
          progress: job.progress,
          created_at: job.createdAt.toISOString(),
          started_at: job.startedAt?.toISOString(),
          completed_at: job.completedAt?.toISOString(),
          question: job.input?.question || '',
          results: job.result ? JSON.stringify(job.result) : null,
          error: job.error
        }));
        res.json({ success: true, data: serializedJobs });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API: Get job by ID
    this.app.get('/api/jobs/:id', (req: Request, res: Response) => {
      try {
        const job = this.jobRepo.getJob(req.params.id);
        if (!job) {
          res.status(404).json({ success: false, error: 'Job not found' });
          return;
        }
        res.json({ success: true, data: job });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API: Cancel job
    this.app.post('/api/jobs/:id/cancel', (req: Request, res: Response) => {
      try {
        this.jobRepo.updateJobStatus(req.params.id, 'cancelled');
        this.broadcast({ type: 'job_cancelled', jobId: req.params.id });
        res.json({ success: true, message: 'Job cancelled' });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // API: Get statistics
    this.app.get('/api/stats', (req: Request, res: Response) => {
      try {
        const jobs = this.jobRepo.getAllJobs();
        const stats = {
          totalJobs: jobs.length,
          completedJobs: jobs.filter(j => j.status === 'completed').length,
          failedJobs: jobs.filter(j => j.status === 'failed').length,
          runningJobs: jobs.filter(j => j.status === 'running').length,
          pendingJobs: jobs.filter(j => j.status === 'pending').length,
          totalConversations: this.conversationRepo.getAllSessions().length
        };
        res.json({ success: true, data: stats });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });
  }

  /**
   * Setup MCP SSE routes
   */
  private setupMcpRoutes(): void {
    if (!this.sseTransportManager) {
      console.warn('[WebServer] SSE Transport Manager not initialized');
      return;
    }

    // SSE endpoint - establishes SSE connection (with sessionId)
    this.app.get('/mcp/sse/:sessionId', async (req: Request, res: Response) => {
      try {
        const sessionId = await this.sseTransportManager!.handleSSEConnection(req, res);
        console.log(`[WebServer] MCP SSE connection established: ${sessionId}`);
      } catch (error) {
        console.error('[WebServer] Error establishing SSE connection:', error);
        res.status(500).json({
          error: 'Failed to establish SSE connection',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // SSE endpoint - establishes SSE connection (auto-generate sessionId)
    this.app.get('/mcp/sse', async (req: Request, res: Response) => {
      try {
        const sessionId = await this.sseTransportManager!.handleSSEConnection(req, res);
        console.log(`[WebServer] MCP SSE connection established: ${sessionId}`);
      } catch (error) {
        console.error('[WebServer] Error establishing SSE connection:', error);
        res.status(500).json({
          error: 'Failed to establish SSE connection',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // POST message endpoint - receives messages from client
    this.app.post('/mcp/messages/:sessionId', async (req: Request, res: Response) => {
      try {
        await this.sseTransportManager!.handlePostMessage(req, res);
      } catch (error) {
        console.error('[WebServer] Error handling POST message:', error);
        res.status(500).json({
          error: 'Failed to handle message',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Session info endpoint (for debugging)
    this.app.get('/mcp/sessions', (req: Request, res: Response) => {
      try {
        const sessions = this.sseTransportManager!.getSessionInfo();
        res.json({
          success: true,
          activeSessionCount: this.sseTransportManager!.getActiveSessionCount(),
          sessions
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    console.log('[WebServer] MCP SSE routes registered:');
    console.log('  GET  /mcp/sse - Establish SSE connection (auto-generate session)');
    console.log('  GET  /mcp/sse/:sessionId - Establish SSE connection (specific session)');
    console.log('  POST /mcp/messages/:sessionId - Send messages');
    console.log('  GET  /mcp/sessions - View active sessions');
  }

  private setupWebSocket(): void {
    if (!this.httpServer) return;

    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebServer] New WebSocket client connected');
      this.clients.add(ws);

      ws.on('close', () => {
        console.log('[WebServer] WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebServer] WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Send initial connection confirmation
      ws.send(JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() }));
    });
  }

  public broadcast(message: any): void {
    const payload = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    });
  }

  public notifyConversationUpdate(sessionId: string): void {
    this.broadcast({
      type: 'conversation_updated',
      sessionId,
      timestamp: new Date().toISOString()
    });
  }

  public notifyJobUpdate(jobId: string, status: string): void {
    this.broadcast({
      type: 'job_updated',
      jobId,
      status,
      timestamp: new Date().toISOString()
    });
  }

  private startNextJs(): void {
    const webUiPath = path.join(__dirname, '../../../web-ui');

    // Check if web-ui directory exists
    if (!fs.existsSync(webUiPath)) {
      console.log('[WebServer] Next.js web-ui directory not found, skipping...');
      return;
    }

    // Check if node_modules exists
    const nodeModulesPath = path.join(webUiPath, 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
      console.log('[WebServer] Next.js dependencies not installed. Run: cd web-ui && npm install');
      return;
    }

    console.log('[WebServer] Starting Next.js dev server...');

    // Spawn Next.js process
    const isWindows = process.platform === 'win32';
    const npmCmd = isWindows ? 'npm.cmd' : 'npm';

    // Pass frontend port as environment variable
    const env = {
      ...process.env,
      PORT: String(this.frontendPort),
      NEXT_PUBLIC_API_URL: `http://localhost:${this.backendPort}`
    };

    this.nextJsProcess = spawn(npmCmd, ['run', 'dev'], {
      cwd: webUiPath,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
      shell: isWindows,
      env,
    });

    // Handle Next.js output
    this.nextJsProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output.includes('Local:') || output.includes('Ready')) {
        console.log(`[Next.js] ${output}`);
      }
    });

    this.nextJsProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      // Only log errors, not warnings
      if (output.includes('Error') || output.includes('error')) {
        console.error(`[Next.js] ${output}`);
      }
    });

    this.nextJsProcess.on('error', (error) => {
      console.error('[Next.js] Failed to start:', error);
      this.nextJsProcess = null;
    });

    this.nextJsProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[Next.js] Process exited with code ${code}`);
      }
      this.nextJsProcess = null;
    });
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer = this.app.listen(this.backendPort, () => {
          console.log(`[WebServer] Backend API available at http://localhost:${this.backendPort}`);
          this.setupWebSocket();

          // Start Next.js automatically
          this.startNextJs();

          resolve();
        });

        this.httpServer.on('error', (error) => {
          console.error('[WebServer] Server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      // Stop Next.js process
      if (this.nextJsProcess) {
        console.log('[WebServer] Stopping Next.js dev server...');
        this.nextJsProcess.kill('SIGTERM');
        this.nextJsProcess = null;
      }

      // Close all WebSocket connections
      this.clients.forEach((client) => {
        client.close();
      });
      this.clients.clear();

      // Close WebSocket server
      if (this.wss) {
        this.wss.close(() => {
          console.log('[WebServer] WebSocket server closed');
        });
      }

      // Close HTTP server
      if (this.httpServer) {
        this.httpServer.close(() => {
          console.log('[WebServer] HTTP server closed');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}