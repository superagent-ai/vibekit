/**
 * Production Configuration Module
 * 
 * Centralized configuration for all production settings and thresholds.
 * This module provides environment-specific configurations and validation.
 */

import { z } from 'zod';

// Note: dotenv loading happens in server.js for Node.js runtime
// This module is also used in Edge Runtime (middleware) where Node.js APIs aren't available

/**
 * Environment types
 */
export enum Environment {
  LOCAL = 'local',
  DEVELOPMENT = 'development',
  STAGING = 'staging',
  PRODUCTION = 'production'
}

/**
 * Production configuration schema
 */
const ProductionConfigSchema = z.object({
  // Environment
  environment: z.nativeEnum(Environment),
  isProduction: z.boolean(),
  debug: z.boolean(),
  
  // Server Configuration
  server: z.object({
    port: z.number().min(1).max(65535),
    host: z.string(),
    autoOpen: z.boolean(),
    trustProxy: z.boolean(),
    gracefulShutdownTimeout: z.number(), // ms
    keepAliveTimeout: z.number(), // ms
  }),
  
  // Memory Management
  memory: z.object({
    enabled: z.boolean(),
    checkInterval: z.number(), // ms
    thresholds: z.object({
      warning: z.number().min(0).max(100), // percentage
      critical: z.number().min(0).max(100),
      emergency: z.number().min(0).max(100),
    }),
    maxHeapSize: z.number().optional(), // MB
    gcInterval: z.number(), // ms
  }),
  
  // Disk Management
  disk: z.object({
    enabled: z.boolean(),
    checkInterval: z.number(), // ms
    thresholds: z.object({
      warning: z.number().min(0).max(100), // percentage
      critical: z.number().min(0).max(100),
      emergency: z.number().min(0).max(100),
    }),
    cleanupPolicies: z.object({
      maxSessionAge: z.number(), // days
      maxExecutionAge: z.number(), // days
      maxLogAge: z.number(), // days
      maxCacheAge: z.number(), // days
    }),
  }),
  
  // Request Limits
  requests: z.object({
    maxSize: z.number(), // bytes
    maxUrlLength: z.number(),
    maxHeaderSize: z.number(), // bytes
    timeout: z.number(), // ms
    maxConcurrent: z.number(),
  }),
  
  // Rate Limiting
  rateLimit: z.object({
    enabled: z.boolean(),
    windowMs: z.number(),
    maxRequests: z.number(),
    skipHealthEndpoints: z.boolean(),
    trustProxy: z.boolean(),
  }),
  
  // Session Management
  sessions: z.object({
    maxActive: z.number(),
    timeout: z.number(), // ms
    heartbeatInterval: z.number(), // ms
    cleanupInterval: z.number(), // ms
    persistToDisk: z.boolean(),
  }),
  
  // Logging
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug', 'trace']),
    format: z.enum(['json', 'pretty']),
    includeTimestamp: z.boolean(),
    includeStackTrace: z.boolean(),
    maxFileSize: z.number(), // bytes
    maxFiles: z.number(),
    logToFile: z.boolean(),
  }),
  
  // Security
  security: z.object({
    csrfEnabled: z.boolean(),
    corsEnabled: z.boolean(),
    helmetEnabled: z.boolean(),
    allowedOrigins: z.array(z.string()),
    sessionSecret: z.string().optional(),
    encryptSensitiveData: z.boolean(),
  }),
  
  // Monitoring
  monitoring: z.object({
    healthCheckInterval: z.number(), // ms
    metricsEnabled: z.boolean(),
    tracingEnabled: z.boolean(),
    errorReporting: z.boolean(),
    performanceTracking: z.boolean(),
  }),
  
  // Features
  features: z.object({
    sandbox: z.boolean(),
    proxy: z.boolean(),
    analytics: z.boolean(),
    mcp: z.boolean(),
    projects: z.boolean(),
    chat: z.boolean(),
  }),
});

export type ProductionConfig = z.infer<typeof ProductionConfigSchema>;

/**
 * Get current environment
 */
function getCurrentEnvironment(): Environment {
  const env = process.env.NODE_ENV?.toLowerCase();
  
  switch (env) {
    case 'production':
      return Environment.PRODUCTION;
    case 'staging':
      return Environment.STAGING;
    case 'development':
      return Environment.DEVELOPMENT;
    default:
      // Default to LOCAL for VibeKit (runs on developer machines)
      return Environment.LOCAL;
  }
}

/**
 * Default configurations per environment
 */
const ENVIRONMENT_DEFAULTS: Record<Environment, ProductionConfig> = {
  // Local mode - Optimized for running on developer's machine
  [Environment.LOCAL]: {
    environment: Environment.LOCAL,
    isProduction: false,
    debug: false, // Keep false to reduce console noise
    
    server: {
      port: parseInt(process.env.PORT || '3001', 10),
      host: '127.0.0.1', // Localhost only
      autoOpen: false, // Don't auto-open browser
      trustProxy: false,
      gracefulShutdownTimeout: 5000, // Quick shutdown for local
      keepAliveTimeout: 120000,
    },
    
    memory: {
      enabled: true, // Keep enabled to prevent memory issues
      checkInterval: 120000, // Check every 2 minutes
      thresholds: {
        warning: 75,
        critical: 85,
        emergency: 95,
      },
      maxHeapSize: undefined, // Let Node.js manage
      gcInterval: 600000, // GC every 10 minutes
    },
    
    disk: {
      enabled: true, // Keep enabled to prevent disk full
      checkInterval: 600000, // Check every 10 minutes
      thresholds: {
        warning: 85,
        critical: 92,
        emergency: 97,
      },
      cleanupPolicies: {
        maxSessionAge: 3, // Keep sessions for 3 days
        maxExecutionAge: 7, // Keep executions for a week
        maxLogAge: 3,
        maxCacheAge: 1,
      },
    },
    
    requests: {
      maxSize: 50 * 1024 * 1024, // 50MB - larger for local development
      maxUrlLength: 8192, // Longer URLs for development
      maxHeaderSize: 32768, // Larger headers for development
      timeout: 60000, // Longer timeout for debugging
      maxConcurrent: 1000, // No real limit locally
    },
    
    rateLimit: {
      enabled: false, // Not needed for local use
      windowMs: 60000,
      maxRequests: 10000, // Effectively unlimited
      skipHealthEndpoints: true,
      trustProxy: false,
    },
    
    sessions: {
      maxActive: 1000, // Plenty for local use
      timeout: 86400000, // 24 hours - long for development
      heartbeatInterval: 60000, // Less frequent checks
      cleanupInterval: 300000, // Every 5 minutes
      persistToDisk: true,
    },
    
    logging: {
      level: 'info', // Balanced - not too noisy
      format: 'pretty', // Human-readable
      includeTimestamp: true,
      includeStackTrace: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 3, // Keep a few for debugging
      logToFile: false, // Console only for local
    },
    
    security: {
      csrfEnabled: false, // Not needed for localhost
      corsEnabled: false, // Not needed for localhost
      helmetEnabled: false, // Overkill for local
      allowedOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
      sessionSecret: undefined,
      encryptSensitiveData: false, // Not needed locally
    },
    
    monitoring: {
      healthCheckInterval: 300000, // Every 5 minutes
      metricsEnabled: false, // Don't need detailed metrics
      tracingEnabled: false, // No tracing needed
      errorReporting: true, // But only to console
      performanceTracking: false, // Not needed locally
    },
    
    features: {
      sandbox: true,
      proxy: true,
      analytics: true,
      mcp: true,
      projects: true,
      chat: true,
    },
  },
  
  [Environment.DEVELOPMENT]: {
    environment: Environment.DEVELOPMENT,
    isProduction: false,
    debug: true,
    
    server: {
      port: parseInt(process.env.PORT || '3001', 10),
      host: '127.0.0.1',
      autoOpen: true,
      trustProxy: false,
      gracefulShutdownTimeout: 10000,
      keepAliveTimeout: 120000,
    },
    
    memory: {
      enabled: false,
      checkInterval: 60000,
      thresholds: {
        warning: 70,
        critical: 85,
        emergency: 95,
      },
      maxHeapSize: undefined,
      gcInterval: 300000,
    },
    
    disk: {
      enabled: false,
      checkInterval: 300000,
      thresholds: {
        warning: 80,
        critical: 90,
        emergency: 95,
      },
      cleanupPolicies: {
        maxSessionAge: 7,
        maxExecutionAge: 30,
        maxLogAge: 7,
        maxCacheAge: 1,
      },
    },
    
    requests: {
      maxSize: 10 * 1024 * 1024, // 10MB
      maxUrlLength: 2048,
      maxHeaderSize: 16384,
      timeout: 30000,
      maxConcurrent: 100,
    },
    
    rateLimit: {
      enabled: false,
      windowMs: 60000,
      maxRequests: 100,
      skipHealthEndpoints: true,
      trustProxy: false,
    },
    
    sessions: {
      maxActive: 100,
      timeout: 3600000, // 1 hour
      heartbeatInterval: 30000,
      cleanupInterval: 60000,
      persistToDisk: true,
    },
    
    logging: {
      level: 'debug',
      format: 'pretty',
      includeTimestamp: true,
      includeStackTrace: true,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      logToFile: false,
    },
    
    security: {
      csrfEnabled: false,
      corsEnabled: true,
      helmetEnabled: false,
      allowedOrigins: ['http://localhost:*', 'http://127.0.0.1:*'],
      sessionSecret: undefined,
      encryptSensitiveData: false,
    },
    
    monitoring: {
      healthCheckInterval: 120000,
      metricsEnabled: false,
      tracingEnabled: false,
      errorReporting: false,
      performanceTracking: false,
    },
    
    features: {
      sandbox: true,
      proxy: true,
      analytics: true,
      mcp: true,
      projects: true,
      chat: true,
    },
  },
  
  [Environment.STAGING]: {
    environment: Environment.STAGING,
    isProduction: false,
    debug: true,
    
    server: {
      port: parseInt(process.env.PORT || '3001', 10),
      host: '0.0.0.0',
      autoOpen: false,
      trustProxy: true,
      gracefulShutdownTimeout: 30000,
      keepAliveTimeout: 120000,
    },
    
    memory: {
      enabled: true,
      checkInterval: 30000,
      thresholds: {
        warning: 75,
        critical: 85,
        emergency: 95,
      },
      maxHeapSize: 2048,
      gcInterval: 180000,
    },
    
    disk: {
      enabled: true,
      checkInterval: 120000,
      thresholds: {
        warning: 75,
        critical: 85,
        emergency: 95,
      },
      cleanupPolicies: {
        maxSessionAge: 3,
        maxExecutionAge: 14,
        maxLogAge: 3,
        maxCacheAge: 1,
      },
    },
    
    requests: {
      maxSize: 5 * 1024 * 1024, // 5MB
      maxUrlLength: 2048,
      maxHeaderSize: 8192,
      timeout: 20000,
      maxConcurrent: 50,
    },
    
    rateLimit: {
      enabled: true,
      windowMs: 60000,
      maxRequests: 60,
      skipHealthEndpoints: true,
      trustProxy: true,
    },
    
    sessions: {
      maxActive: 50,
      timeout: 1800000, // 30 minutes
      heartbeatInterval: 30000,
      cleanupInterval: 60000,
      persistToDisk: true,
    },
    
    logging: {
      level: 'info',
      format: 'json',
      includeTimestamp: true,
      includeStackTrace: true,
      maxFileSize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      logToFile: true,
    },
    
    security: {
      csrfEnabled: true,
      corsEnabled: true,
      helmetEnabled: true,
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
      sessionSecret: process.env.SESSION_SECRET,
      encryptSensitiveData: true,
    },
    
    monitoring: {
      healthCheckInterval: 60000,
      metricsEnabled: true,
      tracingEnabled: true,
      errorReporting: true,
      performanceTracking: true,
    },
    
    features: {
      sandbox: true,
      proxy: true,
      analytics: true,
      mcp: true,
      projects: true,
      chat: true,
    },
  },
  
  [Environment.PRODUCTION]: {
    environment: Environment.PRODUCTION,
    isProduction: true,
    debug: false,
    
    server: {
      port: parseInt(process.env.PORT || '3001', 10),
      host: '0.0.0.0',
      autoOpen: false,
      trustProxy: true,
      gracefulShutdownTimeout: 30000,
      keepAliveTimeout: 120000,
    },
    
    memory: {
      enabled: true,
      checkInterval: 30000,
      thresholds: {
        warning: 70,
        critical: 80,
        emergency: 90,
      },
      maxHeapSize: parseInt(process.env.MAX_HEAP_SIZE || '4096', 10),
      gcInterval: 120000,
    },
    
    disk: {
      enabled: true,
      checkInterval: 60000,
      thresholds: {
        warning: 70,
        critical: 80,
        emergency: 90,
      },
      cleanupPolicies: {
        maxSessionAge: 1,
        maxExecutionAge: 7,
        maxLogAge: 1,
        maxCacheAge: 1,
      },
    },
    
    requests: {
      maxSize: 2 * 1024 * 1024, // 2MB
      maxUrlLength: 2048,
      maxHeaderSize: 8192,
      timeout: 15000,
      maxConcurrent: 100,
    },
    
    rateLimit: {
      enabled: true,
      windowMs: 60000,
      maxRequests: 30,
      skipHealthEndpoints: true,
      trustProxy: true,
    },
    
    sessions: {
      maxActive: 100,
      timeout: 900000, // 15 minutes
      heartbeatInterval: 30000,
      cleanupInterval: 30000,
      persistToDisk: true,
    },
    
    logging: {
      level: 'warn',
      format: 'json',
      includeTimestamp: true,
      includeStackTrace: false,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      maxFiles: 20,
      logToFile: true,
    },
    
    security: {
      csrfEnabled: true,
      corsEnabled: true,
      helmetEnabled: true,
      allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || [],
      sessionSecret: process.env.SESSION_SECRET,
      encryptSensitiveData: true,
    },
    
    monitoring: {
      healthCheckInterval: 30000,
      metricsEnabled: true,
      tracingEnabled: true,
      errorReporting: true,
      performanceTracking: true,
    },
    
    features: {
      sandbox: process.env.ENABLE_SANDBOX !== 'false',
      proxy: process.env.ENABLE_PROXY !== 'false',
      analytics: process.env.ENABLE_ANALYTICS !== 'false',
      mcp: process.env.ENABLE_MCP !== 'false',
      projects: process.env.ENABLE_PROJECTS !== 'false',
      chat: process.env.ENABLE_CHAT !== 'false',
    },
  },
};

/**
 * Production configuration singleton
 */
class ProductionConfigManager {
  private static instance: ProductionConfigManager;
  private config: ProductionConfig;
  private overrides: Partial<ProductionConfig> = {};
  
  private constructor() {
    const environment = getCurrentEnvironment();
    this.config = ENVIRONMENT_DEFAULTS[environment];
    this.applyEnvironmentOverrides();
  }
  
  static getInstance(): ProductionConfigManager {
    if (!ProductionConfigManager.instance) {
      ProductionConfigManager.instance = new ProductionConfigManager();
    }
    return ProductionConfigManager.instance;
  }
  
  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(): void {
    // Server overrides
    if (process.env.PORT) {
      this.config.server.port = parseInt(process.env.PORT, 10);
    }
    if (process.env.HOST) {
      this.config.server.host = process.env.HOST;
    }
    
    // Memory overrides
    if (process.env.ENABLE_MEMORY_MONITOR) {
      this.config.memory.enabled = process.env.ENABLE_MEMORY_MONITOR === 'true';
    }
    if (process.env.MEMORY_CHECK_INTERVAL) {
      this.config.memory.checkInterval = parseInt(process.env.MEMORY_CHECK_INTERVAL, 10);
    }
    
    // Disk overrides
    if (process.env.ENABLE_DISK_MONITOR) {
      this.config.disk.enabled = process.env.ENABLE_DISK_MONITOR === 'true';
    }
    if (process.env.DISK_CHECK_INTERVAL) {
      this.config.disk.checkInterval = parseInt(process.env.DISK_CHECK_INTERVAL, 10);
    }
    
    // Rate limit overrides
    if (process.env.ENABLE_RATE_LIMIT) {
      this.config.rateLimit.enabled = process.env.ENABLE_RATE_LIMIT === 'true';
    }
    if (process.env.RATE_LIMIT_MAX) {
      this.config.rateLimit.maxRequests = parseInt(process.env.RATE_LIMIT_MAX, 10);
    }
    
    // Logging overrides
    if (process.env.LOG_LEVEL) {
      this.config.logging.level = process.env.LOG_LEVEL as any;
    }
    if (process.env.LOG_FORMAT) {
      this.config.logging.format = process.env.LOG_FORMAT as any;
    }
    
    // Apply manual overrides
    this.config = { ...this.config, ...this.overrides };
  }
  
  /**
   * Get the current configuration
   */
  getConfig(): ProductionConfig {
    return { ...this.config };
  }
  
  /**
   * Get a specific configuration section
   */
  get<K extends keyof ProductionConfig>(key: K): ProductionConfig[K] {
    return this.config[key];
  }
  
  /**
   * Update configuration (runtime overrides)
   */
  update(overrides: Partial<ProductionConfig>): void {
    this.overrides = { ...this.overrides, ...overrides };
    this.applyEnvironmentOverrides();
  }
  
  /**
   * Reset to defaults
   */
  reset(): void {
    this.overrides = {};
    const environment = getCurrentEnvironment();
    this.config = ENVIRONMENT_DEFAULTS[environment];
    this.applyEnvironmentOverrides();
  }
  
  /**
   * Validate configuration
   */
  validate(): { valid: boolean; errors?: string[] } {
    try {
      ProductionConfigSchema.parse(this.config);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        };
      }
      return {
        valid: false,
        errors: ['Unknown validation error'],
      };
    }
  }
  
  /**
   * Export configuration as JSON
   */
  toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }
  
  /**
   * Get environment-specific recommendations
   */
  getRecommendations(): string[] {
    const recommendations: string[] = [];
    const env = this.config.environment;
    
    if (env === Environment.PRODUCTION) {
      if (!this.config.security.sessionSecret) {
        recommendations.push('Set SESSION_SECRET environment variable for secure sessions');
      }
      if (!this.config.security.csrfEnabled) {
        recommendations.push('Enable CSRF protection for production');
      }
      if (this.config.debug) {
        recommendations.push('Disable debug mode in production');
      }
      if (this.config.logging.level === 'debug' || this.config.logging.level === 'trace') {
        recommendations.push('Use "warn" or "error" log level in production');
      }
      if (!this.config.monitoring.errorReporting) {
        recommendations.push('Enable error reporting for production monitoring');
      }
      if (this.config.memory.thresholds.emergency < 90) {
        recommendations.push('Set memory emergency threshold to at least 90%');
      }
    }
    
    if (env === Environment.STAGING) {
      if (!this.config.monitoring.metricsEnabled) {
        recommendations.push('Enable metrics collection in staging for performance testing');
      }
      if (!this.config.monitoring.tracingEnabled) {
        recommendations.push('Enable tracing in staging for debugging');
      }
    }
    
    // General recommendations
    if (this.config.requests.maxSize > 10 * 1024 * 1024) {
      recommendations.push('Consider reducing max request size to prevent abuse');
    }
    if (this.config.sessions.maxActive > 1000) {
      recommendations.push('High max active sessions may impact performance');
    }
    if (!this.config.disk.enabled && env !== Environment.DEVELOPMENT) {
      recommendations.push('Enable disk monitoring for non-development environments');
    }
    
    return recommendations;
  }
}

// Export singleton instance
export const productionConfig = ProductionConfigManager.getInstance();

// Export helper functions
export function getConfig(): ProductionConfig {
  return productionConfig.getConfig();
}

export function getConfigSection<K extends keyof ProductionConfig>(key: K): ProductionConfig[K] {
  return productionConfig.get(key);
}

export function isProduction(): boolean {
  return productionConfig.get('isProduction');
}

export function getEnvironment(): Environment {
  return productionConfig.get('environment');
}

export function validateConfig(): { valid: boolean; errors?: string[] } {
  return productionConfig.validate();
}

export function getConfigRecommendations(): string[] {
  return productionConfig.getRecommendations();
}

// Export configuration for specific components
export function getMemoryConfig() {
  return productionConfig.get('memory');
}

export function getDiskConfig() {
  return productionConfig.get('disk');
}

export function getSecurityConfig() {
  return productionConfig.get('security');
}

export function getLoggingConfig() {
  return productionConfig.get('logging');
}

export function getMonitoringConfig() {
  return productionConfig.get('monitoring');
}

export function getServerConfig() {
  return productionConfig.get('server');
}

export function getRateLimitConfig() {
  return productionConfig.get('rateLimit');
}