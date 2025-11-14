/**
 * Model-related domain entities
 */
export interface ModelQueryRequest {
  question: string;
  systemPrompt?: string;
  modelSystemPrompts?: Record<string, string>;
  sessionId?: string;
  includeHistory?: boolean;
}

export interface ModelResponse {
  model: string;
  response: string;
  systemPrompt?: string;
  error?: boolean;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

export interface QueryResult {
  sessionId: string;
  response: string;
  modelsQueried: number;
  responsesByModel: ModelResponse[];
}
