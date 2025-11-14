/**
 * Chat message format for structured conversation
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Payload types for different Ollama API endpoints
 */
export type PromptPayload =
  | {
      type: 'generate';
      prompt: string;
      system?: string;
    }
  | {
      type: 'chat';
      messages: ChatMessage[];
    };

/**
 * Template type identifiers
 */
export type TemplateType = 'legacy' | 'chat';

/**
 * Abstract interface for prompt templates
 * Different template implementations format messages differently
 */
export interface PromptTemplate {
  /**
   * Format conversation history and new question into a payload
   * @param messages - Previous conversation messages
   * @param newQuestion - The new user question
   * @param systemPrompt - Optional system prompt for context
   * @returns Formatted payload ready for Ollama API
   */
  formatPrompt(
    messages: Array<{ role: 'user' | 'assistant'; content: string; model?: string }>,
    newQuestion: string,
    systemPrompt?: string
  ): PromptPayload;

  /**
   * Get the template name
   */
  getName(): string;
}
