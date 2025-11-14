import { PromptTemplate, PromptPayload, ChatMessage } from './types.js';

/**
 * Chat template using structured messages array
 * Works with Ollama's /api/chat endpoint
 *
 * Ollama automatically applies the correct template based on model:
 * - Llama3: <|start_header_id|>user<|end_header_id|>...
 * - Command-R: <|START_OF_TURN_TOKEN|><|USER_TOKEN|>...
 * - ChatML: <|im_start|>user...
 *
 * This template just provides the structured messages,
 * Ollama handles the formatting.
 */
export class ChatTemplate implements PromptTemplate {
  formatPrompt(
    messages: Array<{ role: 'user' | 'assistant'; content: string; model?: string }>,
    newQuestion: string,
    systemPrompt?: string
  ): PromptPayload {
    const chatMessages: ChatMessage[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      chatMessages.push({
        role: 'system',
        content: systemPrompt,
      });
    }

    // Convert conversation history to chat messages
    messages.forEach((msg) => {
      chatMessages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    // Add new user question
    chatMessages.push({
      role: 'user',
      content: newQuestion,
    });

    return {
      type: 'chat',
      messages: chatMessages,
    };
  }

  getName(): string {
    return 'Chat (Llama3/Command-R/ChatML)';
  }
}
