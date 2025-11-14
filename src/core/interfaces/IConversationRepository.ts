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

  getAllSessions(): string[];

  deleteSession(sessionId: string): void;
}
