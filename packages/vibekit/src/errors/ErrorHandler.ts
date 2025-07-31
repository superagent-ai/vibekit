import { VibeKitError, ErrorContext } from './VibeKitError.js';

export interface ErrorHandlerOptions {
  onError?: (error: VibeKitError) => void;
  onCriticalError?: (error: VibeKitError) => void;
  enableLogging?: boolean;
  correlationIdGenerator?: () => string;
}

/**
 * Centralized error handler for VibeKit
 */
export class ErrorHandler {
  private options: ErrorHandlerOptions;
  private errorCount = 0;
  private errorsByCategory = new Map<string, number>();

  constructor(options: ErrorHandlerOptions = {}) {
    this.options = {
      enableLogging: true,
      correlationIdGenerator: () => `vk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...options
    };
  }

  /**
   * Handle an error with proper logging and callbacks
   */
  handle(error: Error | VibeKitError, context?: Partial<ErrorContext>): VibeKitError {
    // Convert to VibeKitError if needed
    const vibeKitError = error instanceof VibeKitError 
      ? error 
      : new VibeKitError(error.message, context, error);

    // Add correlation ID if not present
    if (!vibeKitError.context.correlationId && this.options.correlationIdGenerator) {
      vibeKitError.context.correlationId = this.options.correlationIdGenerator();
    }

    // Update statistics
    this.errorCount++;
    const category = vibeKitError.context.category;
    this.errorsByCategory.set(category, (this.errorsByCategory.get(category) || 0) + 1);

    // Log error if enabled
    if (this.options.enableLogging) {
      this.logError(vibeKitError);
    }

    // Call error callback
    if (this.options.onError) {
      this.options.onError(vibeKitError);
    }

    // Call critical error callback for high/critical severity
    if (vibeKitError.context.severity === 'critical' || vibeKitError.context.severity === 'high') {
      if (this.options.onCriticalError) {
        this.options.onCriticalError(vibeKitError);
      }
    }

    return vibeKitError;
  }

  /**
   * Handle async errors with proper error handling
   */
  async handleAsync<T>(
    operation: () => Promise<T>,
    context?: Partial<ErrorContext>
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw this.handle(error as Error, context);
    }
  }

  /**
   * Wrap a function with error handling
   */
  wrap<T extends (...args: any[]) => any>(
    fn: T,
    context?: Partial<ErrorContext>
  ): T {
    return ((...args: Parameters<T>) => {
      try {
        const result = fn(...args);
        if (result instanceof Promise) {
          return result.catch((error) => {
            throw this.handle(error, context);
          });
        }
        return result;
      } catch (error) {
        throw this.handle(error as Error, context);
      }
    }) as T;
  }

  /**
   * Execute with retry logic
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      backoff?: number;
      retryCondition?: (error: VibeKitError) => boolean;
    } = {}
  ): Promise<T> {
    const { maxRetries = 3, backoff = 1000, retryCondition } = options;
    let lastError: VibeKitError | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.handle(error as Error);
        
        // Check if we should retry
        const shouldRetry = retryCondition 
          ? retryCondition(lastError) 
          : lastError.isRetryable();

        if (!shouldRetry || attempt === maxRetries) {
          throw lastError;
        }

        // Wait before retrying with exponential backoff
        await new Promise(resolve => setTimeout(resolve, backoff * Math.pow(2, attempt)));
      }
    }

    throw lastError!;
  }

  /**
   * Log error with appropriate level
   */
  private logError(error: VibeKitError): void {
    const logData = {
      correlationId: error.context.correlationId,
      category: error.context.category,
      severity: error.context.severity,
      message: error.message,
      timestamp: error.timestamp.toISOString(),
      metadata: error.context.metadata,
      stack: error.stack
    };

    switch (error.context.severity) {
      case 'critical':
      case 'high':
        console.error('[VibeKit Error]', logData);
        break;
      case 'medium':
        console.warn('[VibeKit Warning]', logData);
        break;
      case 'low':
        console.log('[VibeKit Info]', logData);
        break;
    }
  }

  /**
   * Get error statistics
   */
  getStats(): {
    totalErrors: number;
    errorsByCategory: Record<string, number>;
  } {
    return {
      totalErrors: this.errorCount,
      errorsByCategory: Object.fromEntries(this.errorsByCategory)
    };
  }

  /**
   * Reset error statistics
   */
  resetStats(): void {
    this.errorCount = 0;
    this.errorsByCategory.clear();
  }
}