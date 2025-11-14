/**
 * Conversation domain entity
 */
export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  model?: string;
  thinking?: string;
}

export interface ConversationSession {
  sessionId: string;
  messages: ConversationMessage[];
  createdAt?: Date;
  lastAccessed?: Date;
}

export interface ConversationMessageRecord {
  id?: number;
  session_id: string;
  message_index: number;
  role: string;
  content: string;
  model_name?: string;
  thinking_text?: string;
  created_at?: string;
}
