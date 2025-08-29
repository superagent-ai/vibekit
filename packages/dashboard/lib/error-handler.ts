/**
 * Comprehensive error handling system for VibeKit Dashboard
 * 
 * Provides:
 * - Structured error classification and handling
 * - Error recovery strategies
 * - User-friendly error messages
 * - Error reporting and tracking
 * - Consistent error responses for APIs
 * - Circuit breaker patterns for external services
 */

import { NextResponse } from 'next/server';
import { createLogger } from './structured-logger';
import { ValidationError } from './security-utils';

const logger = createLogger('ErrorHandler');

/**
 * Error categories for classification and handling
 */
export enum ErrorCategory {
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  RATE_LIMIT = 'rate_limit',
  RESOURCE_LIMIT = 'resource_limit',
  NETWORK = 'network',
  EXTERNAL_SERVICE = 'external_service',
  FILE_SYSTEM = 'file_system',
  DATABASE = 'database',
  DOCKER = 'docker',
  INTERNAL = 'internal',
  USER_INPUT = 'user_input',
  TIMEOUT = 'timeout',
  MEMORY = 'memory',
  PERMISSION = 'permission'
}

/**
 * Error severity levels
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Structured error interface
 */
export interface StructuredError {
  category: ErrorCategory;
  severity: ErrorSeverity;
  code: string;
  message: string;
  userMessage: string;
  details?: any;
  cause?: unknown;
  context?: Record<string, any>;
  timestamp: number;
  requestId?: string;
  sessionId?: string;
  executionId?: string;
  retryable: boolean;
  retryAfter?: number; // seconds
}

/**
 * Error recovery strategies
 */
export enum RecoveryStrategy {
  RETRY = 'retry',
  FALLBACK = 'fallback',
  DEGRADE = 'degrade',
  FAIL_FAST = 'fail_fast',
  CIRCUIT_BREAK = 'circuit_break'
}

/**
 * Base class for all custom errors in VibeKit Dashboard
 * 
 * Provides structured error information including category, severity,
 * user-friendly messages, and recovery guidance.
 * 
 * @example
 * ```typescript
 * throw new BaseError(
 *   ErrorCategory.VALIDATION,
 *   ErrorSeverity.MEDIUM,
 *   'INVALID_INPUT',
 *   'Username must be at least 3 characters',
 *   'Please enter a username with at least 3 characters'
 * );
 * ```
 */
export class BaseError extends Error {
  public readonly category: ErrorCategory;
  public readonly severity: ErrorSeverity;
  public readonly code: string;
  public readonly userMessage: string;
  public readonly retryable: boolean;
  public readonly retryAfter?: number;
  public readonly context: Record<string, any>;
  public readonly timestamp: number;

  /**
   * Creates a new BaseError instance
   * 
   * @param category - The error category for classification
   * @param severity - The severity level of the error
   * @param code - A unique error code for identification
   * @param message - Technical error message for developers
   * @param userMessage - User-friendly error message
   * @param options - Additional error options
   */
  constructor(
    category: ErrorCategory,
    severity: ErrorSeverity,
    code: string,
    message: string,
    userMessage: string,
    options: {
      retryable?: boolean;
      retryAfter?: number;
      context?: Record<string, any>;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.category = category;
    this.severity = severity;
    this.code = code;
    this.userMessage = userMessage;
    this.retryable = options.retryable ?? false;
    this.retryAfter = options.retryAfter;
    this.context = options.context ?? {};
    this.timestamp = Date.now();

    // Preserve original error stack
    if (options.cause) {
      this.stack = `${this.stack}\nCaused by: ${options.cause.stack}`;
    }
    
    // Set cause properly
    this.cause = options.cause as Error;
  }

  /**
   * Converts the error to a structured format for logging and API responses
   * 
   * @returns Structured error object with all error details
   */
  toStructured(): StructuredError {
    return {
      category: this.category,
      severity: this.severity,
      code: this.code,
      message: this.message,
      userMessage: this.userMessage,
      details: this.context,
      cause: this.cause,
      context: this.context,
      timestamp: this.timestamp,
      retryable: this.retryable,
      retryAfter: this.retryAfter
    };
  }
}

/**
 * Specific error types for different failure scenarios
 * 
 * These error classes extend BaseError with specific defaults
 * for common error patterns in the VibeKit Dashboard.
 */
/**
 * Validation error for invalid input or data
 * 
 * @example
 * ```typescript
 * throw new VibeKitValidationError('Email format is invalid', 'email');
 * ```
 */
export class VibeKitValidationError extends BaseError {
  /**
   * Creates a validation error
   * 
   * @param message - Technical error message
   * @param field - The field that failed validation (optional)
   * @param userMessage - User-friendly message (optional)
   */
  constructor(message: string, field?: string, userMessage?: string) {
    super(
      ErrorCategory.VALIDATION,
      ErrorSeverity.LOW,
      'VALIDATION_FAILED',
      message,
      userMessage || 'Invalid input provided',
      { context: { field } }
    );
  }
}

/**
 * Error for when resource limits are exceeded
 * 
 * @example
 * ```typescript
 * throw new ResourceLimitError('concurrent_executions', 5, 6);
 * ```
 */
export class ResourceLimitError extends BaseError {
  /**
   * Creates a resource limit error
   * 
   * @param resource - The resource that exceeded its limit
   * @param limit - The maximum allowed value
   * @param current - The current value that exceeded the limit
   */
  constructor(resource: string, limit: number, current: number) {
    super(
      ErrorCategory.RESOURCE_LIMIT,
      ErrorSeverity.MEDIUM,
      'RESOURCE_LIMIT_EXCEEDED',
      `${resource} limit exceeded: ${current}/${limit}`,
      'System is currently at capacity. Please try again in a moment.',
      { 
        retryable: true, 
        retryAfter: 60,
        context: { resource, limit, current } 
      }
    );
  }
}

/**
 * Authentication failure error
 * 
 * Used when authentication credentials are invalid or missing.
 */
export class AuthenticationError extends BaseError {
  /**
   * Creates an authentication error
   * 
   * @param message - Technical error message
   * @param cause - The underlying error that caused this failure
   */
  constructor(message: string, cause?: Error) {
    super(
      ErrorCategory.AUTHENTICATION,
      ErrorSeverity.HIGH,
      'AUTHENTICATION_FAILED',
      message,
      'Authentication failed. Please check your credentials.',
      { cause }
    );
  }
}

/**
 * Docker-related error
 * 
 * Used when Docker operations fail or Docker is not available.
 */
export class DockerError extends BaseError {
  /**
   * Creates a Docker error
   * 
   * @param message - Technical error message
   * @param cause - The underlying error that caused this failure
   */
  constructor(message: string, cause?: Error) {
    super(
      ErrorCategory.DOCKER,
      ErrorSeverity.HIGH,
      'DOCKER_ERROR',
      message,
      'Docker is not available. Please ensure Docker Desktop is running.',
      { 
        retryable: true,
        retryAfter: 30,
        cause 
      }
    );
  }
}

/**
 * Network operation error
 * 
 * Used when network requests fail or timeout.
 */
export class NetworkError extends BaseError {
  /**
   * Creates a network error
   * 
   * @param message - Technical error message
   * @param url - The URL that failed (optional)
   * @param cause - The underlying error that caused this failure
   */
  constructor(message: string, url?: string, cause?: Error) {
    super(
      ErrorCategory.NETWORK,
      ErrorSeverity.MEDIUM,
      'NETWORK_ERROR',
      message,
      'Network error occurred. Please check your connection.',
      { 
        retryable: true,
        retryAfter: 10,
        context: { url },
        cause 
      }
    );
  }
}

/**
 * File system operation error
 * 
 * Used when file operations like read, write, or delete fail.
 */
export class FileSystemError extends BaseError {
  /**
   * Creates a file system error
   * 
   * @param message - Technical error message
   * @param path - The file path that failed (optional)
   * @param operation - The operation that failed (optional)
   * @param cause - The underlying error that caused this failure
   */
  constructor(message: string, path?: string, operation?: string, cause?: Error) {
    super(
      ErrorCategory.FILE_SYSTEM,
      ErrorSeverity.MEDIUM,
      'FILE_SYSTEM_ERROR',
      message,
      'File operation failed. Please try again.',
      { 
        retryable: true,
        retryAfter: 5,
        context: { path, operation },
        cause 
      }
    );
  }
}

/**
 * Timeout error for operations that exceed time limits
 */
export class TimeoutError extends BaseError {
  /**
   * Creates a timeout error
   * 
   * @param operation - The operation that timed out
   * @param timeout - The timeout value in milliseconds
   */
  constructor(operation: string, timeout: number) {
    super(
      ErrorCategory.TIMEOUT,
      ErrorSeverity.MEDIUM,
      'OPERATION_TIMEOUT',
      `Operation '${operation}' timed out after ${timeout}ms`,
      'Operation took too long. Please try again.',
      { 
        retryable: true,
        retryAfter: 30,
        context: { operation, timeout } 
      }
    );
  }
}

/**
 * Memory-related error
 * 
 * Used when the system runs out of memory or exceeds memory limits.
 */
export class MemoryError extends BaseError {
  /**
   * Creates a memory error
   * 
   * @param message - Technical error message
   * @param memoryUsage - Current memory usage in bytes (optional)
   */
  constructor(message: string, memoryUsage?: number) {
    super(
      ErrorCategory.MEMORY,
      ErrorSeverity.HIGH,
      'MEMORY_ERROR',
      message,
      'System is running low on memory. Please try again later.',
      { 
        retryable: true,
        retryAfter: 120,
        context: { memoryUsage } 
      }
    );
  }
}

/**
 * Error classification utility
 * 
 * Provides intelligent error classification and structured error creation
 * from various error types including JavaScript errors, validation errors,
 * and custom application errors.
 */
class ErrorClassifierImpl {
  /**
   * Classify an unknown error into a structured error format
   * 
   * This method analyzes the error and creates appropriate structured
   * error information with proper categorization and user messages.
   * 
   * @param error - The error to classify (can be Error, string, or any type)
   * @returns Structured error object with classification and context
   * 
   * @example
   * ```typescript
   * try {
   *   // Some operation
   * } catch (error) {
   *   const structured = ErrorClassifier.classify(error);
   *   console.log(structured.category); // 'validation', 'network', etc.
   * }
   * ```
   */
  static classify(error: Error | any): StructuredError {
    // Handle already structured errors
    if (error instanceof BaseError) {
      return error.toStructured();
    }

    // Handle known error types from security-utils
    if (error.name === 'ValidationError' && error.field) {
      return new VibeKitValidationError(error.message, error.field).toStructured();
    }

    // Classify by error message patterns
    const message = error.message || String(error);
    const lowerMessage = message.toLowerCase();

    // Docker-related errors
    if (lowerMessage.includes('docker') || 
        lowerMessage.includes('container') ||
        message.includes('Cannot connect to the Docker daemon')) {
      return new DockerError(message, error).toStructured();
    }

    // Network errors
    if (lowerMessage.includes('network') ||
        lowerMessage.includes('econnrefused') ||
        lowerMessage.includes('etimedout') ||
        lowerMessage.includes('fetch failed')) {
      return new NetworkError(message, undefined, error).toStructured();
    }

    // File system errors
    if (lowerMessage.includes('enoent') ||
        lowerMessage.includes('eacces') ||
        lowerMessage.includes('file') ||
        lowerMessage.includes('directory')) {
      return new FileSystemError(message, undefined, undefined, error).toStructured();
    }

    // Authentication errors
    if (lowerMessage.includes('unauthorized') ||
        lowerMessage.includes('authentication') ||
        lowerMessage.includes('api key') ||
        lowerMessage.includes('token')) {
      return new AuthenticationError(message, error).toStructured();
    }

    // Rate limiting
    if (lowerMessage.includes('rate limit') ||
        lowerMessage.includes('too many requests') ||
        lowerMessage.includes('quota exceeded')) {
      return new ResourceLimitError('rate_limit', 0, 0).toStructured();
    }

    // Timeout errors
    if (lowerMessage.includes('timeout') ||
        lowerMessage.includes('timed out')) {
      return new TimeoutError('unknown', 0).toStructured();
    }

    // Memory errors
    if (lowerMessage.includes('memory') ||
        lowerMessage.includes('heap') ||
        lowerMessage.includes('out of memory')) {
      return new MemoryError(message).toStructured();
    }

    // Default to internal error
    return new BaseError(
      ErrorCategory.INTERNAL,
      ErrorSeverity.HIGH,
      'INTERNAL_ERROR',
      message,
      'An unexpected error occurred. Please try again.',
      { cause: error }
    ).toStructured();
  }
}

/**
 * Error response helper for APIs
 */
class ErrorResponseImpl {
  /**
   * Create a standardized error response for APIs
   */
  static create(error: Error | StructuredError, requestId?: string): NextResponse {
    const structuredError = error instanceof Error 
      ? ErrorClassifierImpl.classify(error)
      : error;

    // Add request ID if provided
    if (requestId) {
      structuredError.requestId = requestId;
    }

    // Log the error
    logger.error(`API Error: ${structuredError.code}`, {
      category: structuredError.category,
      severity: structuredError.severity,
      code: structuredError.code,
      message: structuredError.message,
      userMessage: structuredError.userMessage,
      retryable: structuredError.retryable,
      retryAfter: structuredError.retryAfter,
      requestId: structuredError.requestId,
      sessionId: structuredError.sessionId,
      executionId: structuredError.executionId,
      context: structuredError.context
    });

    // Determine HTTP status code
    const statusCode = ErrorResponseImpl.getStatusCode(structuredError);

    // Create response body
    const responseBody = {
      success: false,
      error: {
        code: structuredError.code,
        message: structuredError.userMessage,
        category: structuredError.category,
        retryable: structuredError.retryable,
        retryAfter: structuredError.retryAfter,
        timestamp: structuredError.timestamp,
        requestId: structuredError.requestId
      },
      // Include details in development
      ...(process.env.NODE_ENV === 'development' && {
        debug: {
          originalMessage: structuredError.message,
          details: structuredError.details,
          context: structuredError.context
        }
      })
    };

    // Set appropriate headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (structuredError.retryAfter) {
      headers['Retry-After'] = String(structuredError.retryAfter);
    }

    return NextResponse.json(responseBody, { 
      status: statusCode,
      headers 
    });
  }

  /**
   * Get appropriate HTTP status code for error category
   */
  static getStatusCode(error: StructuredError): number {
    switch (error.category) {
      case ErrorCategory.VALIDATION:
      case ErrorCategory.USER_INPUT:
        return 400;
      case ErrorCategory.AUTHENTICATION:
        return 401;
      case ErrorCategory.AUTHORIZATION:
      case ErrorCategory.PERMISSION:
        return 403;
      case ErrorCategory.RATE_LIMIT:
      case ErrorCategory.RESOURCE_LIMIT:
        return 429;
      case ErrorCategory.TIMEOUT:
        return 408;
      case ErrorCategory.NETWORK:
      case ErrorCategory.EXTERNAL_SERVICE:
        return 502;
      case ErrorCategory.DOCKER:
        return 503;
      case ErrorCategory.MEMORY:
      case ErrorCategory.FILE_SYSTEM:
      case ErrorCategory.DATABASE:
        return 500;
      default:
        return error.severity === ErrorSeverity.CRITICAL ? 500 : 400;
    }
  }
}

/**
 * Circuit breaker for external services
 */
class CircuitBreakerImpl {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private threshold = 5,
    private timeout = 60000, // 1 minute
    private resetTimeout = 300000 // 5 minutes
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new BaseError(
          ErrorCategory.EXTERNAL_SERVICE,
          ErrorSeverity.MEDIUM,
          'CIRCUIT_BREAKER_OPEN',
          'Circuit breaker is open',
          'Service is temporarily unavailable',
          { retryable: true, retryAfter: 60 }
        );
      }
    }

    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new TimeoutError('circuit_breaker', this.timeout)), this.timeout)
        )
      ]);

      // Reset on success
      this.failures = 0;
      if (this.state === 'half-open') {
        this.state = 'closed';
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this.threshold) {
        this.state = 'open';
      }

      throw error;
    }
  }

  getState(): { state: string; failures: number; lastFailureTime: number } {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
    this.state = 'closed';
  }
}

/**
 * Retry utility with exponential backoff
 */
class RetryHandlerImpl {
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      baseDelay?: number;
      maxDelay?: number;
      backoffFactor?: number;
      retryCondition?: (error: any) => boolean;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      backoffFactor = 2,
      retryCondition = (error) => {
        const structured = ErrorClassifierImpl.classify(error);
        return structured.retryable;
      }
    } = options;

    let lastError: any;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry on last attempt or if not retryable
        if (attempt === maxAttempts || !retryCondition(error)) {
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          baseDelay * Math.pow(backoffFactor, attempt - 1),
          maxDelay
        );

        logger.warn('Operation failed, retrying', {
          attempt,
          maxAttempts,
          delay,
          error: error instanceof Error ? error.message : String(error)
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError;
  }
}

/**
 * Global error boundary for unhandled errors
 */
class GlobalErrorHandlerImpl {
  private static instance: GlobalErrorHandlerImpl;
  private circuitBreakers = new Map<string, CircuitBreakerImpl>();

  static getInstance(): GlobalErrorHandlerImpl {
    if (!GlobalErrorHandlerImpl.instance) {
      GlobalErrorHandlerImpl.instance = new GlobalErrorHandlerImpl();
    }
    return GlobalErrorHandlerImpl.instance;
  }

  /**
   * Get or create circuit breaker for a service
   */
  getCircuitBreaker(serviceName: string): CircuitBreakerImpl {
    if (!this.circuitBreakers.has(serviceName)) {
      this.circuitBreakers.set(serviceName, new CircuitBreakerImpl());
    }
    return this.circuitBreakers.get(serviceName)!;
  }

  /**
   * Handle unhandled promise rejections
   */
  setupGlobalHandlers(): void {
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled promise rejection', {
        reason: String(reason),
        promise: String(promise),
        severity: ErrorSeverity.CRITICAL
      });
    });

    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', {
        error: error.message,
        stack: error.stack,
        severity: ErrorSeverity.CRITICAL
      });
      
      // Give logger time to flush, then exit
      setTimeout(() => process.exit(1), 1000);
    });
  }
}

// Initialize global error handling
const globalErrorHandler = GlobalErrorHandlerImpl.getInstance();
globalErrorHandler.setupGlobalHandlers();

// Export instances with original names
export const ErrorClassifier = ErrorClassifierImpl;
export const ErrorResponse = ErrorResponseImpl;
export const CircuitBreaker = CircuitBreakerImpl;
export const RetryHandler = RetryHandlerImpl;

export {
  globalErrorHandler
};