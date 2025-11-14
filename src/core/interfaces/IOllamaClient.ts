import { OllamaResponse } from '../entities/Model.js';
import { ChatMessage } from '../templates/types.js';

/**
 * Interface for Ollama API client
 */
export interface IOllamaClient {
  /**
   * Generate a response from a model using text prompt
   */
  generate(
    model: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<OllamaResponse>;

  /**
   * Chat with a model using structured messages
   */
  chat(model: string, messages: ChatMessage[]): Promise<OllamaResponse>;

  /**
   * List available models
   */
  listModels(): Promise<{ models: any[] }>;

  /**
   * Health check for Ollama service
   */
  healthCheck(): Promise<boolean>;
}
