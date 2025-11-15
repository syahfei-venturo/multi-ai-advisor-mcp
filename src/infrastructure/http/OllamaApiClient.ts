import fetch from 'node-fetch';
import { IOllamaClient } from '../../core/interfaces/IOllamaClient.js';
import { OllamaResponse } from '../../core/entities/Model.js';
import { withRetry, CircuitBreaker, DEFAULT_RETRY_CONFIG } from '../../utils/retry.js';
import { ChatMessage } from '../../core/templates/types.js';

/**
 * Ollama API Client implementation
 * Optimized for MoE models like Llama-3.2-8X3B-MOE-Dark-Champion
 * Best practices:
 * - Temperature: 0.1-5.0 (higher for variety)
 * - Repeat Penalty: 1.02-1.15
 * - DRY Sampler: Highly responsive
 * - Dynamic Temperature: Recommended for MoE
 * - Smoothing: 1.5 in KoboldCPP (0.3-0.5 in Ollama)
 * - Max Context: Up to 128k tokens
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
              options: {
                // GPU Configuration (RTX 2060 SUPER - 8GB VRAM)
                num_gpu: 1, // Use GPU acceleration
                num_thread: 8, // CPU threads for hybrid processing

                // Memory & Performance (optimized for 8GB VRAM)
                num_ctx: 4096, // Context window size (MoE models support up to 128k)
                num_batch: 892,
                num_predict: 892,

                // Quality Control (MoE optimized: temp 0.1-5.0, repeat_penalty 1.02-1.15)
                temperature: 0.8,
                top_k: 40, // Sampling parameter
                top_p: 0.9, // Nucleus sampling
                repeat_penalty: 1.02, // Prevent repetition (1.02-1.15 recommended for MoE)

                // DRY Sampler (MoE models highly responsive to this)
                dry_multiplier: 0.8, // DRY penalty strength (0.0 = disabled)
                dry_base: 1.75, // Base for DRY penalty calculation
                dry_allowed_length: 2, // Tokens that can repeat
                dry_sequence_breakers: ['\n', ':', '"', '*'], // Break sequences

                // Dynamic Temperature (MoE models respond very well to this)
                dynatemp_range: 0.5, // Dynamic temperature range (recommended 0.5-1.0 for MoE)
                dynatemp_exponent: 1.0, // Exponent for dynamic temp scaling

                // Smooth/Quadratic Samplers (MoE optimized: equivalent to 1.5 in KoboldCPP)
                smoothing_factor: 0.4, // Smoothing factor (0.4 ≈ 1.5 in KoboldCPP)
                smoothing_curve: 1.0, // Curve parameter for smoothing

                // Regeneration (for MoE expert variation - random seed for diversity)
                seed: Math.floor(Math.random() * 1000000), // Random seed for variation

                // Model Management
                keep_alive: '10m', // Keep model in memory for 10 minutes
              },
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
              options: {
                // GPU Configuration (RTX 2060 SUPER - 8GB VRAM)
                num_gpu: 1, // Use GPU acceleration
                num_thread: 8, // CPU threads for hybrid processing

                // Memory & Performance (optimized for 8GB VRAM)
                num_ctx: 4096, // Context window size (MoE models support up to 128k)
                num_batch: 892,
                num_predict: 892,

                // Quality Control (MoE optimized: temp 0.1-5.0, repeat_penalty 1.02-1.15)
                temperature: 0.8,
                top_k: 40, // Sampling parameter
                top_p: 0.9, // Nucleus sampling
                repeat_penalty: 1.02, // Prevent repetition (1.02-1.15 recommended for MoE)

                // DRY Sampler (MoE models highly responsive to this)
                dry_multiplier: 0.8, // DRY penalty strength (0.0 = disabled)
                dry_base: 1.75, // Base for DRY penalty calculation
                dry_allowed_length: 2, // Tokens that can repeat
                dry_sequence_breakers: ['\n', ':', '"', '*'], // Break sequences

                // Dynamic Temperature (MoE models respond very well to this)
                dynatemp_range: 0.5, // Dynamic temperature range (recommended 0.5-1.0 for MoE)
                dynatemp_exponent: 1.0, // Exponent for dynamic temp scaling

                // Smooth/Quadratic Samplers (MoE optimized: equivalent to 1.5 in KoboldCPP)
                smoothing_factor: 0.4, // Smoothing factor (0.4 ≈ 1.5 in KoboldCPP)
                smoothing_curve: 1.0, // Curve parameter for smoothing

                // Regeneration (for MoE expert variation - random seed for diversity)
                seed: Math.floor(Math.random() * 1000000), // Random seed for variation

                // Model Management
                keep_alive: '10m', // Keep model in memory for 10 minutes
              },
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
