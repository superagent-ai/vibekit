import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReliabilityManager } from '../src/reliability/ReliabilityManager.js';
import type { TelemetryEvent } from '../src/core/types.js';

describe('ReliabilityManager', () => {
  let reliabilityManager: ReliabilityManager;
  let mockEvent: TelemetryEvent;

  beforeEach(() => {
    reliabilityManager = new ReliabilityManager({
      circuitBreaker: { enabled: true, threshold: 2, timeout: 1000 },
      rateLimit: { enabled: true, maxRequests: 5, windowMs: 1000 },
      retry: { enabled: true, maxRetries: 2, backoff: 100 },
    });

    mockEvent = {
      id: 'test-event',
      sessionId: 'test-session',
      eventType: 'event',
      category: 'test',
      action: 'test-action',
      timestamp: Date.now(),
    };
  });

  afterEach(() => {
    reliabilityManager.shutdown();
  });

  describe('rate limiting', () => {
    it('should allow events within rate limit', async () => {
      // Should not throw for events within limit
      await expect(reliabilityManager.checkRateLimit(mockEvent)).resolves.toBeUndefined();
      await expect(reliabilityManager.checkRateLimit(mockEvent)).resolves.toBeUndefined();
    });

    it('should throw when rate limit exceeded', async () => {
      // Fill up the rate limit
      for (let i = 0; i < 5; i++) {
        await reliabilityManager.checkRateLimit(mockEvent);
      }

      // Next request should fail
      await expect(reliabilityManager.checkRateLimit(mockEvent)).rejects.toThrow('Rate limit exceeded');
    });

    it('should reset rate limit after time window', async () => {
      // Fill up the rate limit
      for (let i = 0; i < 5; i++) {
        await reliabilityManager.checkRateLimit(mockEvent);
      }

      // Wait for window to reset
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should work again
      await expect(reliabilityManager.checkRateLimit(mockEvent)).resolves.toBeUndefined();
    });
  });

  describe('circuit breaker', () => {
    it('should execute operation normally when circuit is closed', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const result = await reliabilityManager.executeWithCircuitBreaker('test-key', operation);
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should open circuit after threshold failures', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Trigger failures to open circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          reliabilityManager.executeWithCircuitBreaker('test-key', operation)
        ).rejects.toThrow();
      }

      // Circuit should now be open
      const stats = reliabilityManager.getCircuitBreakerStats();
      expect(stats['test-key'].state).toBe('open');
    });

    it('should reject immediately when circuit is open', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Operation failed'));
      
      // Open the circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          reliabilityManager.executeWithCircuitBreaker('test-key', operation)
        ).rejects.toThrow();
      }

      // Reset the mock to track new calls
      operation.mockClear();

      // Next call should fail immediately without calling operation
      await expect(
        reliabilityManager.executeWithCircuitBreaker('test-key', operation)
      ).rejects.toThrow('Circuit breaker is open');

      expect(operation).not.toHaveBeenCalled();
    });

    it('should transition to half-open after timeout', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2')) 
        .mockResolvedValueOnce('success 1')
        .mockResolvedValueOnce('success 2')
        .mockResolvedValueOnce('success 3')
        .mockResolvedValue('success');
      
      // Open the circuit
      for (let i = 0; i < 2; i++) {
        await expect(
          reliabilityManager.executeWithCircuitBreaker('test-key', operation)
        ).rejects.toThrow();
      }

      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Should now allow operation and succeed - this will be in half-open state
      const result1 = await reliabilityManager.executeWithCircuitBreaker('test-key', operation);
      expect(result1).toBe('success 1');
      
      // Circuit should still be in half-open state - need more successes to close it
      let stats = reliabilityManager.getCircuitBreakerStats();
      expect(['half-open', 'closed']).toContain(stats['test-key'].state);
      
      // Add more successful operations to fully close the circuit
      await reliabilityManager.executeWithCircuitBreaker('test-key', operation);
      await reliabilityManager.executeWithCircuitBreaker('test-key', operation);
      
      stats = reliabilityManager.getCircuitBreakerStats();
      expect(stats['test-key'].state).toBe('closed');
    });
  });

  describe('retry mechanism', () => {
    it('should retry failed operations', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const result = await reliabilityManager.executeWithRetry(operation, 'test-context');
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));

      await expect(
        reliabilityManager.executeWithRetry(operation, 'test-context')
      ).rejects.toThrow('All retry attempts failed');

      // Should be called maxRetries + 1 times (initial + retries)
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Invalid format'));

      await expect(
        reliabilityManager.executeWithRetry(operation, 'test-context')
      ).rejects.toThrow('Non-retryable error');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should apply exponential backoff', async () => {
      const operation = vi.fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      const result = await reliabilityManager.executeWithRetry(operation, 'test-context');
      const endTime = Date.now();

      expect(result).toBe('success');
      // Should have taken at least 100ms (first backoff) + 200ms (second backoff)
      expect(endTime - startTime).toBeGreaterThan(250);
    });
  });

  describe('graceful degradation', () => {
    it('should use primary operation when successful', async () => {
      const primary = vi.fn().mockResolvedValue('primary success');
      const fallback = vi.fn().mockResolvedValue('fallback success');

      const result = await reliabilityManager.executeWithGracefulDegradation(
        primary,
        fallback,
        'test-context'
      );

      expect(result).toBe('primary success');
      expect(primary).toHaveBeenCalled();
      expect(fallback).not.toHaveBeenCalled();
    });

    it('should use fallback when primary fails', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = vi.fn().mockResolvedValue('fallback success');

      const result = await reliabilityManager.executeWithGracefulDegradation(
        primary,
        fallback,
        'test-context'
      );

      expect(result).toBe('fallback success');
      expect(primary).toHaveBeenCalled();
      expect(fallback).toHaveBeenCalled();
    });

    it('should throw when both primary and fallback fail', async () => {
      const primary = vi.fn().mockRejectedValue(new Error('Primary failed'));
      const fallback = vi.fn().mockRejectedValue(new Error('Fallback failed'));

      await expect(
        reliabilityManager.executeWithGracefulDegradation(
          primary,
          fallback,
          'test-context'
        )
      ).rejects.toThrow('Both primary and fallback operations failed');
    });
  });

  describe('health monitoring', () => {
    it('should report healthy status initially', () => {
      const health = reliabilityManager.getHealthStatus();
      
      expect(health.status).toBe('healthy');
      expect(health.details.errors.recent).toBe(0);
      expect(health.details.timestamp).toBeDefined();
    });

    it('should report degraded status with open circuit breakers', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Always fails'));
      
      // Open a circuit breaker
      for (let i = 0; i < 2; i++) {
        await expect(
          reliabilityManager.executeWithCircuitBreaker('test-key', operation)
        ).rejects.toThrow();
      }

      const health = reliabilityManager.getHealthStatus();
      expect(health.status).toBe('degraded');
    });

    it('should provide detailed statistics', () => {
      const circuitStats = reliabilityManager.getCircuitBreakerStats();
      const rateLimitStats = reliabilityManager.getRateLimiterStats();
      const errorStats = reliabilityManager.getErrorStats();

      expect(circuitStats).toBeDefined();
      expect(rateLimitStats).toBeDefined();
      expect(errorStats).toBeDefined();
      
      expect(errorStats).toHaveProperty('total');
      expect(errorStats).toHaveProperty('recent');
      expect(errorStats).toHaveProperty('bySeverity');
      expect(errorStats).toHaveProperty('byCategory');
    });
  });

  describe('error handling integration', () => {
    it('should track errors through circuit breaker', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(
        reliabilityManager.executeWithCircuitBreaker('test-key', operation)
      ).rejects.toThrow();

      const errorStats = reliabilityManager.getErrorStats();
      expect(errorStats.total).toBeGreaterThan(0);
    });

    it('should track errors through retry mechanism', async () => {
      const operation = vi.fn().mockRejectedValue(new Error('Test error'));
      
      await expect(
        reliabilityManager.executeWithRetry(operation, 'test-context')
      ).rejects.toThrow();

      const errorStats = reliabilityManager.getErrorStats();
      expect(errorStats.total).toBeGreaterThan(0);
    });

    it('should categorize errors correctly', async () => {
      const storageOperation = vi.fn().mockRejectedValue(new Error('Storage error'));
      const streamingOperation = vi.fn().mockRejectedValue(new Error('Streaming error'));
      
      await expect(
        reliabilityManager.executeWithCircuitBreaker('storage:provider', storageOperation)
      ).rejects.toThrow();
      
      await expect(
        reliabilityManager.executeWithCircuitBreaker('streaming:provider', streamingOperation)
      ).rejects.toThrow();

      const errorStats = reliabilityManager.getErrorStats();
      expect(errorStats.byCategory.storage).toBeGreaterThan(0);
      expect(errorStats.byCategory.streaming).toBeGreaterThan(0);
    });
  });
});