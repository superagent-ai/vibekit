import type { TelemetryEvent, TelemetryContext } from '../core/types.js';

export interface ValidationRule {
  field: string;
  type: 'required' | 'type' | 'pattern' | 'range' | 'custom';
  value?: any;
  message?: string;
  validator?: (value: any, event: TelemetryEvent) => boolean;
}

export interface ValidationSchema {
  rules: ValidationRule[];
  strict?: boolean; // If true, reject events with unknown fields
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    rule: string;
    message: string;
  }>;
  warnings: Array<{
    field: string;
    message: string;
  }>;
}

export class EventValidator {
  private schemas = new Map<string, ValidationSchema>();
  private globalRules: ValidationRule[] = [];
  
  constructor() {
    this.setupDefaultRules();
  }
  
  private setupDefaultRules(): void {
    // Default rules that apply to all events
    this.globalRules = [
      {
        field: 'sessionId',
        type: 'required',
        message: 'Session ID is required',
      },
      {
        field: 'eventType',
        type: 'required',
        message: 'Event type is required',
      },
      {
        field: 'eventType',
        type: 'pattern',
        value: /^(start|stream|end|error|custom)$/,
        message: 'Invalid event type',
      },
      {
        field: 'category',
        type: 'required',
        message: 'Category is required',
      },
      {
        field: 'action',
        type: 'required',
        message: 'Action is required',
      },
      {
        field: 'timestamp',
        type: 'required',
        message: 'Timestamp is required',
      },
      {
        field: 'timestamp',
        type: 'range',
        value: { min: 0, max: Date.now() + 86400000 }, // Allow up to 1 day in future
        message: 'Invalid timestamp',
      },
    ];
  }
  
  /**
   * Register a validation schema for a specific event category
   */
  registerSchema(category: string, schema: ValidationSchema): void {
    this.schemas.set(category, schema);
  }
  
  /**
   * Add global validation rules
   */
  addGlobalRule(rule: ValidationRule): void {
    this.globalRules.push(rule);
  }
  
  /**
   * Validate a single event
   */
  validate(event: TelemetryEvent): ValidationResult {
    const errors: ValidationResult['errors'] = [];
    const warnings: ValidationResult['warnings'] = [];
    
    // Apply global rules
    this.applyRules(event, this.globalRules, errors, warnings);
    
    // Apply category-specific rules
    const schema = this.schemas.get(event.category);
    if (schema) {
      this.applyRules(event, schema.rules, errors, warnings);
      
      // Check for unknown fields if strict mode
      if (schema.strict) {
        const knownFields = new Set([
          'id', 'sessionId', 'eventType', 'category', 'action',
          'label', 'value', 'timestamp', 'duration', 'metadata', 'context',
        ]);
        
        Object.keys(event).forEach(key => {
          if (!knownFields.has(key)) {
            warnings.push({
              field: key,
              message: `Unknown field in strict mode`,
            });
          }
        });
      }
    }
    
    // Validate nested structures
    if (event.context) {
      this.validateContext(event.context, errors, warnings);
    }
    
    if (event.metadata) {
      this.validateMetadata(event.metadata, errors, warnings);
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
  
  /**
   * Validate a batch of events
   */
  validateBatch(events: TelemetryEvent[]): {
    results: ValidationResult[];
    summary: {
      total: number;
      valid: number;
      invalid: number;
      errors: number;
      warnings: number;
    };
  } {
    const results = events.map(event => this.validate(event));
    
    const summary = {
      total: events.length,
      valid: results.filter(r => r.valid).length,
      invalid: results.filter(r => !r.valid).length,
      errors: results.reduce((sum, r) => sum + r.errors.length, 0),
      warnings: results.reduce((sum, r) => sum + r.warnings.length, 0),
    };
    
    return { results, summary };
  }
  
  /**
   * Sanitize an event to fix common issues
   */
  sanitize(event: TelemetryEvent): TelemetryEvent {
    const sanitized = { ...event };
    
    // Ensure required fields have defaults
    if (!sanitized.timestamp) {
      sanitized.timestamp = Date.now();
    }
    
    // Trim strings
    if (sanitized.category) {
      sanitized.category = sanitized.category.trim();
    }
    if (sanitized.action) {
      sanitized.action = sanitized.action.trim();
    }
    if (sanitized.label) {
      sanitized.label = sanitized.label.trim();
    }
    
    // Ensure metadata is an object
    if (sanitized.metadata && typeof sanitized.metadata !== 'object') {
      sanitized.metadata = { value: sanitized.metadata };
    }
    
    // Clean up numbers
    if (sanitized.value !== undefined && typeof sanitized.value !== 'number') {
      sanitized.value = parseFloat(String(sanitized.value));
      if (isNaN(sanitized.value)) {
        delete sanitized.value;
      }
    }
    
    return sanitized;
  }
  
  private applyRules(
    event: TelemetryEvent,
    rules: ValidationRule[],
    errors: ValidationResult['errors'],
    warnings: ValidationResult['warnings']
  ): void {
    for (const rule of rules) {
      const value = this.getFieldValue(event, rule.field);
      let valid = true;
      
      switch (rule.type) {
        case 'required':
          valid = value !== undefined && value !== null && value !== '';
          break;
          
        case 'type':
          valid = typeof value === rule.value;
          break;
          
        case 'pattern':
          valid = rule.value.test(String(value));
          break;
          
        case 'range':
          if (typeof value === 'number') {
            const { min, max } = rule.value;
            valid = (min === undefined || value >= min) && 
                   (max === undefined || value <= max);
          } else {
            valid = false;
          }
          break;
          
        case 'custom':
          if (rule.validator) {
            valid = rule.validator(value, event);
          }
          break;
      }
      
      if (!valid) {
        errors.push({
          field: rule.field,
          rule: rule.type,
          message: rule.message || `Validation failed for ${rule.field}`,
        });
      }
    }
  }
  
  private validateContext(
    context: TelemetryContext,
    errors: ValidationResult['errors'],
    warnings: ValidationResult['warnings']
  ): void {
    // Validate known context fields
    if (context.userId && typeof context.userId !== 'string') {
      errors.push({
        field: 'context.userId',
        rule: 'type',
        message: 'User ID must be a string',
      });
    }
    
    if (context.organizationId && typeof context.organizationId !== 'string') {
      errors.push({
        field: 'context.organizationId',
        rule: 'type',
        message: 'Organization ID must be a string',
      });
    }
    
    // Check for PII in context
    if (context.custom) {
      Object.entries(context.custom).forEach(([key, value]) => {
        if (typeof value === 'string' && this.containsPII(value)) {
          warnings.push({
            field: `context.custom.${key}`,
            message: 'Potential PII detected',
          });
        }
      });
    }
  }
  
  private validateMetadata(
    metadata: Record<string, any>,
    errors: ValidationResult['errors'],
    warnings: ValidationResult['warnings']
  ): void {
    // Check metadata size
    const metadataStr = JSON.stringify(metadata);
    if (metadataStr.length > 10240) { // 10KB limit
      warnings.push({
        field: 'metadata',
        message: 'Metadata exceeds recommended size limit (10KB)',
      });
    }
    
    // Check for circular references
    try {
      JSON.stringify(metadata);
    } catch (error) {
      errors.push({
        field: 'metadata',
        rule: 'custom',
        message: 'Metadata contains circular references',
      });
    }
  }
  
  private getFieldValue(event: TelemetryEvent, fieldPath: string): any {
    const parts = fieldPath.split('.');
    let value: any = event;
    
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }
  
  private containsPII(value: string): boolean {
    // Simple PII detection patterns
    const patterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{16}\b/, // Credit card
      /\b\d{3}-\d{3}-\d{4}\b/, // Phone number
    ];
    
    return patterns.some(pattern => pattern.test(value));
  }
}

// Pre-configured validators for common use cases
export const CommonValidators = {
  /**
   * Validator for user interaction events
   */
  userInteraction: (): ValidationSchema => ({
    rules: [
      {
        field: 'context.userId',
        type: 'required',
        message: 'User ID is required for interaction events',
      },
      {
        field: 'metadata.targetElement',
        type: 'required',
        message: 'Target element is required for interaction events',
      },
    ],
  }),
  
  /**
   * Validator for performance events
   */
  performance: (): ValidationSchema => ({
    rules: [
      {
        field: 'duration',
        type: 'required',
        message: 'Duration is required for performance events',
      },
      {
        field: 'duration',
        type: 'range',
        value: { min: 0, max: 3600000 }, // Max 1 hour
        message: 'Duration must be between 0 and 1 hour',
      },
    ],
  }),
  
  /**
   * Validator for error events
   */
  error: (): ValidationSchema => ({
    rules: [
      {
        field: 'metadata.error',
        type: 'required',
        message: 'Error details are required for error events',
      },
      {
        field: 'metadata.error.message',
        type: 'required',
        message: 'Error message is required',
      },
    ],
  }),
};