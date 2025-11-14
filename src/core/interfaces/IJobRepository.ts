import { Job } from '../entities/Job.js';

/**
 * Interface for job persistence
 */
export interface IJobRepository {
  saveJob(job: Job): void;

  loadJob(jobId: string): Job | null;

  getAllJobs(): Job[];

  saveJobProgress(jobId: string, timestamp: Date, message: string, percentage: number): void;

  loadJobProgress(jobId: string): Array<{
    timestamp: Date;
    message: string;
    percentage: number;
  }>;

  deleteJobsByAge(hoursOld: number): number;

  // Web UI support methods
  getJob(jobId: string): Job | null;
  updateJobStatus(jobId: string, status: string): void;
}
