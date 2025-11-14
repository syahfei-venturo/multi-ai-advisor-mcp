import Database from 'better-sqlite3';
import { IJobRepository } from '../../../core/interfaces/IJobRepository.js';
import { Job } from '../../../core/entities/Job.js';

/**
 * SQLite implementation of job repository
 */
export class JobRepository implements IJobRepository {
  constructor(private db: Database.Database) {}

  saveJob(job: Job): void {
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

  loadJob(jobId: string): Job | null {
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

  getAllJobs(): Job[] {
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

  saveJobProgress(
    jobId: string,
    timestamp: Date,
    message: string,
    percentage: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT INTO job_progress (job_id, timestamp, message, percentage)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(jobId, timestamp.toISOString(), message, percentage);
  }

  loadJobProgress(
    jobId: string
  ): Array<{
    timestamp: Date;
    message: string;
    percentage: number;
  }> {
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

  deleteJobsByAge(hoursOld: number = 24): number {
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000).toISOString();

    this.db
      .prepare(
        `
      DELETE FROM job_progress WHERE job_id IN (
        SELECT id FROM jobs WHERE completed_at < ? AND status != 'running'
      )
    `
      )
      .run(cutoffTime);

    const result2 = this.db
      .prepare(
        `
      DELETE FROM jobs WHERE completed_at < ? AND status != 'running'
    `
      )
      .run(cutoffTime);

    return result2.changes || 0;
  }

  // Web UI support methods
  getJob(jobId: string): Job | null {
    return this.loadJob(jobId);
  }

  updateJobStatus(jobId: string, status: string): void {
    const stmt = this.db.prepare(`
      UPDATE jobs SET status = ?, completed_at = ? WHERE id = ?
    `);
    const completedAt = status === 'cancelled' ? new Date().toISOString() : null;
    stmt.run(status, completedAt, jobId);
  }
}
