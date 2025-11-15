export interface ConversationMessage {
  id: number;
  session_id: string;
  message_index: number;
  role: 'user' | 'assistant';
  content: string;
  model_name?: string;
  thinking_text?: string;
  created_at: string;
}

export interface Session {
  session_id: string;
  last_updated: string;
  first_message?: string;
}

export interface Job {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  question: string;
  results?: string;
  error?: string;
  session_id?: string;
}

export interface Stats {
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  runningJobs: number;
  pendingJobs: number;
  totalConversations: number;
}

export interface WebSocketMessage {
  type: 'connected' | 'conversation_updated' | 'conversation_cleared' | 'job_updated' | 'job_cancelled';
  sessionId?: string;
  jobId?: string;
  status?: string;
  timestamp: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
