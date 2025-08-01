/**
 * Custom error types for @vibe-kit/db package
 */

export class DatabaseError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'DatabaseError';
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

export class ConnectionError extends DatabaseError {
  constructor(message: string, originalError?: Error) {
    super(message, 'CONNECTION_ERROR', originalError);
    this.name = 'ConnectionError';
  }
}

export class QueryError extends DatabaseError {
  constructor(
    message: string,
    public readonly query?: string,
    originalError?: Error
  ) {
    super(message, 'QUERY_ERROR', originalError);
    this.name = 'QueryError';
  }
}

export class ValidationError extends DatabaseError {
  constructor(
    message: string,
    public readonly field?: string,
    public readonly value?: any
  ) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class MigrationError extends DatabaseError {
  constructor(message: string, originalError?: Error) {
    super(message, 'MIGRATION_ERROR', originalError);
    this.name = 'MigrationError';
  }
}

/**
 * Wrap database operations with proper error handling
 */
export async function withDatabaseErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // Handle specific SQLite errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (message.includes('database is locked')) {
        throw new DatabaseError(
          `Database is locked during ${context}. Try again later.`,
          'SQLITE_BUSY',
          error
        );
      }
      
      if (message.includes('no such table')) {
        throw new DatabaseError(
          `Database table not found during ${context}. Run migrations first.`,
          'SQLITE_ERROR',
          error
        );
      }
      
      if (message.includes('constraint failed')) {
        throw new ValidationError(
          `Database constraint violation during ${context}: ${error.message}`
        );
      }
      
      if (message.includes('disk i/o error')) {
        throw new ConnectionError(
          `Database I/O error during ${context}`,
          error
        );
      }
    }
    
    // Generic database error
    throw new DatabaseError(
      `Database operation failed during ${context}: ${(error as Error).message}`,
      'UNKNOWN_ERROR',
      error as Error
    );
  }
}