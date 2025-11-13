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

  constructor(maxConcurrent: number = 3) {
    this.maxConcurrent = maxConcurrent;
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
    this.processQueue();

    return job.id;
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): Job | null {
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
    return null;
  }

  /**
   * Update job progress with automatic estimation
   */
  updateProgress(jobId: string, progress: number, message: string): void {
    const job = this.running.get(jobId);
    if (job) {
      job.progress = Math.min(100, Math.max(0, progress));
      job.progressUpdates.push({
        timestamp: new Date(),
        message,
        percentage: job.progress,
      });
      
      // Calculate estimated time to completion
      if (job.startedAt && job.estimatedTotalMs) {
        const elapsedMs = Date.now() - job.startedAt.getTime();
        const estimatedTotalMs = job.estimatedTotalMs;
        const completedRatio = progress / 100;
        
        if (completedRatio > 0.01) { // Only estimate after 1% progress
          const estimatedTotalBasedOnProgress = elapsedMs / completedRatio;
          job.estimatedTotalMs = Math.max(estimatedTotalMs, estimatedTotalBasedOnProgress);
          job.estimatedCompletionMs = Math.max(0, job.estimatedTotalMs - elapsedMs);
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
      return true;
    }

    // If running (can't truly cancel, but mark as cancelled when it completes)
    const runningJob = this.running.get(jobId);
    if (runningJob) {
      runningJob.status = 'cancelled';
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
   * Attach a callback for when jobs start
   */
  onJobStarted_attach(callback: (job: Job) => void): void {
    this.jobStartedCallback = callback;
  }
}

/**
 * Global job queue instance
 * Concurrency limit can be configured via MAX_CONCURRENT_JOBS environment variable or CLI args
 */
function getMaxConcurrentJobs(): number {
  // Check CLI argument first (passed via config)
  const envValue = process.env.MAX_CONCURRENT_JOBS;
  const parsed = envValue ? parseInt(envValue, 10) : 3;
  
  // Validate: between 1 and 100
  if (isNaN(parsed) || parsed < 1) return 3;
  if (parsed > 100) return 100;
  
  return parsed;
}

export const jobQueue = new JobQueue(getMaxConcurrentJobs());
