import { IJobRepository } from '../../core/interfaces/IJobRepository.js';

/**
 * Generate a UUID v4-like string
 */
function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Job interface representing a queued task
 */
export interface Job {
  id: string;
  type: 'query-models' | 'analyze-thinking';
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number; // 0-100
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  input: Record<string, unknown>;
  result?: unknown;
  error?: string;
  progressUpdates: ProgressUpdate[];
  estimatedCompletionMs?: number; // Estimated time to completion in ms
  estimatedTotalMs?: number; // Total estimated time in ms
  modelCount?: number; // Number of models being queried
}

/**
 * Progress update for tracking job execution
 */
export interface ProgressUpdate {
  timestamp: Date;
  message: string;
  percentage: number;
}

/**
 * Job Queue for managing async operations
 */
export class JobQueue {
  private pending: Job[] = [];
  private running: Map<string, Job> = new Map();
  private completed: Map<string, Job> = new Map();
  private maxConcurrent: number;
  private jobRepo?: IJobRepository;

  constructor(maxConcurrent: number = 3, jobRepo?: IJobRepository) {
    this.maxConcurrent = maxConcurrent;
    this.jobRepo = jobRepo;

    // Load existing jobs from database if repository provided
    if (this.jobRepo) {
      this.loadJobsFromDatabase();
    }
  }

  /**
   * Load completed jobs from database into memory
   */
  private loadJobsFromDatabase(): void {
    if (!this.jobRepo) return;

    try {
      const dbJobs = this.jobRepo.getAllJobs();
      console.error(`[JobQueue] Loading ${dbJobs.length} jobs from database`);

      for (const job of dbJobs) {
        // Only load completed/failed/cancelled jobs (not pending/running)
        if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
          this.completed.set(job.id, job);
        }
      }

      console.error(`[JobQueue] Loaded ${this.completed.size} completed jobs from database`);
    } catch (error) {
      console.error('[JobQueue] Error loading jobs from database:', error);
    }
  }

  /**
   * Submit a new job to the queue
   */
  submitJob(
    type: 'query-models',
    input: Record<string, unknown>,
    estimatedTotalMs?: number,
    modelCount?: number
  ): string {
    const job: Job = {
      id: generateId(),
      type,
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      input,
      progressUpdates: [],
      estimatedTotalMs: estimatedTotalMs || 300000,
      estimatedCompletionMs: estimatedTotalMs || 300000,
      modelCount: modelCount || 3,
    };

    this.pending.push(job);

    // Persist to database if repository available
    if (this.jobRepo) {
      try {
        this.jobRepo.saveJob(job);
        console.error(`[JobQueue] ✓ Job ${job.id} persisted to database (pending)`);
      } catch (error) {
        console.error(`[JobQueue] ✗ Failed to persist job ${job.id} to database:`, error);
      }
    }

    this.processQueue();

    return job.id;
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): Job | null {
    // Check in-memory first (fastest)
    if (this.running.has(jobId)) {
      return this.running.get(jobId) || null;
    }
    if (this.completed.has(jobId)) {
      return this.completed.get(jobId) || null;
    }
    const pending = this.pending.find((j) => j.id === jobId);
    if (pending) {
      return pending;
    }

    // Fallback: Check database if job not found in memory
    // This handles cases where the job was completed in a previous session
    if (this.jobRepo) {
      try {
        const jobFromDb = this.jobRepo.loadJob(jobId);
        if (jobFromDb) {
          // Add to completed cache to speed up future lookups
          if (jobFromDb.status === 'completed' || jobFromDb.status === 'failed' || jobFromDb.status === 'cancelled') {
            this.completed.set(jobId, jobFromDb);
          }
          return jobFromDb;
        }
      } catch (error) {
        console.error(`[JobQueue] ✗ Error loading job ${jobId} from database:`, error);
      }
    }

    return null;
  }

  /**
   * Update job progress with automatic estimation
   */
  updateProgress(jobId: string, progress: number, message: string): void {
    const job = this.running.get(jobId);
    if (job) {
      const timestamp = new Date();
      job.progress = Math.min(100, Math.max(0, progress));
      job.progressUpdates.push({
        timestamp,
        message,
        percentage: job.progress,
      });

      // Calculate estimated time to completion
      if (job.startedAt && job.estimatedTotalMs) {
        const elapsedMs = Date.now() - job.startedAt.getTime();
        const estimatedTotalMs = job.estimatedTotalMs;
        const completedRatio = progress / 100;

        if (completedRatio > 0.01) {
          // Only estimate after 1% progress
          const estimatedTotalBasedOnProgress = elapsedMs / completedRatio;
          job.estimatedTotalMs = Math.max(estimatedTotalMs, estimatedTotalBasedOnProgress);
          job.estimatedCompletionMs = Math.max(0, job.estimatedTotalMs - elapsedMs);
        }
      }

      // Persist progress to database if repository available
      // Note: We update the job record and save progress separately
      if (this.jobRepo) {
        try {
          // Update job progress in main table
          this.jobRepo.saveJob(job);
          // Save individual progress update
          this.jobRepo.saveJobProgress(jobId, timestamp, message, job.progress);
        } catch (error) {
          // Don't log every progress update failure to avoid spam
          // Only log occasionally
          if (Math.random() < 0.1) {
            console.error(`[JobQueue] ✗ Failed to persist progress for job ${jobId}:`, error);
          }
        }
      }
    }
  }

  /**
   * Complete a job with result
   */
  completeJob(jobId: string, result: unknown): void {
    const job = this.running.get(jobId);
    if (job) {
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date();
      job.result = result;
      this.running.delete(jobId);
      this.completed.set(jobId, job);

      // Persist to database if repository available
      if (this.jobRepo) {
        try {
          this.jobRepo.saveJob(job);
          console.error(`[JobQueue] ✓ Job ${jobId} persisted to database (completed)`);
        } catch (error) {
          console.error(`[JobQueue] ✗ Failed to persist job ${jobId} to database:`, error);
        }
      }

      // Trigger completion callback
      this.onJobCompleted(job);

      this.processQueue();
    }
  }

  /**
   * Fail a job with error
   */
  failJob(jobId: string, error: string): void {
    const job = this.running.get(jobId);
    if (job) {
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = error;
      this.running.delete(jobId);
      this.completed.set(jobId, job);

      // Persist to database if repository available
      if (this.jobRepo) {
        try {
          this.jobRepo.saveJob(job);
          console.error(`[JobQueue] ✓ Job ${jobId} persisted to database (failed)`);
        } catch (error) {
          console.error(`[JobQueue] ✗ Failed to persist job ${jobId} to database:`, error);
        }
      }

      this.processQueue();
    }
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    // If pending
    const pendingIndex = this.pending.findIndex((j) => j.id === jobId);
    if (pendingIndex !== -1) {
      const job = this.pending[pendingIndex];
      job.status = 'cancelled';
      job.completedAt = new Date();
      this.pending.splice(pendingIndex, 1);
      this.completed.set(jobId, job);

      // Persist to database if repository available
      if (this.jobRepo) {
        try {
          this.jobRepo.saveJob(job);
          console.error(`[JobQueue] ✓ Job ${jobId} persisted to database (cancelled)`);
        } catch (error) {
          console.error(`[JobQueue] ✗ Failed to persist job ${jobId} to database:`, error);
        }
      }

      return true;
    }

    // If running (can't truly cancel, but mark as cancelled when it completes)
    const runningJob = this.running.get(jobId);
    if (runningJob) {
      runningJob.status = 'cancelled';

      // Persist to database if repository available
      if (this.jobRepo) {
        try {
          this.jobRepo.saveJob(runningJob);
          console.error(`[JobQueue] ✓ Job ${jobId} persisted to database (cancelled while running)`);
        } catch (error) {
          console.error(`[JobQueue] ✗ Failed to persist job ${jobId} to database:`, error);
        }
      }

      return true;
    }

    return false;
  }

  /**
   * Get all jobs matching a status
   */
  getJobsByStatus(status: Job['status']): Job[] {
    const jobs: Job[] = [];

    // Check pending
    if (status === 'pending') {
      jobs.push(...this.pending);
    }

    // Check running
    if (status === 'running') {
      jobs.push(...this.running.values());
    }

    // Check completed
    const completedArray = Array.from(this.completed.values());
    if (
      status === 'completed' ||
      status === 'failed' ||
      status === 'cancelled'
    ) {
      jobs.push(...completedArray.filter((j) => j.status === status));
    }

    return jobs;
  }

  /**
   * Get all jobs
   */
  getAllJobs(): Job[] {
    const jobs: Job[] = [];
    jobs.push(...this.pending);
    jobs.push(...this.running.values());
    jobs.push(...this.completed.values());
    return jobs;
  }

  /**
   * Get job details for quick retrieval
   */
  getJobDetails(jobId: string): {
    id: string;
    status: string;
    progress: number;
    estimatedCompletionMs?: number;
    modelCount?: number;
    result?: unknown;
    error?: string;
  } | null {
    const job = this.getJobStatus(jobId);
    if (!job) return null;

    return {
      id: job.id,
      status: job.status,
      progress: job.progress,
      estimatedCompletionMs: job.estimatedCompletionMs,
      modelCount: job.modelCount,
      result: job.result,
      error: job.error,
    };
  }

  /**
   * Get job result (simplified version of getJobDetails)
   */
  getJobResult(jobId: string): unknown {
    const job = this.getJobStatus(jobId);
    return job?.result;
  }

  /**
   * Get queue statistics
   */
  getStatistics() {
    const all = this.getAllJobs();
    return {
      total: all.length,
      pending: this.pending.length,
      running: this.running.size,
      completed: Array.from(this.completed.values()).filter(
        (j) => j.status === 'completed'
      ).length,
      failed: Array.from(this.completed.values()).filter(
        (j) => j.status === 'failed'
      ).length,
      cancelled: Array.from(this.completed.values()).filter(
        (j) => j.status === 'cancelled'
      ).length,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * Clear old completed jobs (older than specified hours)
   */
  clearOldJobs(hoursOld: number = 24): number {
    const cutoffTime = new Date(Date.now() - hoursOld * 60 * 60 * 1000);
    let cleared = 0;

    for (const [jobId, job] of this.completed.entries()) {
      if (
        job.completedAt &&
        job.completedAt < cutoffTime &&
        job.status !== 'running'
      ) {
        this.completed.delete(jobId);
        cleared++;
      }
    }

    return cleared;
  }

  /**
   * Process the queue and execute pending jobs
   */
  private processQueue(): void {
    while (this.pending.length > 0 && this.running.size < this.maxConcurrent) {
      const job = this.pending.shift();
      if (job) {
        job.status = 'running';
        job.startedAt = new Date();
        this.running.set(job.id, job);

        // Persist to database if repository available
        if (this.jobRepo) {
          try {
            this.jobRepo.saveJob(job);
            console.error(`[JobQueue] ✓ Job ${job.id} persisted to database (running)`);
          } catch (error) {
            console.error(`[JobQueue] ✗ Failed to persist job ${job.id} to database:`, error);
          }
        }

        // Emit event that job started (consumers should listen for this)
        this.onJobStarted(job);
      }
    }
  }

  /**
   * Callback when a job starts execution
   * Override this in subclass or attach listener
   */
  private onJobStarted(job: Job): void {
    // This will be used by the server to handle actual execution
    if (this.jobStartedCallback) {
      this.jobStartedCallback(job);
    }
  }

  /**
   * Callback for when a job is ready to execute
   */
  jobStartedCallback?: (job: Job) => void;

  /**
   * Callback for when a job completes
   */
  jobCompletedCallback?: (job: Job) => void;

  /**
   * Attach a callback for when jobs start
   */
  onJobStarted_attach(callback: (job: Job) => void): void {
    this.jobStartedCallback = callback;
  }

  /**
   * Attach a callback for when jobs complete
   */
  onJobCompleted_attach(callback: (job: Job) => void): void {
    this.jobCompletedCallback = callback;
  }

  /**
   * Callback when a job completes execution
   */
  private onJobCompleted(job: Job): void {
    if (this.jobCompletedCallback) {
      this.jobCompletedCallback(job);
    }
  }
}

// Removed global jobQueue singleton to prevent confusion.
// JobQueue instances should always be created with dependency injection
// to ensure database persistence works correctly:
// const jobQueue = new JobQueue(maxConcurrent, jobRepository);
