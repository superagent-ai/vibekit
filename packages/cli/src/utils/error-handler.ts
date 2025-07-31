import chalk from 'chalk';

export interface CLIError extends Error {
  code?: string;
  suggestions?: string[];
  retryable?: boolean;
}

export class CLIValidationError extends Error implements CLIError {
  code = 'VALIDATION_ERROR';
  
  constructor(message: string, public suggestions?: string[]) {
    super(message);
    this.name = 'CLIValidationError';
  }
}

export class CLINetworkError extends Error implements CLIError {
  code = 'NETWORK_ERROR';
  retryable = true;
  
  constructor(message: string, public suggestions?: string[]) {
    super(message);
    this.name = 'CLINetworkError';
  }
}

export class CLIConfigError extends Error implements CLIError {
  code = 'CONFIG_ERROR';
  
  constructor(message: string, public suggestions?: string[]) {
    super(message);
    this.name = 'CLIConfigError';
  }
}

export class CLIEnvironmentError extends Error implements CLIError {
  code = 'ENVIRONMENT_ERROR';
  
  constructor(message: string, public suggestions?: string[]) {
    super(message);
    this.name = 'CLIEnvironmentError';
  }
}

/**
 * Format error message with proper styling and suggestions
 */
export function formatError(error: Error | CLIError | unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error);
  let output = chalk.red(`\n❌ ${errorMessage}`);
  
  if (error instanceof Error && 'suggestions' in error) {
    const suggestions = (error as CLIError).suggestions;
    if (suggestions && suggestions.length > 0) {
      output += '\n\n' + chalk.yellow('💡 Suggestions:');
      suggestions.forEach(suggestion => {
        output += '\n   ' + chalk.yellow(`• ${suggestion}`);
      });
    }
  }
  
  return output;
}

/**
 * Handle error with proper formatting and exit code
 */
export function handleError(error: Error | CLIError | unknown, exitCode: number = 1): void {
  console.error(formatError(error));
  
  if (process.env.DEBUG) {
    console.error('\n' + chalk.gray('Stack trace:'));
    console.error(chalk.gray(error instanceof Error ? error.stack : 'No stack trace available'));
  }
  
  process.exit(exitCode);
}

/**
 * Retry an operation with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    onRetry
  } = options;
  
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Check if error is retryable
      if ('retryable' in lastError && !lastError.retryable) {
        throw lastError;
      }
      
      if (attempt === maxAttempts) {
        throw lastError;
      }
      
      const delay = Math.min(initialDelay * Math.pow(2, attempt - 1), maxDelay);
      
      if (onRetry) {
        onRetry(attempt, lastError);
      } else {
        console.warn(chalk.yellow(`⚠️  Operation failed (attempt ${attempt}/${maxAttempts}), retrying in ${delay}ms...`));
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Validate required environment variables
 */
export function validateEnvVars(required: Record<string, string>): void {
  const missing: string[] = [];
  
  for (const [key, description] of Object.entries(required)) {
    if (!process.env[key]) {
      missing.push(`${key}: ${description}`);
    }
  }
  
  if (missing.length > 0) {
    throw new CLIConfigError(
      `Missing required environment variables:\n${missing.map(m => `  • ${m}`).join('\n')}`,
      [
        'Create a .env file with the required variables',
        'Set environment variables in your shell',
        'Use the --env flag to specify variables'
      ]
    );
  }
}

/**
 * Wrap async command handlers with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args);
    } catch (error) {
      handleError(error);
    }
  }) as T;
}