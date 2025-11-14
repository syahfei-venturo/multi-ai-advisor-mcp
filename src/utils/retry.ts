/**
 * Retry and Circuit Breaker patterns for resilient API calls
 * Phase 2: Robust Error Handling & Retry Logic
 */

export interface RetryConfig {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
  timeoutMs: number;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 4,
  initialDelayMs: 1000,
  maxDelayMs: 8000,
  multiplier: 2,
  timeoutMs: 30000,
};

export interface RetryLog {
  timestamp: Date;
  attempt: number;
  delay: number;
  success: boolean;
  error?: string;
  nextRetryInMs?: number;
}

/**
 * Executes a function with exponential backoff retry logic
 * @param fn - Async function to execute
 * @param config - Retry configuration
 * @param onLog - Optional callback for retry logging
 * @returns Promise with the function result
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onLog?: (log: RetryLog) => void
): Promise<T> {
  let lastError: Error | null = null;
  let lastDelay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Timeout after ${config.timeoutMs}ms`)),
          config.timeoutMs
        )
      );

      // Race between the function and timeout
      const result = await Promise.race([fn(), timeoutPromise]);
      
      // Log success
      if (onLog) {
        onLog({
          timestamp: new Date(),
          attempt,
          delay: 0,
          success: true,
        });
      }

      return result;
    } catch (error) {
      lastError = error as Error;

      // Log attempt
      if (onLog) {
        onLog({
          timestamp: new Date(),
          attempt,
          delay: lastDelay,
          success: false,
          error: (error as Error).message,
          nextRetryInMs: attempt < config.maxAttempts ? lastDelay : undefined,
        });
      }

      // If this was the last attempt, throw
      if (attempt === config.maxAttempts) {
        break;
      }

      // Wait before retrying
      await sleep(lastDelay);

      // Calculate next delay (exponential backoff)
      lastDelay = Math.min(lastDelay * config.multiplier, config.maxDelayMs);
    }
  }

  throw new Error(
    `Failed after ${config.maxAttempts} attempts. Last error: ${lastError?.message}`
  );
}

/**
 * Sleep utility function
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Circuit Breaker Pattern
 * Prevents cascading failures by stopping requests when service is down
 */
export class CircuitBreaker {
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private state: "closed" | "open" | "half-open" = "closed";
  private logs: Array<{ timestamp: Date; state: string; reason: string }> = [];

  constructor(
    private failureThreshold: number = 5,
    private resetTimeout: number = 60000
  ) {}

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if we should transition from open to half-open
    if (this.state === "open") {
      const now = Date.now();
      if (this.lastFailureTime && now - this.lastFailureTime > this.resetTimeout) {
        this.state = "half-open";
        this.logStateChange("half-open", "Reset timeout reached");
        this.successCount = 0;
      } else {
        throw new Error(
          `Circuit breaker is OPEN. Service is temporarily unavailable. Try again in ${this.resetTimeout - (now - (this.lastFailureTime || now))}ms`
        );
      }
    }

    try {
      const result = await fn();

      // Success - handle state transitions
      if (this.state === "half-open") {
        this.successCount++;
        if (this.successCount >= 2) {
          // After 2 successful attempts in half-open, close the circuit
          this.state = "closed";
          this.failureCount = 0;
          this.logStateChange("closed", "Recovered from temporary failure");
        }
      } else if (this.state === "closed") {
        this.failureCount = Math.max(0, this.failureCount - 1);
      }

      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle failure logic
   */
  private onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === "half-open") {
      // If half-open fails, go back to open
      this.state = "open";
      this.logStateChange("open", "Failed while in half-open state");
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = "open";
      this.logStateChange("open", `Failure threshold (${this.failureThreshold}) reached`);
    }
  }

  /**
   * Log state changes for debugging
   */
  private logStateChange(newState: string, reason: string) {
    this.logs.push({
      timestamp: new Date(),
      state: newState,
      reason,
    });

    // Keep last 100 logs
    if (this.logs.length > 100) {
      this.logs = this.logs.slice(-100);
    }
  }

  /**
   * Get current state
   */
  getState(): "closed" | "open" | "half-open" {
    return this.state;
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime ? new Date(this.lastFailureTime) : null,
      logs: this.logs,
    };
  }

  /**
   * Reset circuit breaker manually
   */
  reset() {
    this.state = "closed";
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.logStateChange("closed", "Manual reset");
  }
}

/**
 * Create structured error log in JSON format
 */
export function createErrorLog(
  timestamp: Date,
  attempt: number,
  modelName: string,
  error: string,
  nextRetryInMs?: number
) {
  return {
    timestamp: timestamp.toISOString(),
    attempt,
    model: modelName,
    error,
    next_retry_in_ms: nextRetryInMs,
    severity: attempt >= 3 ? "HIGH" : "MEDIUM",
  };
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const errorMessage = (error as Error)?.message?.toLowerCase() || "";
  
  // Retryable errors
  const retryablePatterns = [
    "timeout",
    "econnrefused",
    "econnreset",
    "service unavailable",
    "temporarily unavailable",
    "connection refused",
    "getaddrinfo enotfound",
    "socket hang up",
  ];

  return retryablePatterns.some((pattern) =>
    errorMessage.includes(pattern.toLowerCase())
  );
}
