import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const getDirname = () => path.dirname(fileURLToPath(import.meta.url));

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
    const __dirname = getDirname();
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

      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        progress INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        input TEXT NOT NULL,
        result TEXT,
        error TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_job_status ON jobs(status);
      CREATE INDEX IF NOT EXISTS idx_job_created ON jobs(created_at);

      CREATE TABLE IF NOT EXISTS job_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        message TEXT NOT NULL,
        percentage INTEGER,
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_job_progress_id ON job_progress(job_id);
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

  public saveJob(job: any): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO jobs (id, type, status, progress, created_at, started_at, completed_at, input, result, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      job.id,
      job.type,
      job.status,
      job.progress,
      job.createdAt.toISOString(),
      job.startedAt ? job.startedAt.toISOString() : null,
      job.completedAt ? job.completedAt.toISOString() : null,
      JSON.stringify(job.input),
      job.result ? JSON.stringify(job.result) : null,
      job.error || null
    );
  }

  public loadJob(jobId: string): any {
    const stmt = this.db.prepare('SELECT * FROM jobs WHERE id = ?');
    const row = stmt.get(jobId) as any;

    if (!row) return null;

    return {
      id: row.id,
      type: row.type,
      status: row.status,
      progress: row.progress,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      input: JSON.parse(row.input),
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error,
      progressUpdates: this.loadJobProgress(jobId),
    };
  }

  public saveJobProgress(jobId: string, timestamp: Date, message: string, percentage: number): void {
    const stmt = this.db.prepare(`
      INSERT INTO job_progress (job_id, timestamp, message, percentage)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(jobId, timestamp.toISOString(), message, percentage);
  }

  public loadJobProgress(jobId: string): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM job_progress WHERE job_id = ? ORDER BY timestamp
    `);

    const rows = stmt.all(jobId) as any[];
    return rows.map((row) => ({
      timestamp: new Date(row.timestamp),
      message: row.message,
      percentage: row.percentage,
    }));
  }

  public getAllJobs(): any[] {
    const stmt = this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC');
    const rows = stmt.all() as any[];

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      progress: row.progress,
      createdAt: new Date(row.created_at),
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      input: JSON.parse(row.input),
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error,
      progressUpdates: this.loadJobProgress(row.id),
    }));
  }

  public deleteJobsByAge(hoursOld: number = 24): number {
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();

    const result1 = this.db.prepare(`
      DELETE FROM job_progress WHERE job_id IN (
        SELECT id FROM jobs WHERE completed_at < ? AND status != 'running'
      )
    `).run(cutoffTime);

    const result2 = this.db.prepare(`
      DELETE FROM jobs WHERE completed_at < ? AND status != 'running'
    `).run(cutoffTime);

    return (result2.changes || 0);
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
