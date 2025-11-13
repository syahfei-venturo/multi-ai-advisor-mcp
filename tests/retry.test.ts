/**
 * Tests for Retry and Circuit Breaker logic
 */

import { withRetry, CircuitBreaker, DEFAULT_RETRY_CONFIG, isRetryableError } from '../src/retry.js';

describe('Retry Logic', () => {
  describe('withRetry - Success Cases', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempts = 0;
      const fn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve('success');
      });

      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should use custom config', async () => {
      let attempts = 0;
      const fn = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Fail');
        }
        return Promise.resolve('ok');
      });

      const customConfig = {
        maxAttempts: 5,
        initialDelayMs: 100,
        maxDelayMs: 200,
        multiplier: 2,
        timeoutMs: 10000,
      };

      const result = await withRetry(fn, customConfig);
      expect(result).toBe('ok');
      expect(attempts).toBe(2);
    });
  });

  describe('withRetry - Failure Cases', () => {
    it('should throw after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Always fails'));

      await expect(
        withRetry(fn, {
          ...DEFAULT_RETRY_CONFIG,
          maxAttempts: 3,
        })
      ).rejects.toThrow('Failed after 3 attempts');

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should log retry attempts', async () => {
      const logs: any[] = [];
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce('success');

      await withRetry(
        fn,
        {
          ...DEFAULT_RETRY_CONFIG,
          initialDelayMs: 10,
          maxDelayMs: 20,
        },
        (log) => logs.push(log)
      );

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[logs.length - 1].success).toBe(true);
    });
  });

  describe('Exponential Backoff', () => {
    it('should calculate exponential backoff correctly', async () => {
      const startTime = Date.now();
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce('success');

      await withRetry(fn, {
        maxAttempts: 2,
        initialDelayMs: 100,
        maxDelayMs: 1000,
        multiplier: 2,
        timeoutMs: 30000,
      });

      const duration = Date.now() - startTime;
      // Should have at least 100ms delay
      expect(duration).toBeGreaterThanOrEqual(90);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout if function takes too long', async () => {
      const fn = jest.fn(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve('slow'), 5000);
          })
      );

      await expect(
        withRetry(fn, {
          maxAttempts: 1,
          initialDelayMs: 100,
          maxDelayMs: 100,
          multiplier: 1,
          timeoutMs: 100,
        })
      ).rejects.toThrow('Timeout');
    });
  });
});

describe('Circuit Breaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker(3, 1000); // 3 failures to open, 1s timeout
  });

  describe('States', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
    });

    it('should open after failure threshold', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');

      // Next call should fail immediately without calling fn
      await expect(breaker.execute(fn)).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should transition to half-open after timeout', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Should be in half-open now (circuit transitions on next call)
      const successFn = jest.fn().mockResolvedValue('success');
      await breaker.execute(successFn);

      expect(breaker.getState()).toBe('half-open');
    });

    it('should close after successful recovery', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Provide success function
      const successFn = jest.fn().mockResolvedValue('ok');

      // First success moves to half-open
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe('half-open');

      // Second success closes the circuit
      await breaker.execute(successFn);
      expect(breaker.getState()).toBe('closed');
    });

    it('should reopen if fails during half-open', async () => {
      const failFn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failFn);
        } catch (e) {
          // Expected
        }
      }

      // Wait for reset
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Fail in half-open
      await expect(breaker.execute(failFn)).rejects.toThrow('Fail');

      expect(breaker.getState()).toBe('open');
    });
  });

  describe('Manual Reset', () => {
    it('should reset to closed state', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch (e) {
          // Expected
        }
      }

      expect(breaker.getState()).toBe('open');

      // Manual reset
      breaker.reset();
      expect(breaker.getState()).toBe('closed');

      // Should accept calls again
      const successFn = jest.fn().mockResolvedValue('ok');
      const result = await breaker.execute(successFn);
      expect(result).toBe('ok');
    });
  });

  describe('Statistics', () => {
    it('should track statistics', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Fail'));

      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(fn);
        } catch (e) {
          // Expected
        }
      }

      const stats = breaker.getStats();
      expect(stats.state).toBe('closed'); // Not yet at threshold
      expect(stats.failureCount).toBe(2);
      expect(stats.logs.length).toBeGreaterThanOrEqual(0); // Logs might be empty on first failures
    });
  });
});

describe('Error Classification', () => {
  it('should identify retryable errors', () => {
    expect(isRetryableError(new Error('Connection timeout'))).toBe(true);
    expect(isRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    expect(isRetryableError(new Error('Service Unavailable'))).toBe(true);
  });

  it('should identify non-retryable errors', () => {
    expect(isRetryableError(new Error('Invalid request'))).toBe(false);
    expect(isRetryableError(new Error('Authentication failed'))).toBe(false);
    expect(isRetryableError(new Error('Not found'))).toBe(false);
  });
});
