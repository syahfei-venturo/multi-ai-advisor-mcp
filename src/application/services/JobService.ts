import { JobQueue } from '../../infrastructure/queue/JobQueue.js';
import { Job } from '../../core/entities/Job.js';
import { IJobRepository } from '../../core/interfaces/IJobRepository.js';

/**
 * Service for managing job operations
 */
export class JobService {
  constructor(
    private jobQueue: JobQueue,
    private jobRepository: IJobRepository
  ) {}

  /**
   * Submit a new job
   */
  submitJob(
    type: 'query-models',
    input: Record<string, unknown>,
    estimatedTotalMs?: number,
    modelCount?: number
  ): string {
    return this.jobQueue.submitJob(type, input, estimatedTotalMs, modelCount);
  }

  /**
   * Get job status
   */
  getJobStatus(jobId: string): Job | null {
    return this.jobQueue.getJobStatus(jobId);
  }

  /**
   * Get job result
   */
  getJobResult(jobId: string): unknown {
    return this.jobQueue.getJobResult(jobId);
  }

  /**
   * Cancel a job
   */
  cancelJob(jobId: string): boolean {
    return this.jobQueue.cancelJob(jobId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): Job[] {
    return this.jobQueue.getAllJobs();
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: Job['status']): Job[] {
    return this.jobQueue.getJobsByStatus(status);
  }

  /**
   * Get queue statistics
   */
  getStatistics() {
    return this.jobQueue.getStatistics();
  }

  /**
   * Update job progress
   */
  updateProgress(jobId: string, progress: number, message: string): void {
    this.jobQueue.updateProgress(jobId, progress, message);
  }

  /**
   * Complete a job
   */
  completeJob(jobId: string, result: unknown): void {
    this.jobQueue.completeJob(jobId, result);
  }

  /**
   * Fail a job
   */
  failJob(jobId: string, error: string): void {
    this.jobQueue.failJob(jobId, error);
  }

  /**
   * Restore incomplete jobs from database
   */
  async restoreIncompleteJobs(): Promise<void> {
    const jobs = this.jobRepository.getAllJobs();

    const incompleteJobs = jobs.filter(
      (job) => job.status === 'pending' || job.status === 'running'
    );

    if (incompleteJobs.length > 0) {
      console.error(
        `⚠️ Restoring ${incompleteJobs.length} incomplete jobs from database...`
      );

      for (const job of incompleteJobs) {
        if (job.status === 'pending' || job.status === 'running') {
          const newJobId = this.jobQueue.submitJob(job.type as any, job.input);
          console.error(`Restored job ${job.id} → new ID: ${newJobId}`);
        }
      }
    }
  }

  /**
   * Attach job started callback
   */
  onJobStarted(callback: (job: Job) => void): void {
    this.jobQueue.onJobStarted_attach(callback);
  }

  /**
   * Attach job completed callback
   */
  onJobCompleted(callback: (job: Job) => void): void {
    this.jobQueue.onJobCompleted_attach(callback);
  }
}
