import { OllamaResponse } from '../entities/Model.js';

/**
 * Interface for Ollama API client
 */
export interface IOllamaClient {
  /**
   * Generate a response from a model
   */
  generate(
    model: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<OllamaResponse>;

  /**
   * List available models
   */
  listModels(): Promise<{ models: any[] }>;

  /**
   * Health check for Ollama service
   */
  healthCheck(): Promise<boolean>;
}
