/**
 * Streamable HTTP Transport Manager
 *
 * Manages multiple Streamable HTTP-based MCP client connections to a persistent server.
 * Each client gets its own session with isolated transport and server instance.
 *
 * This replaces the deprecated SSE transport with the new Streamable HTTP standard.
 */

import { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

export interface McpSession {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  server: BaseMcpServer;
  createdAt: Date;
  lastActivity: Date;
  heartbeatInterval?: NodeJS.Timeout;
}

export interface SessionFactory {
  createServerForSession(sessionId: string): BaseMcpServer;
}

const SESSION_ID_HEADER_NAME = 'mcp-session-id';

export class StreamableHTTPTransportManager {
  private sessions = new Map<string, McpSession>();
  private sessionFactory: SessionFactory;
  private sessionTimeout: number; // milliseconds

  constructor(sessionFactory: SessionFactory, sessionTimeoutMinutes = 60) {
    this.sessionFactory = sessionFactory;
    this.sessionTimeout = sessionTimeoutMinutes * 60 * 1000;

    // Cleanup stale sessions every 5 minutes
    setInterval(() => this.cleanupStaleSessions(), 5 * 60 * 1000);
  }

  /**
   * Handle GET request (for SSE streaming, optional)
   * This server does NOT support SSE streaming - always returns 405
   */
  async handleGetRequest(req: Request, res: Response): Promise<void> {
    // Streamable HTTP spec: Servers may optionally not support GET/SSE
    // This server only supports POST requests
    res.status(405)
      .set('Allow', 'POST')
      .json({
        error: 'Method Not Allowed',
        message: 'This server does not offer SSE streams. Use POST for all requests.',
      });
  }

  /**
   * Handle POST request
   * Creates new session on initialize, or reuses existing session
   */
  async handlePostRequest(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers[SESSION_ID_HEADER_NAME] as string | undefined;

    try {
      // Reuse existing session
      if (sessionId && this.sessions.has(sessionId)) {
        const session = this.sessions.get(sessionId)!;
        session.lastActivity = new Date();
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      // Create new session (client may provide session ID or we generate one)
      // The StreamableHTTPClientTransport sends a session ID on first request
      const newSessionId = sessionId || randomUUID();

      // Debug: Log request details to help identify the source
      console.log(`[StreamableHTTP] New session request from:`, {
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.headers['user-agent'],
        origin: req.headers['origin'],
        referer: req.headers['referer']
      });

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
      });

      const server = this.sessionFactory.createServerForSession(newSessionId);

      const session: McpSession = {
        sessionId: newSessionId,
        transport,
        server,
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      // Store session BEFORE connecting to avoid race conditions
      this.sessions.set(newSessionId, session);

      // Connect server to transport
      await server.connect(transport);

      console.log(`[StreamableHTTP] New session created: ${newSessionId}`);

      // Let the transport handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[StreamableHTTP] Error handling request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal server error',
          details: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Remove a session and cleanup resources
   */
  private async removeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Remove from map FIRST to prevent circular calls
    this.sessions.delete(sessionId);

    try {
      // Clear heartbeat interval
      if (session.heartbeatInterval) {
        clearInterval(session.heartbeatInterval);
      }

      await session.server.close();
      console.log(`[StreamableHTTP] Session removed: ${sessionId}`);
    } catch (error) {
      console.error(`[StreamableHTTP] Error removing session ${sessionId}:`, error);
    }
  }

  /**
   * Cleanup sessions that have been inactive for too long
   */
  private cleanupStaleSessions(): void {
    const now = Date.now();
    const staleSessionIds: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      const inactiveMs = now - session.lastActivity.getTime();
      if (inactiveMs > this.sessionTimeout) {
        staleSessionIds.push(sessionId);
      }
    }

    if (staleSessionIds.length > 0) {
      console.log(`[StreamableHTTP] Cleaning up ${staleSessionIds.length} stale sessions`);
      staleSessionIds.forEach(id => this.removeSession(id));
    }
  }

  /**
   * Get session info (for debugging/monitoring)
   */
  getSessionInfo(): Array<{
    sessionId: string;
    createdAt: Date;
    lastActivity: Date;
    ageMinutes: number;
    inactiveMinutes: number;
  }> {
    const now = Date.now();
    return Array.from(this.sessions.values()).map(session => ({
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      ageMinutes: Math.floor((now - session.createdAt.getTime()) / 60000),
      inactiveMinutes: Math.floor((now - session.lastActivity.getTime()) / 60000),
    }));
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Close all sessions and cleanup
   */
  async closeAll(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.removeSession(id)));
  }
}
