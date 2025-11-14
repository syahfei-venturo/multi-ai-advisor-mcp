import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const getDirname = () => path.dirname(fileURLToPath(import.meta.url));

/**
 * Database connection manager
 */
export class DatabaseConnection {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = 'conversations.db') {
    const __dirname = getDirname();
    this.dbPath = path.resolve(__dirname, '../../../data', dbPath);

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

  getDatabase(): Database.Database {
    return this.db;
  }

  getDatabasePath(): string {
    return this.dbPath;
  }

  close(): void {
    if (this.db) {
      this.db.close();
    }
  }

  getStatistics(): {
    totalMessages: number;
    totalSessions: number;
    databaseSize: number;
    totalJobs?: number;
    jobStats?: {
      pending: number;
      running: number;
      completed: number;
      failed: number;
      cancelled: number;
    };
  } {
    const messages = (
      this.db.prepare('SELECT COUNT(*) as count FROM conversations').get() as any
    ).count;
    const sessions = (
      this.db.prepare('SELECT COUNT(*) as count FROM session_metadata').get() as any
    ).count;

    // Get database file size
    let databaseSize = 0;
    try {
      const stats = fs.statSync(this.dbPath);
      databaseSize = stats.size;
    } catch (e) {
      // Database file doesn't exist yet
    }

    // Get job statistics
    const totalJobs =
      (this.db.prepare('SELECT COUNT(*) as count FROM jobs').get() as any).count || 0;
    const jobStats = this.db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM jobs
    `).get() as any;

    return {
      totalMessages: messages,
      totalSessions: sessions,
      databaseSize: databaseSize,
      totalJobs,
      jobStats: jobStats
        ? {
            pending: jobStats.pending || 0,
            running: jobStats.running || 0,
            completed: jobStats.completed || 0,
            failed: jobStats.failed || 0,
            cancelled: jobStats.cancelled || 0,
          }
        : undefined,
    };
  }
}

// Global instance
let dbInstance: DatabaseConnection | null = null;

export function initializeDatabase(dbPath?: string): DatabaseConnection {
  if (!dbInstance) {
    dbInstance = new DatabaseConnection(dbPath);
  }
  return dbInstance;
}

export function getDatabaseConnection(): DatabaseConnection {
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
