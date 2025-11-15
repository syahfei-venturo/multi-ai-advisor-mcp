import Database from 'better-sqlite3';
import { IConversationRepository } from '../../../core/interfaces/IConversationRepository.js';
import { ConversationMessageRecord } from '../../../core/entities/Conversation.js';

/**
 * SQLite implementation of conversation repository
 */
export class ConversationRepository implements IConversationRepository {
  constructor(private db: Database.Database) {}

  saveMessage(
    sessionId: string,
    messageIndex: number,
    role: string,
    content: string,
    model?: string,
    thinking?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conversations (session_id, message_index, role, content, model_name, thinking_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `);

    stmt.run(sessionId, messageIndex, role, content, model || null, thinking || null);
    this.updateSessionMetadata(sessionId);
  }

  loadSessionHistory(sessionId: string): ConversationMessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations
      WHERE session_id = ?
      ORDER BY message_index
    `);

    const messages = stmt.all(sessionId) as ConversationMessageRecord[];

    // Update last accessed
    this.db
      .prepare(`
      UPDATE session_metadata
      SET last_accessed = datetime('now', 'localtime')
      WHERE session_id = ?
    `)
      .run(sessionId);

    return messages;
  }

  loadSessionHistoryPaginated(
    sessionId: string,
    limit: number = 100,
    offset: number = 0
  ): {
    messages: ConversationMessageRecord[];
    total: number;
    hasMore: boolean;
  } {
    // Get total count
    const countStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM conversations WHERE session_id = ?'
    );
    const total = (countStmt.get(sessionId) as any).count || 0;

    // Get paginated messages
    const stmt = this.db.prepare(`
      SELECT * FROM conversations
      WHERE session_id = ?
      ORDER BY message_index DESC
      LIMIT ? OFFSET ?
    `);

    const messages = stmt.all(sessionId, limit, offset) as ConversationMessageRecord[];

    // Update last accessed
    this.db
      .prepare(`
      UPDATE session_metadata
      SET last_accessed = datetime('now', 'localtime')
      WHERE session_id = ?
    `)
      .run(sessionId);

    return {
      messages: messages.reverse(), // Reverse to maintain chronological order
      total,
      hasMore: offset + limit < total,
    };
  }

  getAllSessions(): Array<{ session_id: string; last_updated: string; first_message?: string }> {
    const stmt = this.db.prepare(`
      SELECT
        c.session_id,
        MAX(c.created_at) as last_updated,
        (SELECT content FROM conversations WHERE session_id = c.session_id AND role = 'user' ORDER BY message_index LIMIT 1) as first_message
      FROM conversations c
      GROUP BY c.session_id

      UNION

      SELECT
        sm.session_id,
        sm.last_accessed as last_updated,
        NULL as first_message
      FROM session_metadata sm
      WHERE sm.session_id NOT IN (SELECT DISTINCT session_id FROM conversations)

      ORDER BY last_updated DESC
    `);
    return stmt.all() as Array<{ session_id: string; last_updated: string; first_message?: string }>;
  }

  getSessionMetadata(sessionId: string): any {
    const stmt = this.db.prepare('SELECT * FROM session_metadata WHERE session_id = ?');
    return stmt.get(sessionId);
  }

  getAllSessionsMetadata(): any[] {
    const stmt = this.db.prepare(
      'SELECT * FROM session_metadata ORDER BY last_accessed DESC'
    );
    return stmt.all();
  }

  deleteSession(sessionId: string): void {
    this.db.prepare('DELETE FROM conversations WHERE session_id = ?').run(sessionId);
    this.db.prepare('DELETE FROM session_metadata WHERE session_id = ?').run(sessionId);
  }

  deleteSessionsByAge(days: number = 30): number {
    const result1 = this.db
      .prepare(
        `
      DELETE FROM conversations WHERE session_id IN (
        SELECT session_id FROM session_metadata
        WHERE last_accessed < datetime('now', ? || ' days')
      )
    `
      )
      .run(`-${days}`);

    const result2 = this.db
      .prepare(
        `
      DELETE FROM session_metadata
      WHERE last_accessed < datetime('now', ? || ' days')
    `
      )
      .run(`-${days}`);

    return (result1.changes || 0) + (result2.changes || 0);
  }

  private updateSessionMetadata(sessionId: string): void {
    const messageCount = (
      this.db
        .prepare('SELECT COUNT(*) as count FROM conversations WHERE session_id = ?')
        .get(sessionId) as any
    ).count;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO session_metadata (session_id, last_accessed, message_count)
      VALUES (?, datetime('now', 'localtime'), ?)
    `);

    stmt.run(sessionId, messageCount);
  }

  /**
   * Create session metadata (called when session is created but before first message)
   */
  createSession(sessionId: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO session_metadata (session_id, last_accessed, message_count)
      VALUES (?, datetime('now', 'localtime'), 0)
    `);
    stmt.run(sessionId);
  }

  // Web UI support methods
  getHistory(sessionId: string): ConversationMessageRecord[] {
    return this.loadSessionHistory(sessionId);
  }

  getAllConversations(): ConversationMessageRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations
      ORDER BY timestamp DESC
      LIMIT 100
    `);
    return stmt.all() as ConversationMessageRecord[];
  }

  clearHistory(sessionId: string): void {
    this.deleteSession(sessionId);
  }
}
