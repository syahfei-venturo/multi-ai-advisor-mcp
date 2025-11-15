/**
 * SSE Transport Manager
 *
 * Manages multiple SSE-based MCP client connections to a persistent server.
 * Each client gets its own session with isolated transport and server instance.
 */

import { McpServer as BaseMcpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

export interface McpSession {
  sessionId: string;
  transport: SSEServerTransport;
  server: BaseMcpServer;
  createdAt: Date;
  lastActivity: Date;
  heartbeatInterval?: NodeJS.Timeout;
}

export interface SessionFactory {
  createServerForSession(sessionId: string): BaseMcpServer;
}

export class SSETransportManager {
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
   * Handle SSE connection (GET request)
   * Creates new session or returns existing one
   */
  async handleSSEConnection(req: Request, res: Response): Promise<string> {
    const sessionId = req.params.sessionId || randomUUID();

    let session = this.sessions.get(sessionId);

    if (!session) {
      // Create new session
      const endpoint = `/mcp/messages/${sessionId}`;
      const transport = new SSEServerTransport(endpoint, res);
      const server = this.sessionFactory.createServerForSession(sessionId);

      session = {
        sessionId,
        transport,
        server,
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      this.sessions.set(sessionId, session);

      // Handle transport closure BEFORE connecting
      // (must be set before connect() to catch any immediate errors)
      transport.onclose = () => {
        console.error(`[SSETransportManager] Transport closed for session: ${sessionId}`);
        // Mark session as disconnected but don't remove immediately
        // This allows client to reconnect with same session ID
        const existingSession = this.sessions.get(sessionId);
        if (existingSession) {
          existingSession.lastActivity = new Date();
          console.error(`[SSETransportManager] Session ${sessionId} marked for cleanup (will timeout if not reconnected)`);
        }
      };

      // Connect server to transport
      // NOTE: server.connect() automatically calls transport.start()
      await server.connect(transport);

      // Setup heartbeat to keep connection alive (every 30 seconds)
      session.heartbeatInterval = setInterval(() => {
        const currentSession = this.sessions.get(sessionId);
        if (currentSession) {
          // SSE comment keeps connection alive
          // Transport will handle sending keep-alive messages
          console.error(`[SSETransportManager] Heartbeat for session: ${sessionId}`);
        } else {
          // Session was removed, clear interval
          const sessionToClean = this.sessions.get(sessionId);
          if (sessionToClean?.heartbeatInterval) {
            clearInterval(sessionToClean.heartbeatInterval);
          }
        }
      }, 30000); // 30 seconds

      console.error(`[SSETransportManager] New session created: ${sessionId}`);
    } else {
      // Update existing session with new response object
      session.lastActivity = new Date();
      // Note: SSEServerTransport doesn't support response replacement
      // Client should use the same SSE connection
      console.error(`[SSETransportManager] Reusing existing session: ${sessionId}`);
    }

    return sessionId;
  }

  /**
   * Handle POST messages from client
   */
  async handlePostMessage(req: Request, res: Response): Promise<void> {
    const sessionId = req.params.sessionId;
    const session = this.sessions.get(sessionId);

    if (!session) {
      res.status(404).json({
        error: 'Session not found',
        sessionId,
        hint: 'Connect to GET /mcp/sse/:sessionId first'
      });
      return;
    }

    session.lastActivity = new Date();

    try {
      // Forward message to the session's transport
      await session.transport.handlePostMessage(req, res, req.body);
    } catch (error) {
      console.error(`[SSETransportManager] Error handling message for session ${sessionId}:`, error);
      res.status(500).json({
        error: 'Failed to process message',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Remove a session and cleanup resources
   */
  private async removeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // CRITICAL: Remove from map FIRST to prevent circular calls
    // (transport.close() triggers onclose which would call removeSession again)
    this.sessions.delete(sessionId);

    try {
      // Clear heartbeat interval
      if (session.heartbeatInterval) {
        clearInterval(session.heartbeatInterval);
      }

      // Clear the onclose handler to prevent re-entry
      session.transport.onclose = undefined;

      await session.transport.close();
      await session.server.close();
      console.error(`[SSETransportManager] Session removed: ${sessionId}`);
    } catch (error) {
      console.error(`[SSETransportManager] Error removing session ${sessionId}:`, error);
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
      console.error(`[SSETransportManager] Cleaning up ${staleSessionIds.length} stale sessions`);
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
