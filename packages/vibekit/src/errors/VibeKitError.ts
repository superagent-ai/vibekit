/**
 * Custom error types for VibeKit SDK
 */

export type ErrorCategory = 'agent' | 'sandbox' | 'telemetry' | 'validation' | 'network' | 'system';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
  category: ErrorCategory;
  severity: ErrorSeverity;
  retryable: boolean;
  correlationId?: string;
  metadata?: Record<string, any>;
}

/**
 * Base error class for all VibeKit errors
 */
export class VibeKitError extends Error {
  public readonly context: ErrorContext;
  public readonly timestamp: Date;
  public readonly originalError?: Error;

  constructor(
    message: string,
    context: Partial<ErrorContext> = {},
    originalError?: Error
  ) {
    super(message);
    this.name = 'VibeKitError';
    this.timestamp = new Date();
    this.originalError = originalError;
    
    this.context = {
      category: context.category || 'system',
      severity: context.severity || 'medium',
      retryable: context.retryable ?? false,
      correlationId: context.correlationId,
      metadata: context.metadata
    };

    // Ensure proper prototype chain
    Object.setPrototypeOf(this, VibeKitError.prototype);
  }

  /**
   * Create a validation error
   */
  static validation(message: string, field?: string, value?: any): VibeKitError {
    return new VibeKitError(message, {
      category: 'validation',
      severity: 'low',
      retryable: false,
      metadata: { field, value }
    });
  }

  /**
   * Create an agent error
   */
  static agent(message: string, agentType?: string, originalError?: Error): VibeKitError {
    return new VibeKitError(message, {
      category: 'agent',
      severity: 'high',
      retryable: true,
      metadata: { agentType }
    }, originalError);
  }

  /**
   * Create a sandbox error
   */
  static sandbox(message: string, sandboxId?: string, originalError?: Error): VibeKitError {
    return new VibeKitError(message, {
      category: 'sandbox',
      severity: 'high',
      retryable: true,
      metadata: { sandboxId }
    }, originalError);
  }

  /**
   * Create a telemetry error
   */
  static telemetry(message: string, originalError?: Error): VibeKitError {
    return new VibeKitError(message, {
      category: 'telemetry',
      severity: 'low',
      retryable: false
    }, originalError);
  }

  /**
   * Create a network error
   */
  static network(message: string, url?: string, originalError?: Error): VibeKitError {
    return new VibeKitError(message, {
      category: 'network',
      severity: 'medium',
      retryable: true,
      metadata: { url }
    }, originalError);
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return this.context.retryable;
  }

  /**
   * Convert to JSON for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
      context: this.context,
      stack: this.stack,
      originalError: this.originalError ? {
        name: this.originalError.name,
        message: this.originalError.message,
        stack: this.originalError.stack
      } : undefined
    };
  }
}

/**
 * Validation error for input validation failures
 */
export class ValidationError extends VibeKitError {
  constructor(message: string, field?: string, value?: any) {
    super(message, {
      category: 'validation',
      severity: 'low',
      retryable: false,
      metadata: { field, value }
    });
    this.name = 'ValidationError';
  }
}

/**
 * Agent error for agent-related failures
 */
export class AgentError extends VibeKitError {
  constructor(message: string, agentType?: string, originalError?: Error) {
    super(message, {
      category: 'agent',
      severity: 'high',
      retryable: true,
      metadata: { agentType }
    }, originalError);
    this.name = 'AgentError';
  }
}

/**
 * Sandbox error for sandbox-related failures
 */
export class SandboxError extends VibeKitError {
  constructor(message: string, sandboxId?: string, originalError?: Error) {
    super(message, {
      category: 'sandbox',
      severity: 'high',
      retryable: true,
      metadata: { sandboxId }
    }, originalError);
    this.name = 'SandboxError';
  }
}