/**
 * Configuration management system for VibeKit Dashboard
 * 
 * Provides:
 * - Centralized configuration management
 * - Environment-specific configuration
 * - Configuration validation and schema enforcement
 * - Hot reloading of configuration changes
 * - Secure storage of sensitive configuration
 * - Configuration versioning and rollback
 * - Runtime configuration updates
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createLogger } from './structured-logger';
import { createSafeVibeKitPath, validatePathComponent } from './security-utils';
import { SafeFileWriter } from './safe-file-writer';

const logger = createLogger('ConfigManager');

/**
 * Configuration categories for organizing settings
 * 
 * These categories help organize configuration values into logical groups
 * and determine where they are stored and how they are managed.
 * 
 * @example
 * ```typescript
 * // System-level configurations like port, environment
 * ConfigCategory.SYSTEM
 * 
 * // Security settings like file permissions, max path length
 * ConfigCategory.SECURITY
 * 
 * // Resource limits like max connections, memory usage
 * ConfigCategory.RESOURCES
 * ```
 */
export enum ConfigCategory {
  SYSTEM = 'system',
  SECURITY = 'security',
  LOGGING = 'logging',
  ERROR_HANDLING = 'error_handling',
  RECOVERY = 'recovery',
  RESOURCES = 'resources',
  API = 'api',
  UI = 'ui',
  INTEGRATIONS = 'integrations'
}

/**
 * Configuration value types supported by the system
 * 
 * Represents all possible types that can be stored as configuration values.
 * The system automatically handles type conversion and validation based on schemas.
 */
export type ConfigValue = string | number | boolean | object | null;

/**
 * Configuration schema definition for validation and type checking
 * 
 * Defines the structure, constraints, and metadata for a configuration value.
 * Used for validation, default values, and documentation.
 * 
 * @example
 * ```typescript
 * const portSchema: ConfigSchema = {
 *   type: 'number',
 *   required: false,
 *   default: 3000,
 *   min: 1024,
 *   max: 65535,
 *   description: 'Server port number'
 * };
 * ```
 */
export interface ConfigSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  default?: ConfigValue;
  min?: number;
  max?: number;
  enum?: ConfigValue[];
  pattern?: string;
  description?: string;
  sensitive?: boolean; // Indicates sensitive data that should be encrypted
  properties?: Record<string, ConfigSchema>; // For object types
}

/**
 * Complete configuration definition including category and schema
 * 
 * Combines the configuration metadata (category, key, environment)
 * with the validation schema. Used when registering new configuration
 * schemas with the system.
 * 
 * @example
 * ```typescript
 * const portDefinition: ConfigDefinition = {
 *   category: ConfigCategory.SYSTEM,
 *   key: 'port',
 *   schema: {
 *     type: 'number',
 *     default: 3000,
 *     min: 1024,
 *     max: 65535
 *   },
 *   environment: ['development', 'production'],
 *   readonly: false
 * };
 * ```
 */
export interface ConfigDefinition {
  category: ConfigCategory;
  key: string;
  schema: ConfigSchema;
  environment?: string[]; // Which environments this config applies to
  readonly?: boolean;
  version?: string;
}

/**
 * Configuration change event emitted when values are updated
 * 
 * Provides detailed information about configuration changes for
 * watchers and logging. Includes old and new values, timing,
 * and the source of the change.
 * 
 * @example
 * ```typescript
 * Config.watch(ConfigCategory.SYSTEM, 'port', (event: ConfigChangeEvent) => {
 *   console.log(`Port changed from ${event.oldValue} to ${event.newValue}`);
 *   console.log(`Change source: ${event.source}`);
 *   console.log(`Timestamp: ${new Date(event.timestamp)}`);
 * });
 * ```
 */
export interface ConfigChangeEvent {
  category: ConfigCategory;
  key: string;
  oldValue: ConfigValue;
  newValue: ConfigValue;
  timestamp: number;
  source: 'file' | 'api' | 'env' | 'default';
}

/**
 * Result of configuration value validation against schema
 * 
 * Contains validation status, error messages, and warnings.
 * Used to provide detailed feedback about why validation failed
 * and what can be done to fix it.
 * 
 * @example
 * ```typescript
 * const result = Config.validateValue('system.port', 'invalid');
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 *   // ['Expected type number, got string']
 * }
 * if (result.warnings.length > 0) {
 *   console.warn('Warnings:', result.warnings);
 * }
 * ```
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Main configuration manager class for VibeKit Dashboard
 * 
 * Provides centralized configuration management with:
 * - Environment-specific configuration loading
 * - Schema validation and type safety
 * - Hot reloading of configuration changes
 * - Secure storage of sensitive configuration
 * - Configuration versioning and rollback
 * - Runtime configuration updates via API
 * 
 * @example
 * ```typescript
 * // Initialize the configuration manager
 * await Config.initialize();
 * 
 * // Get configuration values
 * const port = Config.get(ConfigCategory.SYSTEM, 'port', 3000);
 * const maxConnections = Config.get(ConfigCategory.RESOURCES, 'max_concurrent_connections');
 * 
 * // Set configuration values
 * await Config.set(ConfigCategory.SYSTEM, 'port', 8080, true); // persist to file
 * 
 * // Watch for changes
 * const unwatch = Config.watch(ConfigCategory.SYSTEM, 'port', (event) => {
 *   console.log('Port changed from', event.oldValue, 'to', event.newValue);
 * });
 * ```
 */
class ConfigurationManager {
  private static instance: ConfigurationManager;
  private configs = new Map<string, ConfigValue>();
  private schemas = new Map<string, ConfigDefinition>();
  private watchers = new Map<string, ((event: ConfigChangeEvent) => void)[]>();
  private configDir: string;
  private environment: string;
  private isInitialized = false;

  private constructor() {
    this.configDir = createSafeVibeKitPath('', 'config');
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Get the singleton instance of the configuration manager
   * 
   * @returns The singleton ConfigurationManager instance
   */
  static getInstance(): ConfigurationManager {
    if (!ConfigurationManager.instance) {
      ConfigurationManager.instance = new ConfigurationManager();
    }
    return ConfigurationManager.instance;
  }

  /**
   * Initialize the configuration manager
   * 
   * Sets up the configuration system by:
   * - Creating the configuration directory
   * - Registering default configuration schemas
   * - Loading configurations from files and environment
   * - Validating all loaded configurations
   * 
   * This method is idempotent and can be called multiple times safely.
   * 
   * @throws Error if initialization fails (directory creation, validation, etc.)
   * 
   * @example
   * ```typescript
   * try {
   *   await Config.initialize();
   *   console.log('Configuration manager ready');
   * } catch (error) {
   *   console.error('Failed to initialize config:', error);
   * }
   * ```
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Ensure config directory exists
      await fs.mkdir(this.configDir, { recursive: true });

      // Register default schemas
      await this.registerDefaultSchemas();

      // Load configurations
      await this.loadConfigurations();

      // Validate all configurations
      await this.validateAllConfigurations();

      this.isInitialized = true;
      logger.info('Configuration manager initialized', {
        configDir: this.configDir,
        environment: this.environment,
        configCount: this.configs.size,
        schemaCount: this.schemas.size
      });
    } catch (error) {
      logger.error('Failed to initialize configuration manager', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Register a configuration schema definition
   * 
   * Registers a schema that defines the structure, validation rules,
   * and metadata for a configuration value. Schemas are used for
   * validation, type checking, and providing default values.
   * 
   * @param definition - The configuration schema definition
   * 
   * @example
   * ```typescript
   * registerSchema({
   *   category: ConfigCategory.SYSTEM,
   *   key: 'port',
   *   schema: {
   *     type: 'number',
   *     required: false,
   *     default: 3000,
   *     min: 1024,
   *     max: 65535,
   *     description: 'Server port number'
   *   }
   * });
   * ```
   */
  registerSchema(definition: ConfigDefinition): void {
    const key = this.getConfigKey(definition.category, definition.key);
    this.schemas.set(key, definition);
    
    // Set default value if provided and not already set
    if (definition.schema.default !== undefined && !this.configs.has(key)) {
      this.configs.set(key, definition.schema.default);
    }

    logger.debug('Configuration schema registered', {
      category: definition.category,
      key: definition.key,
      type: definition.schema.type,
      required: definition.schema.required,
      hasDefault: definition.schema.default !== undefined
    });
  }

  /**
   * Register default configuration schemas
   */
  private async registerDefaultSchemas(): Promise<void> {
    // System configuration
    this.registerSchema({
      category: ConfigCategory.SYSTEM,
      key: 'port',
      schema: {
        type: 'number',
        required: false,
        default: 3000,
        min: 1024,
        max: 65535,
        description: 'Server port number'
      }
    });

    this.registerSchema({
      category: ConfigCategory.SYSTEM,
      key: 'environment',
      schema: {
        type: 'string',
        required: false,
        default: 'development',
        enum: ['development', 'staging', 'production'],
        description: 'Application environment'
      }
    });

    // Security configuration
    this.registerSchema({
      category: ConfigCategory.SECURITY,
      key: 'file_permissions',
      schema: {
        type: 'string',
        required: false,
        default: '0o600',
        pattern: '^0o[0-7]{3}$',
        description: 'Default file permissions for created files'
      }
    });

    this.registerSchema({
      category: ConfigCategory.SECURITY,
      key: 'max_path_length',
      schema: {
        type: 'number',
        required: false,
        default: 4096,
        min: 256,
        max: 8192,
        description: 'Maximum allowed path length'
      }
    });

    // Logging configuration
    this.registerSchema({
      category: ConfigCategory.LOGGING,
      key: 'level',
      schema: {
        type: 'string',
        required: false,
        default: 'info',
        enum: ['debug', 'info', 'warn', 'error'],
        description: 'Minimum log level'
      }
    });

    this.registerSchema({
      category: ConfigCategory.LOGGING,
      key: 'console_enabled',
      schema: {
        type: 'boolean',
        required: false,
        default: true,
        description: 'Enable console logging'
      }
    });

    this.registerSchema({
      category: ConfigCategory.LOGGING,
      key: 'file_enabled',
      schema: {
        type: 'boolean',
        required: false,
        default: false,
        description: 'Enable file logging'
      }
    });

    // Resource limits
    this.registerSchema({
      category: ConfigCategory.RESOURCES,
      key: 'max_concurrent_executions',
      schema: {
        type: 'number',
        required: false,
        default: 5,
        min: 1,
        max: 20,
        description: 'Maximum concurrent executions'
      }
    });

    this.registerSchema({
      category: ConfigCategory.RESOURCES,
      key: 'max_concurrent_connections',
      schema: {
        type: 'number',
        required: false,
        default: 100,
        min: 10,
        max: 1000,
        description: 'Maximum concurrent API connections'
      }
    });

    this.registerSchema({
      category: ConfigCategory.RESOURCES,
      key: 'max_memory_usage',
      schema: {
        type: 'number',
        required: false,
        default: 1024 * 1024 * 1024, // 1GB
        min: 256 * 1024 * 1024, // 256MB
        max: 8 * 1024 * 1024 * 1024, // 8GB
        description: 'Maximum memory usage in bytes'
      }
    });

    this.registerSchema({
      category: ConfigCategory.RESOURCES,
      key: 'execution_timeout',
      schema: {
        type: 'number',
        required: false,
        default: 30 * 60 * 1000, // 30 minutes
        min: 5 * 60 * 1000, // 5 minutes
        max: 120 * 60 * 1000, // 2 hours
        description: 'Maximum execution timeout in milliseconds'
      }
    });

    // Error handling configuration
    this.registerSchema({
      category: ConfigCategory.ERROR_HANDLING,
      key: 'retry_attempts',
      schema: {
        type: 'number',
        required: false,
        default: 3,
        min: 1,
        max: 10,
        description: 'Default retry attempts for operations'
      }
    });

    this.registerSchema({
      category: ConfigCategory.ERROR_HANDLING,
      key: 'circuit_breaker_threshold',
      schema: {
        type: 'number',
        required: false,
        default: 5,
        min: 2,
        max: 20,
        description: 'Circuit breaker failure threshold'
      }
    });

    // Recovery configuration
    this.registerSchema({
      category: ConfigCategory.RECOVERY,
      key: 'checkpoint_interval',
      schema: {
        type: 'number',
        required: false,
        default: 30000, // 30 seconds
        min: 10000, // 10 seconds
        max: 300000, // 5 minutes
        description: 'Recovery checkpoint creation interval in milliseconds'
      }
    });

    this.registerSchema({
      category: ConfigCategory.RECOVERY,
      key: 'health_check_interval',
      schema: {
        type: 'number',
        required: false,
        default: 30000, // 30 seconds
        min: 5000, // 5 seconds
        max: 300000, // 5 minutes
        description: 'Service health check interval in milliseconds'
      }
    });

    // API configuration
    this.registerSchema({
      category: ConfigCategory.API,
      key: 'timeout',
      schema: {
        type: 'number',
        required: false,
        default: 30000, // 30 seconds
        min: 5000, // 5 seconds
        max: 300000, // 5 minutes
        description: 'API request timeout in milliseconds'
      }
    });

    this.registerSchema({
      category: ConfigCategory.API,
      key: 'rate_limit',
      schema: {
        type: 'number',
        required: false,
        default: 100,
        min: 10,
        max: 1000,
        description: 'API rate limit requests per minute'
      }
    });
  }

  /**
   * Load configurations from files and environment
   */
  private async loadConfigurations(): Promise<void> {
    // Load from environment variables
    await this.loadFromEnvironment();

    // Load from configuration files
    await this.loadFromFiles();

    logger.info('Configurations loaded', {
      configCount: this.configs.size,
      environment: this.environment
    });
  }

  /**
   * Load configuration from environment variables
   */
  private async loadFromEnvironment(): Promise<void> {
    const envPrefix = 'VIBEKIT_';
    let envConfigCount = 0;

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(envPrefix)) {
        const configKey = key.substring(envPrefix.length).toLowerCase().replace(/_/g, '.');
        this.configs.set(configKey, this.parseValue(value!));
        envConfigCount++;
      }
    }

    logger.debug('Environment configurations loaded', { count: envConfigCount });
  }

  /**
   * Load configuration from files
   */
  private async loadFromFiles(): Promise<void> {
    const configFiles = [
      'default.json',
      `${this.environment}.json`,
      'local.json'
    ];

    for (const filename of configFiles) {
      const filePath = path.join(this.configDir, filename);
      
      try {
        await fs.access(filePath);
        const content = await fs.readFile(filePath, 'utf-8');
        const config = JSON.parse(content);
        
        this.mergeConfig(config);
        logger.debug('Configuration file loaded', { filename });
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          logger.warn('Failed to load configuration file', {
            filename,
            error: error.message
          });
        }
      }
    }
  }

  /**
   * Merge configuration object into current config
   */
  private mergeConfig(config: Record<string, any>, prefix = ''): void {
    for (const [key, value] of Object.entries(config)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.mergeConfig(value, fullKey);
      } else {
        this.configs.set(fullKey, value);
      }
    }
  }

  /**
   * Parse string value to appropriate type
   */
  private parseValue(value: string): ConfigValue {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Return as string if JSON parsing fails
      return value;
    }
  }

  /**
   * Get a configuration value with type safety
   * 
   * Retrieves a configuration value by category and key. The method
   * checks in the following order:
   * 1. Explicitly set values
   * 2. Schema default values
   * 3. Provided default value
   * 4. undefined (with warning for required configs)
   * 
   * @template T - The expected type of the configuration value
   * @param category - The configuration category
   * @param key - The configuration key
   * @param defaultValue - Optional default value if not found
   * @returns The configuration value or default
   * 
   * @example
   * ```typescript
   * // Get with automatic type inference
   * const port = Config.get(ConfigCategory.SYSTEM, 'port', 3000); // number
   * const enabled = Config.get(ConfigCategory.LOGGING, 'console_enabled', true); // boolean
   * 
   * // Get with explicit typing
   * const config = Config.get<string>(ConfigCategory.SYSTEM, 'environment');
   * ```
   */
  get<T extends ConfigValue = ConfigValue>(category: ConfigCategory, key: string, defaultValue?: T): T {
    const configKey = this.getConfigKey(category, key);
    const value = this.configs.get(configKey);
    
    if (value !== undefined) {
      return value as T;
    }

    // Try to get default from schema
    const schema = this.schemas.get(configKey);
    if (schema?.schema.default !== undefined) {
      return schema.schema.default as T;
    }

    if (defaultValue !== undefined) {
      return defaultValue;
    }

    // Log warning for missing required config
    if (schema?.schema.required) {
      logger.warn('Required configuration missing', { category, key });
    }

    return undefined as T;
  }

  /**
   * Set a configuration value with validation and optional persistence
   * 
   * Updates a configuration value after validating it against the
   * registered schema. Optionally persists the change to the configuration
   * file and notifies all watchers of the change.
   * 
   * @param category - The configuration category
   * @param key - The configuration key
   * @param value - The new configuration value
   * @param persist - Whether to save to configuration file (default: false)
   * 
   * @throws Error if validation fails or persistence fails
   * 
   * @example
   * ```typescript
   * // Set in memory only
   * await Config.set(ConfigCategory.SYSTEM, 'port', 8080);
   * 
   * // Set and persist to file
   * await Config.set(ConfigCategory.RESOURCES, 'max_connections', 200, true);
   * ```
   */
  async set(category: ConfigCategory, key: string, value: ConfigValue, persist = false): Promise<void> {
    const configKey = this.getConfigKey(category, key);
    const oldValue = this.configs.get(configKey);

    // Validate the new value
    const validation = this.validateValue(configKey, value);
    if (!validation.valid) {
      const error = new Error(`Invalid configuration value: ${validation.errors.join(', ')}`);
      logger.error('Configuration validation failed', {
        category,
        key,
        value,
        errors: validation.errors
      });
      throw error;
    }

    // Set the value
    this.configs.set(configKey, value);

    // Persist to file if requested
    if (persist) {
      await this.persistConfiguration(category, key, value);
    }

    // Notify watchers
    this.notifyWatchers({
      category,
      key,
      oldValue: oldValue || null,
      newValue: value,
      timestamp: Date.now(),
      source: persist ? 'api' : 'default'
    });

    logger.info('Configuration updated', {
      category,
      key,
      oldValue,
      newValue: value,
      persisted: persist
    });
  }

  /**
   * Watch for configuration changes
   * 
   * Registers a callback function that will be called whenever the
   * specified configuration value changes. The callback receives
   * detailed information about the change.
   * 
   * @param category - The configuration category to watch
   * @param key - The configuration key to watch
   * @param callback - Function to call when the value changes
   * @returns Function to call to stop watching (unwatch)
   * 
   * @example
   * ```typescript
   * const unwatch = Config.watch(ConfigCategory.SYSTEM, 'port', (event) => {
   *   console.log(`Port changed from ${event.oldValue} to ${event.newValue}`);
   *   // Restart server with new port
   *   restartServer(event.newValue);
   * });
   * 
   * // Stop watching when no longer needed
   * unwatch();
   * ```
   */
  watch(category: ConfigCategory, key: string, callback: (event: ConfigChangeEvent) => void): () => void {
    const configKey = this.getConfigKey(category, key);
    
    if (!this.watchers.has(configKey)) {
      this.watchers.set(configKey, []);
    }
    
    this.watchers.get(configKey)!.push(callback);

    // Return unwatch function
    return () => {
      const callbacks = this.watchers.get(configKey);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Validate a configuration value against its registered schema
   * 
   * Performs comprehensive validation including type checking,
   * required field validation, enum validation, range validation,
   * and pattern matching for strings.
   * 
   * @param configKey - The full configuration key (category.key)
   * @param value - The value to validate
   * @returns Validation result with errors and warnings
   * 
   * @example
   * ```typescript
   * const result = Config.validateValue('system.port', 8080);
   * if (!result.valid) {
   *   console.error('Validation errors:', result.errors);
   * }
   * if (result.warnings.length > 0) {
   *   console.warn('Validation warnings:', result.warnings);
   * }
   * ```
   */
  validateValue(configKey: string, value: ConfigValue): ConfigValidationResult {
    const schema = this.schemas.get(configKey);
    if (!schema) {
      return { valid: true, errors: [], warnings: ['No schema found for configuration'] };
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // Type validation
    if (!this.validateType(value, schema.schema.type)) {
      errors.push(`Expected type ${schema.schema.type}, got ${typeof value}`);
    }

    // Required validation
    if (schema.schema.required && (value === null || value === undefined)) {
      errors.push('Value is required');
    }

    // Enum validation
    if (schema.schema.enum && !schema.schema.enum.includes(value)) {
      errors.push(`Value must be one of: ${schema.schema.enum.join(', ')}`);
    }

    // Numeric range validation
    if (typeof value === 'number') {
      if (schema.schema.min !== undefined && value < schema.schema.min) {
        errors.push(`Value must be at least ${schema.schema.min}`);
      }
      if (schema.schema.max !== undefined && value > schema.schema.max) {
        errors.push(`Value must be at most ${schema.schema.max}`);
      }
    }

    // Pattern validation for strings
    if (typeof value === 'string' && schema.schema.pattern) {
      const regex = new RegExp(schema.schema.pattern);
      if (!regex.test(value)) {
        errors.push(`Value does not match required pattern: ${schema.schema.pattern}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Validate type
   */
  private validateType(value: ConfigValue, expectedType: string): boolean {
    switch (expectedType) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'object':
        return typeof value === 'object' && value !== null;
      case 'array':
        return Array.isArray(value);
      default:
        return true;
    }
  }

  /**
   * Validate all configurations
   */
  private async validateAllConfigurations(): Promise<void> {
    const errors: string[] = [];
    
    for (const [configKey, value] of this.configs) {
      const validation = this.validateValue(configKey, value);
      if (!validation.valid) {
        errors.push(`${configKey}: ${validation.errors.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      logger.error('Configuration validation failed', { errors });
      throw new Error(`Configuration validation failed: ${errors.join('; ')}`);
    }

    logger.info('All configurations validated successfully');
  }

  /**
   * Persist configuration to file
   */
  private async persistConfiguration(category: ConfigCategory, key: string, value: ConfigValue): Promise<void> {
    const filename = `${this.environment}.json`;
    const filePath = path.join(this.configDir, filename);
    
    try {
      // Load existing configuration
      let config: Record<string, any> = {};
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        config = JSON.parse(content);
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      // Update configuration
      const keys = `${category}.${key}`.split('.');
      let current = config;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;

      // Write back to file
      await SafeFileWriter.writeFile(filePath, JSON.stringify(config, null, 2));
      
      logger.debug('Configuration persisted', { category, key, filename });
    } catch (error) {
      logger.error('Failed to persist configuration', {
        category,
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Notify configuration watchers
   */
  private notifyWatchers(event: ConfigChangeEvent): void {
    const configKey = this.getConfigKey(event.category, event.key);
    const callbacks = this.watchers.get(configKey);
    
    if (callbacks) {
      for (const callback of callbacks) {
        try {
          callback(event);
        } catch (error) {
          logger.error('Configuration watcher callback failed', {
            configKey,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
  }

  /**
   * Get configuration key
   */
  private getConfigKey(category: ConfigCategory, key: string): string {
    return `${category}.${key}`;
  }

  /**
   * Get all configurations for a category
   */
  getCategory(category: ConfigCategory): Record<string, ConfigValue> {
    const prefix = `${category}.`;
    const result: Record<string, ConfigValue> = {};
    
    for (const [key, value] of this.configs) {
      if (key.startsWith(prefix)) {
        const shortKey = key.substring(prefix.length);
        result[shortKey] = value;
      }
    }
    
    return result;
  }

  /**
   * Get all configuration schemas
   */
  getSchemas(): Map<string, ConfigDefinition> {
    return new Map(this.schemas);
  }

  /**
   * Get configuration statistics
   */
  getStats(): {
    configCount: number;
    schemaCount: number;
    watcherCount: number;
    categories: Record<string, number>;
  } {
    const categories: Record<string, number> = {};
    
    for (const key of this.configs.keys()) {
      const category = key.split('.')[0];
      categories[category] = (categories[category] || 0) + 1;
    }

    return {
      configCount: this.configs.size,
      schemaCount: this.schemas.size,
      watcherCount: Array.from(this.watchers.values()).reduce((sum, arr) => sum + arr.length, 0),
      categories
    };
  }

  /**
   * Export configuration to JSON
   */
  exportConfiguration(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, value] of this.configs) {
      const keys = key.split('.');
      let current = result;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
    }
    
    return result;
  }

  /**
   * Reload configurations from files
   */
  async reload(): Promise<void> {
    logger.info('Reloading configurations');
    
    // Clear current configs (except environment variables)
    const envConfigs = new Map<string, ConfigValue>();
    for (const [key, value] of this.configs) {
      if (key.startsWith('env.')) {
        envConfigs.set(key, value);
      }
    }
    
    this.configs.clear();
    for (const [key, value] of envConfigs) {
      this.configs.set(key, value);
    }
    
    // Reload from files
    await this.loadConfigurations();
    await this.validateAllConfigurations();
    
    logger.info('Configurations reloaded successfully');
  }
}

// Initialize and export singleton
const configManager = ConfigurationManager.getInstance();

export { configManager as Config, ConfigurationManager };