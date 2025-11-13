import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ConversationMessage {
  id?: number;
  session_id: string;
  message_index: number;
  role: string;
  content: string;
  model_name?: string;
  thinking_text?: string;
  created_at?: string;
}

export class ConversationDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = 'conversations.db') {
    this.dbPath = path.resolve(__dirname, '..', 'data', dbPath);
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.dbPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initializeTables();
  }

  private initializeTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        message_index INTEGER NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        model_name TEXT,
        thinking_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, message_index)
      );

      CREATE INDEX IF NOT EXISTS idx_session_id ON conversations(session_id);
      CREATE INDEX IF NOT EXISTS idx_created_at ON conversations(created_at);
      CREATE INDEX IF NOT EXISTS idx_session_created ON conversations(session_id, created_at);

      CREATE TABLE IF NOT EXISTS session_metadata (
        session_id TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        message_count INTEGER DEFAULT 0,
        user_metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_last_accessed ON session_metadata(last_accessed);
    `);
  }

  public saveMessage(
    sessionId: string,
    messageIndex: number,
    role: string,
    content: string,
    model?: string,
    thinking?: string
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO conversations (session_id, message_index, role, content, model_name, thinking_text)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(sessionId, messageIndex, role, content, model || null, thinking || null);
    this.updateSessionMetadata(sessionId);
  }

  public loadSessionHistory(sessionId: string): ConversationMessage[] {
    const stmt = this.db.prepare(`
      SELECT * FROM conversations 
      WHERE session_id = ? 
      ORDER BY message_index
    `);

    const messages = stmt.all(sessionId) as ConversationMessage[];
    
    // Update last accessed
    this.db.prepare(`
      UPDATE session_metadata 
      SET last_accessed = CURRENT_TIMESTAMP 
      WHERE session_id = ?
    `).run(sessionId);

    return messages;
  }

  public getAllSessions(): string[] {
    const stmt = this.db.prepare('SELECT DISTINCT session_id FROM conversations ORDER BY session_id');
    const results = stmt.all() as Array<{ session_id: string }>;
    return results.map(r => r.session_id);
  }

  public getSessionMetadata(sessionId: string): any {
    const stmt = this.db.prepare('SELECT * FROM session_metadata WHERE session_id = ?');
    return stmt.get(sessionId);
  }

  public getAllSessionsMetadata(): any[] {
    const stmt = this.db.prepare('SELECT * FROM session_metadata ORDER BY last_accessed DESC');
    return stmt.all();
  }

  private updateSessionMetadata(sessionId: string): void {
    const messageCount = (this.db.prepare(
      'SELECT COUNT(*) as count FROM conversations WHERE session_id = ?'
    ).get(sessionId) as any).count;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO session_metadata (session_id, last_accessed, message_count)
      VALUES (?, CURRENT_TIMESTAMP, ?)
    `);

    stmt.run(sessionId, messageCount);
  }

  public deleteSession(sessionId: string): void {
    this.db.prepare('DELETE FROM conversations WHERE session_id = ?').run(sessionId);
    this.db.prepare('DELETE FROM session_metadata WHERE session_id = ?').run(sessionId);
  }

  public deleteSessionsByAge(days: number = 30): number {
    const result1 = this.db.prepare(`
      DELETE FROM conversations WHERE session_id IN (
        SELECT session_id FROM session_metadata 
        WHERE last_accessed < datetime('now', ? || ' days')
      )
    `).run(`-${days}`);

    const result2 = this.db.prepare(`
      DELETE FROM session_metadata 
      WHERE last_accessed < datetime('now', ? || ' days')
    `).run(`-${days}`);

    return (result1.changes || 0) + (result2.changes || 0);
  }

  public getDatabase(): Database.Database {
    return this.db;
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  public getStatistics(): {
    totalMessages: number;
    totalSessions: number;
    databaseSize: number;
  } {
    const messages = (this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as any).count;
    const sessions = (this.db.prepare('SELECT COUNT(*) as count FROM session_metadata').get() as any).count;

    // Get database file size
    let databaseSize = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      databaseSize = stats.size;
    } catch (e) {
      // Database file doesn't exist yet
    }

    return {
      totalMessages: messages,
      totalSessions: sessions,
      databaseSize: databaseSize,
    };
  }

  public close(): void {
    if (this.db) {
      this.db.close();
    }
  }
}

// Global instance
let dbInstance: ConversationDatabase | null = null;

export function initializeDatabase(dbPath?: string): ConversationDatabase {
  if (!dbInstance) {
    dbInstance = new ConversationDatabase(dbPath);
  }
  return dbInstance;
}

export function getDatabase(): ConversationDatabase {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
