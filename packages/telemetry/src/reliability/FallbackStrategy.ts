export type FallbackHandler<T> = () => Promise<T> | T;
export type ConditionChecker = () => boolean | Promise<boolean>;

export interface FallbackOptions {
  maxAttempts?: number;
  timeout?: number;
  condition?: ConditionChecker;
  onFallback?: (level: number, error?: Error) => void;
}

export interface FallbackChain<T> {
  primary: FallbackHandler<T>;
  fallbacks: Array<{
    handler: FallbackHandler<T>;
    condition?: ConditionChecker;
  }>;
}

export class FallbackStrategy {
  /**
   * Execute with a simple fallback
   */
  static async withFallback<T>(
    primary: FallbackHandler<T>,
    fallback: FallbackHandler<T>,
    options?: FallbackOptions
  ): Promise<T> {
    try {
      if (options?.condition) {
        const shouldFallback = await Promise.resolve(options.condition());
        if (shouldFallback) {
          options.onFallback?.(1);
          return await Promise.resolve(fallback());
        }
      }
      
      const result = await this.executeWithTimeout(primary, options?.timeout);
      return result;
    } catch (error) {
      options?.onFallback?.(1, error as Error);
      return await Promise.resolve(fallback());
    }
  }
  
  /**
   * Execute with multiple fallback levels
   */
  static async withChain<T>(
    chain: FallbackChain<T>,
    options?: FallbackOptions
  ): Promise<T> {
    const attempts = [
      { handler: chain.primary, condition: undefined },
      ...chain.fallbacks,
    ];
    
    let lastError: Error | undefined;
    
    for (let i = 0; i < attempts.length; i++) {
      const { handler, condition } = attempts[i];
      
      try {
        // Check condition if this is a fallback
        if (i > 0 && condition) {
          const shouldSkip = !(await Promise.resolve(condition()));
          if (shouldSkip) continue;
        }
        
        // Notify fallback if not primary
        if (i > 0) {
          options?.onFallback?.(i, lastError);
        }
        
        const result = await this.executeWithTimeout(handler, options?.timeout);
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // If this was the last attempt, throw
        if (i === attempts.length - 1) {
          throw new Error(
            `All fallback strategies failed. Last error: ${lastError.message}`
          );
        }
      }
    }
    
    // Should never reach here
    throw new Error('No fallback strategies defined');
  }
  
  /**
   * Execute with circuit breaker pattern
   */
  static createCircuitBreaker<T>(
    handler: FallbackHandler<T>,
    options: {
      threshold: number;
      timeout: number;
      resetTimeout: number;
      fallback?: FallbackHandler<T>;
    }
  ): FallbackHandler<T> {
    let failures = 0;
    let lastFailureTime = 0;
    let circuitOpen = false;
    let resetTimer: NodeJS.Timeout | null = null;
    
    return async () => {
      // Check if circuit should be reset
      if (circuitOpen && Date.now() - lastFailureTime > options.resetTimeout) {
        circuitOpen = false;
        failures = 0;
      }
      
      // If circuit is open, use fallback or throw
      if (circuitOpen) {
        if (options.fallback) {
          return await Promise.resolve(options.fallback());
        }
        throw new Error('Circuit breaker is open');
      }
      
      try {
        const result = await this.executeWithTimeout(handler, options.timeout);
        
        // Reset failures on success
        failures = 0;
        return result;
      } catch (error) {
        failures++;
        lastFailureTime = Date.now();
        
        if (failures >= options.threshold) {
          circuitOpen = true;
          
          // Set reset timer
          if (resetTimer) clearTimeout(resetTimer);
          resetTimer = setTimeout(() => {
            circuitOpen = false;
            failures = 0;
          }, options.resetTimeout);
        }
        
        throw error;
      }
    };
  }
  
  /**
   * Execute with retry and exponential backoff
   */
  static async withRetry<T>(
    handler: FallbackHandler<T>,
    options: {
      maxRetries: number;
      initialDelay?: number;
      maxDelay?: number;
      factor?: number;
      shouldRetry?: (error: Error, attempt: number) => boolean;
      onRetry?: (attempt: number, delay: number, error: Error) => void;
    }
  ): Promise<T> {
    const initialDelay = options.initialDelay || 100;
    const maxDelay = options.maxDelay || 10000;
    const factor = options.factor || 2;
    
    let lastError: Error;
    
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      try {
        return await Promise.resolve(handler());
      } catch (error) {
        lastError = error as Error;
        
        // Check if we should retry
        if (attempt === options.maxRetries) {
          throw lastError;
        }
        
        if (options.shouldRetry && !options.shouldRetry(lastError, attempt)) {
          throw lastError;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          initialDelay * Math.pow(factor, attempt),
          maxDelay
        );
        
        options.onRetry?.(attempt + 1, delay, lastError);
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
  
  /**
   * Execute with bulkhead isolation
   */
  static createBulkhead<T>(
    handler: FallbackHandler<T>,
    options: {
      maxConcurrent: number;
      maxQueued?: number;
      timeout?: number;
      fallback?: FallbackHandler<T>;
    }
  ): FallbackHandler<T> {
    let running = 0;
    const queue: Array<{
      resolve: (value: T) => void;
      reject: (error: Error) => void;
    }> = [];
    
    const processNext = async () => {
      if (queue.length === 0 || running >= options.maxConcurrent) {
        return;
      }
      
      const { resolve, reject } = queue.shift()!;
      running++;
      
      try {
        const result = await this.executeWithTimeout(handler, options.timeout);
        resolve(result);
      } catch (error) {
        reject(error as Error);
      } finally {
        running--;
        processNext(); // Process next in queue
      }
    };
    
    return () => {
      return new Promise<T>((resolve, reject) => {
        // Check if we're at capacity
        if (running >= options.maxConcurrent && 
            queue.length >= (options.maxQueued || 10)) {
          if (options.fallback) {
            resolve(Promise.resolve(options.fallback()));
          } else {
            reject(new Error('Bulkhead capacity exceeded'));
          }
          return;
        }
        
        // Add to queue
        queue.push({ resolve, reject });
        processNext();
      });
    };
  }
  
  /**
   * Combine multiple patterns
   */
  static compose<T>(
    handler: FallbackHandler<T>,
    patterns: Array<{
      type: 'retry' | 'circuitBreaker' | 'bulkhead' | 'fallback';
      options: any;
    }>
  ): FallbackHandler<T> {
    let composedHandler = handler;
    
    // Apply patterns in reverse order (so they execute in the right order)
    for (const pattern of patterns.reverse()) {
      switch (pattern.type) {
        case 'retry':
          const retryHandler = composedHandler;
          composedHandler = () => this.withRetry(retryHandler, pattern.options);
          break;
          
        case 'circuitBreaker':
          composedHandler = this.createCircuitBreaker(composedHandler, pattern.options);
          break;
          
        case 'bulkhead':
          composedHandler = this.createBulkhead(composedHandler, pattern.options);
          break;
          
        case 'fallback':
          const primaryHandler = composedHandler;
          composedHandler = () => this.withFallback(
            primaryHandler,
            pattern.options.handler,
            pattern.options
          );
          break;
      }
    }
    
    return composedHandler;
  }
  
  /**
   * Execute with timeout
   */
  private static async executeWithTimeout<T>(
    handler: FallbackHandler<T>,
    timeout?: number
  ): Promise<T> {
    if (!timeout) {
      return await Promise.resolve(handler());
    }
    
    return Promise.race([
      Promise.resolve(handler()),
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timed out')), timeout);
      }),
    ]);
  }
}

// Pre-configured strategies for common use cases
export const CommonStrategies = {
  /**
   * API call with retry and fallback to cache
   */
  apiWithCache: <T>(
    apiCall: FallbackHandler<T>,
    cacheCall: FallbackHandler<T>,
    options?: {
      maxRetries?: number;
      timeout?: number;
    }
  ) => {
    return FallbackStrategy.compose(apiCall, [
      {
        type: 'retry',
        options: {
          maxRetries: options?.maxRetries || 3,
          initialDelay: 100,
          shouldRetry: (error: Error) => {
            // Retry on network errors, not on 4xx errors
            return !error.message.includes('4');
          },
        },
      },
      {
        type: 'fallback',
        options: {
          handler: cacheCall,
          timeout: options?.timeout || 5000,
        },
      },
    ]);
  },
  
  /**
   * Database query with circuit breaker
   */
  databaseQuery: <T>(
    query: FallbackHandler<T>,
    options?: {
      threshold?: number;
      resetTimeout?: number;
    }
  ) => {
    return FallbackStrategy.createCircuitBreaker(query, {
      threshold: options?.threshold || 5,
      timeout: 30000,
      resetTimeout: options?.resetTimeout || 60000,
    });
  },
  
  /**
   * Resource-intensive operation with bulkhead
   */
  resourceIntensive: <T>(
    operation: FallbackHandler<T>,
    options?: {
      maxConcurrent?: number;
      fallback?: FallbackHandler<T>;
    }
  ) => {
    return FallbackStrategy.createBulkhead(operation, {
      maxConcurrent: options?.maxConcurrent || 5,
      maxQueued: 20,
      timeout: 60000,
      fallback: options?.fallback,
    });
  },
};