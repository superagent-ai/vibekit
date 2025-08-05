import { z } from 'zod';
import { createLogger } from './logger.js';

const logger = createLogger('EnvValidator');

// Define environment variable schema
const envSchema = z.object({
  // Telemetry configuration
  TELEMETRY_LOG_LEVEL: z.enum(['ERROR', 'WARN', 'INFO', 'DEBUG']).optional(),
  TELEMETRY_ALLOWED_ORIGINS: z.string().optional(),
  TELEMETRY_API_SECRET: z.string().optional(),
  TELEMETRY_API_KEYS: z.string().optional(),
  TELEMETRY_BEARER_TOKENS: z.string().optional(),
  TELEMETRY_ENCRYPTION_KEY: z.string().min(32).optional(),
  
  // Database configuration
  TELEMETRY_DB_PATH: z.string().optional(),
  TELEMETRY_DB_RETENTION_DAYS: z.coerce.number().int().min(1).max(365).optional(),
  
  // API configuration
  TELEMETRY_API_PORT: z.coerce.number().int().min(1).max(65535).optional(),
  TELEMETRY_API_HOST: z.string().optional(),
  TELEMETRY_API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).optional(),
  TELEMETRY_API_RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().min(1).optional(),
  
  // Resource monitoring
  TELEMETRY_MONITOR_CPU_THRESHOLD: z.coerce.number().min(0).max(100).optional(),
  TELEMETRY_MONITOR_MEMORY_THRESHOLD: z.coerce.number().min(0).max(100).optional(),
  TELEMETRY_MONITOR_DISK_THRESHOLD: z.coerce.number().min(0).max(100).optional(),
  
  // Export configuration
  TELEMETRY_EXPORT_MAX_BATCH_SIZE: z.coerce.number().int().min(1).max(10000).optional(),
  TELEMETRY_EXPORT_TIMEOUT_MS: z.coerce.number().int().min(1000).optional(),
  
  // Feature flags
  TELEMETRY_ENABLE_ANALYTICS: z.enum(['true', 'false', '1', '0']).transform(v => v === 'true' || v === '1').optional(),
  TELEMETRY_ENABLE_STREAMING: z.enum(['true', 'false', '1', '0']).transform(v => v === 'true' || v === '1').optional(),
  TELEMETRY_ENABLE_ALERTS: z.enum(['true', 'false', '1', '0']).transform(v => v === 'true' || v === '1').optional(),
  
  // Node.js standard
  NODE_ENV: z.enum(['development', 'test', 'production']).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).optional(),
  HOST: z.string().optional(),
});

export type ValidatedEnv = z.infer<typeof envSchema>;

export interface EnvValidationResult {
  success: boolean;
  data?: ValidatedEnv;
  errors?: Array<{
    variable: string;
    message: string;
  }>;
  warnings?: string[];
}

/**
 * Validates environment variables and returns typed, validated values
 */
export function validateEnvironment(): EnvValidationResult {
  try {
    // Parse environment variables
    const result = envSchema.safeParse(process.env);
    
    if (!result.success) {
      const errors = result.error.errors.map(err => ({
        variable: err.path.join('.'),
        message: err.message
      }));
      
      logger.error('Environment validation failed', { errors });
      
      return {
        success: false,
        errors
      };
    }
    
    const warnings: string[] = [];
    
    // Add warnings for production requirements
    if (process.env.NODE_ENV === 'production') {
      if (!result.data.TELEMETRY_ALLOWED_ORIGINS) {
        warnings.push('TELEMETRY_ALLOWED_ORIGINS not set - CORS will be restrictive');
      }
      if (!result.data.TELEMETRY_API_SECRET) {
        warnings.push('TELEMETRY_API_SECRET not set - API authentication disabled');
      }
      if (!result.data.TELEMETRY_ENCRYPTION_KEY) {
        warnings.push('TELEMETRY_ENCRYPTION_KEY not set - data encryption disabled');
      }
      if (result.data.TELEMETRY_LOG_LEVEL === 'DEBUG') {
        warnings.push('DEBUG logging enabled in production - may impact performance');
      }
    }
    
    // Log warnings
    warnings.forEach(warning => logger.warn(warning));
    
    return {
      success: true,
      data: result.data,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  } catch (error) {
    logger.error('Failed to validate environment', error);
    return {
      success: false,
      errors: [{
        variable: 'unknown',
        message: error instanceof Error ? error.message : 'Unknown error'
      }]
    };
  }
}

/**
 * Gets a validated environment variable with type safety
 */
export function getEnvVar<K extends keyof ValidatedEnv>(
  key: K,
  defaultValue?: ValidatedEnv[K]
): ValidatedEnv[K] | undefined {
  const validation = validateEnvironment();
  if (validation.success && validation.data) {
    return validation.data[key] ?? defaultValue;
  }
  return defaultValue;
}

/**
 * Validates environment on module load and logs any issues
 */
export function initializeEnvironment(): void {
  const result = validateEnvironment();
  
  if (!result.success) {
    logger.error('Environment validation failed on initialization');
    if (result.errors) {
      result.errors.forEach(error => {
        logger.error(`  ${error.variable}: ${error.message}`);
      });
    }
    
    // In production, fail fast on invalid environment
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Invalid environment configuration. Please check the logs.');
    }
  } else {
    logger.info('Environment validation successful');
    if (result.warnings && result.warnings.length > 0) {
      logger.warn('Environment warnings:');
      result.warnings.forEach(warning => {
        logger.warn(`  - ${warning}`);
      });
    }
  }
}