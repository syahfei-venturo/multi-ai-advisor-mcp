/**
 * Job domain entity
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
  estimatedCompletionMs?: number;
  estimatedTotalMs?: number;
  modelCount?: number;
}

export interface ProgressUpdate {
  timestamp: Date;
  message: string;
  percentage: number;
}

export interface JobSubmitOptions {
  estimatedTotalMs?: number;
  modelCount?: number;
}
