import { PromptTemplate, PromptPayload } from './types.js';

/**
 * Legacy text-based template (backward compatibility)
 * Formats messages as plain text with role labels
 *
 * Format:
 * Previous conversation:
 *
 * User: question 1
 *
 * Assistant (model-name): response 1
 *
 * ---
 *
 * New user question: question 2
 */
export class LegacyTemplate implements PromptTemplate {
  formatPrompt(
    messages: Array<{ role: 'user' | 'assistant'; content: string; model?: string }>,
    newQuestion: string,
    systemPrompt?: string
  ): PromptPayload {
    let prompt = '';

    // Build conversation context if there are previous messages
    if (messages.length > 0) {
      prompt = 'Previous conversation:\n\n';

      messages.forEach((msg) => {
        const role =
          msg.role === 'user'
            ? 'User'
            : `Assistant (${msg.model || 'multi-model'})`;
        prompt += `${role}: ${msg.content}\n\n`;
      });

      prompt += '---\n\n';
    }

    // Append new question
    prompt += messages.length > 0
      ? `New user question: ${newQuestion}`
      : newQuestion;

    return {
      type: 'generate',
      prompt,
      system: systemPrompt,
    };
  }

  getName(): string {
    return 'Legacy (text-based)';
  }
}
