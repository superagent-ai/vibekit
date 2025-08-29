/**
 * Configuration Manager
 * 
 * Centralized configuration system with schema validation, hot reloading,
 * and categories for organized configuration management.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { SafeFileWriter } from './safe-file-writer';
import { createSafeVibeKitPath, ValidationError } from './security-utils';
import { createLogger } from './structured-logger';

// ============================================================================
// Type Definitions
// ============================================================================

export enum ConfigCategory {
  SYSTEM = 'system',
  SECURITY = 'security',
  LOGGING = 'logging',
  RESOURCES = 'resources',
  ERROR_HANDLING = 'error_handling',
  RECOVERY = 'recovery',
  API = 'api'
}

export interface ConfigSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  enum?: any[];
  pattern?: string;
  description?: string;
  sensitive?: boolean; // For values that should be encrypted/masked
}

export interface ConfigValue {
  value: any;
  lastModified: number;
  source: 'default' | 'file' | 'environment' | 'api';
  encrypted?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfigurationHealth {
  totalConfigs: number;
  validationErrors: string[];
  schemaViolations: number;
  watchers: number;
  lastReload: number;
  hotReloadEnabled: boolean;
}

// ============================================================================
// Configuration Schemas
// ============================================================================

const CONFIG_SCHEMAS: Record<ConfigCategory, Record<string, ConfigSchema>> = {
  [ConfigCategory.SYSTEM]: {
    port: {
      type: 'number',
      min: 1024,
      max: 65535,
      default: 3000,
      description: 'Server port number'
    },
    environment: {
      type: 'string',
      enum: ['development', 'production', 'test'],
      default: 'development',
      description: 'Application environment'
    },
    debug: {
      type: 'boolean',
      default: false,
      description: 'Enable debug mode'
    }
  },
  [ConfigCategory.SECURITY]: {
    file_permissions: {
      type: 'string',
      pattern: '^[0-7]{3}$',
      default: '644',
      description: 'Default file permissions (octal)'
    },
    max_path_depth: {
      type: 'number',
      min: 1,
      max: 50,
      default: 10,
      description: 'Maximum allowed path traversal depth'
    },
    enable_path_validation: {
      type: 'boolean',
      default: true,
      description: 'Enable path validation checks'
    }
  },
  [ConfigCategory.LOGGING]: {
    level: {
      type: 'string',
      enum: ['debug', 'info', 'warn', 'error'],
      default: 'info',
      description: 'Log level threshold'
    },
    structured_format: {
      type: 'boolean',
      default: true,
      description: 'Use structured JSON logging'
    },
    max_log_size: {
      type: 'number',
      min: 1024,
      max: 100 * 1024 * 1024, // 100MB
      default: 10 * 1024 * 1024, // 10MB
      description: 'Maximum log file size in bytes'
    }
  },
  [ConfigCategory.RESOURCES]: {
    max_concurrent_executions: {
      type: 'number',
      min: 1,
      max: 20,
      default: 5,
      description: 'Maximum concurrent agent executions'
    },
    max_memory_mb: {
      type: 'number',
      min: 256,
      max: 8192,
      default: 2048,
      description: 'Maximum memory usage in MB'
    },
    connection_timeout_ms: {
      type: 'number',
      min: 1000,
      max: 300000,
      default: 30000,
      description: 'Connection timeout in milliseconds'
    }
  },
  [ConfigCategory.ERROR_HANDLING]: {
    max_retry_attempts: {
      type: 'number',
      min: 0,
      max: 10,
      default: 3,
      description: 'Maximum retry attempts for failed operations'
    },
    retry_delay_ms: {
      type: 'number',
      min: 100,
      max: 60000,
      default: 1000,
      description: 'Base delay between retries in milliseconds'
    },
    circuit_breaker_threshold: {
      type: 'number',
      min: 1,
      max: 100,
      default: 5,
      description: 'Failure threshold before circuit breaker opens'
    }
  },
  [ConfigCategory.RECOVERY]: {
    checkpoint_interval_ms: {
      type: 'number',
      min: 1000,
      max: 300000,
      default: 30000,
      description: 'Interval between recovery checkpoints'
    },
    health_check_interval_ms: {
      type: 'number',
      min: 1000,
      max: 60000,
      default: 10000,
      description: 'Health check interval in milliseconds'
    },
    enable_auto_recovery: {
      type: 'boolean',
      default: true,
      description: 'Enable automatic error recovery'
    }
  },
  [ConfigCategory.API]: {
    request_timeout_ms: {
      type: 'number',
      min: 1000,
      max: 300000,
      default: 60000,
      description: 'API request timeout in milliseconds'
    },
    rate_limit_requests: {
      type: 'number',
      min: 10,
      max: 10000,
      default: 1000,
      description: 'Rate limit requests per minute'
    },
    enable_cors: {
      type: 'boolean',
      default: false,
      description: 'Enable CORS for API endpoints'
    }
  }
};

// ============================================================================
// Configuration Manager Class
// ============================================================================

export class ConfigurationManager {
  private static instance: ConfigurationManager;
  private readonly logger = createLogger('ConfigurationManager');
  private readonly configRoot: string;
  private readonly configFile: string;
  private configs: Map<string, ConfigValue> = new Map();
  private watchers: Set<(category: ConfigCategory, key: string, value: any) => void> = new Set();
  private lastReload = 0;
  private hotReloadEnabled = true;

  private constructor() {
    this.configRoot = createSafeVibeKitPath('config');
    this.configFile = path.join(this.configRoot, 'vibekit-config.json');
  }

  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Initialize the configuration system
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(this.configRoot, { recursive: true });
      
      // Load existing configuration
      await this.loadConfiguration();
      
      // Set defaults for missing values
      await this.setDefaults();
      
      this.lastReload = Date.now();
      
      this.logger.info('Configuration manager initialized', {
        configRoot: this.configRoot,
        totalConfigs: this.configs.size,
        hotReloadEnabled: this.hotReloadEnabled
      });
    } catch (error) {
      this.logger.error('Failed to initialize configuration manager', error);
      throw new ValidationError('Failed to initialize configuration manager');
    }
  }

  /**
   * Get configuration value
   */
  async get<T = any>(category: ConfigCategory, key: string, defaultValue?: T): Promise<T> {
    const configKey = `${category}.${key}`;
    const config = this.configs.get(configKey);
    
    if (config) {
      return config.value as T;
    }
    
    // Return schema default if available
    const schema = CONFIG_SCHEMAS[category]?.[key];
    if (schema && schema.default !== undefined) {
      return schema.default as T;
    }
    
    // Return provided default
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    
    throw new ValidationError(`Configuration key ${configKey} not found and no default provided`);
  }

  /**
   * Set configuration value with validation
   */
  async set(category: ConfigCategory, key: string, value: any, persist = true): Promise<void> {
    const configKey = `${category}.${key}`;
    const schema = CONFIG_SCHEMAS[category]?.[key];
    
    if (!schema) {
      throw new ValidationError(`Unknown configuration key: ${configKey}`);
    }
    
    // Validate value
    const validation = this.validateValue(value, schema);
    if (!validation.valid) {
      throw new ValidationError(`Invalid configuration value: ${validation.errors.join(', ')}`);
    }
    
    // Store configuration
    const configValue: ConfigValue = {
      value,
      lastModified: Date.now(),
      source: 'api',
      encrypted: schema.sensitive || false
    };
    
    this.configs.set(configKey, configValue);
    
    // Persist to file if requested
    if (persist) {
      await this.saveConfiguration();
    }
    
    // Notify watchers
    this.notifyWatchers(category, key, value);
    
    this.logger.info('Configuration updated', {
      category,
      key,
      value: schema.sensitive ? '[REDACTED]' : value,
      source: 'api'
    });
  }

  /**
   * Validate configuration value against schema
   */
  validateValue(value: any, schema: ConfigSchema): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: []
    };

    // Type validation
    if (schema.type === 'number' && typeof value !== 'number') {
      result.valid = false;
      result.errors.push(`Expected number, got ${typeof value}`);
      return result;
    }
    
    if (schema.type === 'string' && typeof value !== 'string') {
      result.valid = false;
      result.errors.push(`Expected string, got ${typeof value}`);
      return result;
    }
    
    if (schema.type === 'boolean' && typeof value !== 'boolean') {
      result.valid = false;
      result.errors.push(`Expected boolean, got ${typeof value}`);
      return result;
    }

    // Range validation for numbers
    if (schema.type === 'number' && typeof value === 'number') {
      if (schema.min !== undefined && value < schema.min) {
        result.valid = false;
        result.errors.push(`Value must be at least ${schema.min}`);
      }
      
      if (schema.max !== undefined && value > schema.max) {
        result.valid = false;
        result.errors.push(`Value must be at most ${schema.max}`);
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      result.valid = false;
      result.errors.push(`Value must be one of: ${schema.enum.join(', ')}`);
    }

    // Pattern validation for strings
    if (schema.type === 'string' && schema.pattern && typeof value === 'string') {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        result.valid = false;
        result.errors.push(`Value does not match required pattern: ${schema.pattern}`);
      }
    }

    return result;
  }

  /**
   * Get all configurations for a category
   */
  async getCategory(category: ConfigCategory, includeSchema = false): Promise<{
    category: ConfigCategory;
    configs: Record<string, any>;
    schemas?: Record<string, ConfigSchema>;
  }> {
    const configs: Record<string, any> = {};
    const prefix = `${category}.`;
    
    for (const [key, config] of this.configs.entries()) {
      if (key.startsWith(prefix)) {
        const configKey = key.substring(prefix.length);
        configs[configKey] = config.value;
      }
    }
    
    // Add missing defaults
    const schemaKeys = Object.keys(CONFIG_SCHEMAS[category] || {});
    for (const key of schemaKeys) {
      if (!(key in configs)) {
        const schema = CONFIG_SCHEMAS[category][key];
        if (schema.default !== undefined) {
          configs[key] = schema.default;
        }
      }
    }
    
    const result: any = { category, configs };
    
    if (includeSchema) {
      result.schemas = CONFIG_SCHEMAS[category] || {};
    }
    
    return result;
  }

  /**
   * Watch for configuration changes
   */
  watch(callback: (category: ConfigCategory, key: string, value: any) => void): () => void {
    this.watchers.add(callback);
    
    // Return unwatch function
    return () => {
      this.watchers.delete(callback);
    };
  }

  /**
   * Get configuration health status
   */
  getHealth(): ConfigurationHealth {
    const health: ConfigurationHealth = {
      totalConfigs: this.configs.size,
      validationErrors: [],
      schemaViolations: 0,
      watchers: this.watchers.size,
      lastReload: this.lastReload,
      hotReloadEnabled: this.hotReloadEnabled
    };

    // Validate all current configurations
    for (const [key, config] of this.configs.entries()) {
      const [category, configKey] = key.split('.', 2);
      const schema = CONFIG_SCHEMAS[category as ConfigCategory]?.[configKey];
      
      if (schema) {
        const validation = this.validateValue(config.value, schema);
        if (!validation.valid) {
          health.validationErrors.push(...validation.errors.map(error => `${key}: ${error}`));
          health.schemaViolations++;
        }
      }
    }

    return health;
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async loadConfiguration(): Promise<void> {
    try {
      const content = await fs.readFile(this.configFile, 'utf8');
      const data = JSON.parse(content);
      
      this.configs.clear();
      
      if (data.configs) {
        for (const [key, value] of Object.entries(data.configs)) {
          this.configs.set(key, value as ConfigValue);
        }
      }
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // File doesn't exist, start with empty configuration
        this.configs.clear();
      } else {
        this.logger.warn('Failed to load configuration file', error);
      }
    }
  }

  private async saveConfiguration(): Promise<void> {
    const data = {
      version: '1.0',
      lastModified: Date.now(),
      configs: Object.fromEntries(this.configs.entries())
    };

    await SafeFileWriter.writeFile(this.configFile, JSON.stringify(data, null, 2));
  }

  private async setDefaults(): Promise<void> {
    let hasChanges = false;
    
    for (const [category, schemas] of Object.entries(CONFIG_SCHEMAS)) {
      for (const [key, schema] of Object.entries(schemas)) {
        const configKey = `${category}.${key}`;
        
        if (!this.configs.has(configKey) && schema.default !== undefined) {
          const configValue: ConfigValue = {
            value: schema.default,
            lastModified: Date.now(),
            source: 'default'
          };
          
          this.configs.set(configKey, configValue);
          hasChanges = true;
        }
      }
    }
    
    if (hasChanges) {
      await this.saveConfiguration();
    }
  }

  private notifyWatchers(category: ConfigCategory, key: string, value: any): void {
    for (const callback of this.watchers) {
      try {
        callback(category, key, value);
      } catch (error) {
        this.logger.warn('Configuration watcher callback failed', error, { category, key });
      }
    }
  }
}

// Export singleton instance
export const configurationManager = ConfigurationManager.getInstance();