import fetch from 'node-fetch';
import { IOllamaClient } from '../../core/interfaces/IOllamaClient.js';
import { OllamaResponse } from '../../core/entities/Model.js';
import { withRetry, CircuitBreaker, DEFAULT_RETRY_CONFIG } from '../../utils/retry.js';
import { ChatMessage } from '../../core/templates/types.js';

/**
 * Ollama API Client implementation
 */
export class OllamaApiClient implements IOllamaClient {
  private apiUrl: string;
  private circuitBreaker: CircuitBreaker;
  private retryConfig: typeof DEFAULT_RETRY_CONFIG;

  constructor(
    apiUrl: string,
    circuitBreaker?: CircuitBreaker,
    retryConfig?: typeof DEFAULT_RETRY_CONFIG
  ) {
    this.apiUrl = apiUrl;
    this.circuitBreaker = circuitBreaker || new CircuitBreaker(5, 60000);
    this.retryConfig = retryConfig || DEFAULT_RETRY_CONFIG;
  }

  async generate(
    model: string,
    prompt: string,
    systemPrompt?: string
  ): Promise<OllamaResponse> {
    const response = await this.circuitBreaker.execute(async () => {
      return withRetry(
        async () => {
          const res = await fetch(`${this.apiUrl}/api/generate`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              prompt,
              system: systemPrompt,
              stream: false,
            }),
          });

          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }

          return res;
        },
        this.retryConfig,
        undefined
      );
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as OllamaResponse;
    return data;
  }

  async chat(model: string, messages: ChatMessage[]): Promise<OllamaResponse> {
    const response = await this.circuitBreaker.execute(async () => {
      return withRetry(
        async () => {
          const res = await fetch(`${this.apiUrl}/api/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages,
              stream: false,
            }),
          });

          if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
          }

          return res;
        },
        this.retryConfig,
        undefined
      );
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = (await response.json()) as OllamaResponse;
    return data;
  }

  async listModels(): Promise<{ models: any[] }> {
    const response = await withRetry(
      async () => {
        const res = await fetch(`${this.apiUrl}/api/tags`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      },
      { ...this.retryConfig, maxAttempts: 2 },
      undefined
    );

    const data = (await response.json()) as { models?: any[] };
    return { models: data.models || [] };
  }

  async healthCheck(): Promise<boolean> {
    try {
      const data = await this.listModels();
      return data.models.length >= 0;
    } catch (error) {
      return false;
    }
  }

  getCircuitBreakerState() {
    return this.circuitBreaker.getState();
  }

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }
}
