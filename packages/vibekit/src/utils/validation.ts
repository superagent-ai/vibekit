import { ValidationError } from '../errors/VibeKitError.js';

export interface ValidationRule {
  required?: boolean;
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  enum?: any[];
  custom?: (value: any) => boolean | string;
}

export interface ValidationSchema {
  [field: string]: ValidationRule;
}

/**
 * Validate input against a schema
 */
export function validate(data: any, schema: ValidationSchema): void {
  const errors: string[] = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = data[field];

    // Check required fields
    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    // Skip validation if field is not present and not required
    if (!rules.required && (value === undefined || value === null)) {
      continue;
    }

    // Type validation
    if (rules.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== rules.type) {
        errors.push(`${field} must be of type ${rules.type}, got ${actualType}`);
        continue;
      }
    }

    // String validations
    if (typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters long`);
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters long`);
      }
      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push(`${field} does not match the required pattern`);
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }
    }

    // Enum validation
    if (rules.enum && !rules.enum.includes(value)) {
      errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
    }

    // Custom validation
    if (rules.custom) {
      const result = rules.custom(value);
      if (result !== true) {
        errors.push(typeof result === 'string' ? result : `${field} failed custom validation`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(`Validation failed: ${errors.join(', ')}`);
  }
}

/**
 * Common validation rules
 */
export const CommonValidations = {
  email: {
    type: 'string' as const,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  },
  
  url: {
    type: 'string' as const,
    pattern: /^https?:\/\/.+/,
  },
  
  uuid: {
    type: 'string' as const,
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  },
  
  port: {
    type: 'number' as const,
    min: 1,
    max: 65535,
  },
  
  nonEmptyString: {
    type: 'string' as const,
    minLength: 1,
    custom: (value: string) => value.trim().length > 0 || 'Value cannot be empty or whitespace',
  },
  
  positiveNumber: {
    type: 'number' as const,
    min: 0,
  },
  
  filePath: {
    type: 'string' as const,
    pattern: /^[^<>:"|?*]+$/,
  },
};

/**
 * Validate agent configuration
 */
export function validateAgentConfig(config: any): void {
  const schema: ValidationSchema = {
    agentType: {
      required: true,
      type: 'string',
      enum: ['claude', 'gemini', 'codex', 'grok', 'opencode'],
    },
    mode: {
      required: true,
      type: 'string',
      enum: ['chat', 'code', 'analyze'],
    },
    prompt: {
      required: true,
      ...CommonValidations.nonEmptyString,
    },
    sandboxId: {
      ...CommonValidations.uuid,
    },
    repoUrl: {
      ...CommonValidations.url,
    },
  };

  validate(config, schema);
}

/**
 * Validate sandbox configuration
 */
export function validateSandboxConfig(config: any): void {
  const schema: ValidationSchema = {
    provider: {
      type: 'string',
      enum: ['mock', 'docker', 'e2b', 'dagger', 'northflank', 'daytona'],
    },
    memory: {
      type: 'number',
      min: 128,
      max: 32768,
    },
    cpu: {
      type: 'number',
      min: 0.1,
      max: 16,
    },
    timeout: {
      type: 'number',
      min: 1000,
      max: 3600000, // 1 hour max
    },
  };

  validate(config, schema);
}

/**
 * Validate telemetry configuration
 */
export function validateTelemetryConfig(config: any): void {
  const schema: ValidationSchema = {
    enabled: {
      type: 'boolean',
    },
    endpoint: {
      ...CommonValidations.url,
    },
    apiKey: {
      type: 'string',
      minLength: 10,
    },
    batchSize: {
      type: 'number',
      min: 1,
      max: 1000,
    },
    flushInterval: {
      type: 'number',
      min: 100,
      max: 60000,
    },
  };

  validate(config, schema);
}

/**
 * Sanitize user input to prevent injection attacks
 */
export function sanitizeInput(input: string): string {
  // Remove control characters
  let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
  
  // Escape HTML entities
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
  
  return sanitized;
}

/**
 * Validate and sanitize file path
 */
export function validateFilePath(path: string): string {
  // Remove any potentially dangerous characters
  const sanitized = path.replace(/[<>:"|?*\x00-\x1F]/g, '');
  
  // Prevent directory traversal
  if (sanitized.includes('..')) {
    throw new ValidationError('Invalid file path: directory traversal detected');
  }
  
  // Ensure path doesn't start with system directories
  const dangerousPaths = ['/etc', '/sys', '/proc', 'C:\\Windows', 'C:\\System'];
  for (const dangerous of dangerousPaths) {
    if (sanitized.toLowerCase().startsWith(dangerous.toLowerCase())) {
      throw new ValidationError(`Invalid file path: access to system directory not allowed`);
    }
  }
  
  return sanitized;
}