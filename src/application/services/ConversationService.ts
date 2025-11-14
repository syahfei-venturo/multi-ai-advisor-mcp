import { IConversationRepository } from '../../core/interfaces/IConversationRepository.js';
import { ConversationMessage, ConversationSession } from '../../core/entities/Conversation.js';

/**
 * Service for managing conversations
 */
export class ConversationService {
  private conversationHistory: Map<string, ConversationMessage[]> = new Map();
  private readonly MAX_HISTORY = 40;

  constructor(private conversationRepo: IConversationRepository) {}

  /**
   * Add a user message to the conversation
   */
  addUserMessage(sessionId: string, content: string): void {
    if (!this.conversationHistory.has(sessionId)) {
      this.conversationHistory.set(sessionId, []);
    }

    const messages = this.conversationHistory.get(sessionId)!;
    messages.push({
      role: 'user',
      content,
    });

    // Save to database
    try {
      this.conversationRepo.saveMessage(
        sessionId,
        messages.length - 1,
        'user',
        content
      );
    } catch (error) {
      console.error('Error saving user message to database:', error);
    }

    this.trimHistory(sessionId);
  }

  /**
   * Add an assistant message to the conversation
   */
  addAssistantMessage(
    sessionId: string,
    content: string,
    model?: string,
    thinking?: string
  ): void {
    if (!this.conversationHistory.has(sessionId)) {
      this.conversationHistory.set(sessionId, []);
    }

    const messages = this.conversationHistory.get(sessionId)!;
    messages.push({
      role: 'assistant',
      content,
      model,
      thinking,
    });

    // Save to database
    try {
      this.conversationRepo.saveMessage(
        sessionId,
        messages.length - 1,
        'assistant',
        content,
        model,
        thinking
      );
    } catch (error) {
      console.error('Error saving assistant message to database:', error);
    }

    this.trimHistory(sessionId);
  }

  /**
   * Get conversation history for a session
   */
  getHistory(sessionId: string): ConversationMessage[] {
    return this.conversationHistory.get(sessionId) || [];
  }

  /**
   * Build conversation context for a query
   */
  buildContext(sessionId: string, includeHistory: boolean): string {
    if (!includeHistory) {
      return '';
    }

    const messages = this.getHistory(sessionId);
    if (messages.length === 0) {
      return '';
    }

    let context = 'Previous conversation:\n\n';
    messages.forEach((msg) => {
      const role =
        msg.role === 'user' ? 'User' : `Assistant (${msg.model || 'multi-model'})`;
      context += `${role}: ${msg.content}\n\n`;
    });
    context += '---\n\n';

    return context;
  }

  /**
   * Clear conversation history for a session
   */
  clearHistory(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
    this.conversationRepo.deleteSession(sessionId);
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): string[] {
    return Array.from(this.conversationHistory.keys());
  }

  /**
   * Load existing sessions from database
   */
  loadExistingSessions(): void {
    const sessions = this.conversationRepo.getAllSessions();

    for (const sessionId of sessions) {
      const messages = this.conversationRepo.loadSessionHistory(sessionId);
      this.conversationHistory.set(
        sessionId,
        messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          model: msg.model_name,
          thinking: msg.thinking_text,
        }))
      );
    }
  }

  /**
   * Trim history to maximum length
   */
  private trimHistory(sessionId: string): void {
    const messages = this.conversationHistory.get(sessionId);
    if (messages && messages.length > this.MAX_HISTORY) {
      this.conversationHistory.set(sessionId, messages.slice(-this.MAX_HISTORY));
    }
  }
}
