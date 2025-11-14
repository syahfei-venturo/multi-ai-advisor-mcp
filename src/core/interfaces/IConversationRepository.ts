import { ConversationMessage, ConversationMessageRecord } from '../entities/Conversation.js';

/**
 * Interface for conversation persistence
 */
export interface IConversationRepository {
  saveMessage(
    sessionId: string,
    messageIndex: number,
    role: string,
    content: string,
    model?: string,
    thinking?: string
  ): void;

  loadSessionHistory(sessionId: string): ConversationMessageRecord[];

  getAllSessions(): Array<{ session_id: string; last_updated: string }>;

  deleteSession(sessionId: string): void;

  // Web UI support methods
  getHistory(sessionId: string): ConversationMessageRecord[];
  getAllConversations(): ConversationMessageRecord[];
  clearHistory(sessionId: string): void;
}
