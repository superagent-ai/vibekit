import type { TelemetryEvent, TelemetryContext } from '../core/types.js';

export class EventValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: any,
    public constraint: string
  ) {
    super(message);
    this.name = 'EventValidationError';
  }
}

export interface ValidationResult<T = any> {
  valid: boolean;
  errors: EventValidationError[];
  sanitized?: T;
}

export class EventValidator {
  private static readonly MAX_STRING_LENGTH = 255;
  private static readonly MAX_LABEL_LENGTH = 1000;
  private static readonly MAX_METADATA_SIZE = 10000; // 10KB
  private static readonly VALID_EVENT_TYPES = ['start', 'stream', 'end', 'error', 'custom'];
  private static readonly UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  private static readonly SAFE_STRING_REGEX = /^[\w\s\-_.@/]+$/;

  /**
   * Validate a telemetry event
   */
  static validate(event: Partial<TelemetryEvent>): ValidationResult<Partial<TelemetryEvent>> {
    const errors: EventValidationError[] = [];
    const sanitized: Partial<TelemetryEvent> = {};

    // Validate and sanitize sessionId
    if (event.sessionId) {
      const sessionResult = this.validateSessionId(event.sessionId);
      if (!sessionResult.valid) {
        errors.push(...sessionResult.errors);
      } else {
        sanitized.sessionId = sessionResult.sanitized;
      }
    }

    // Validate and sanitize id
    if (event.id) {
      const idResult = this.validateId(event.id);
      if (!idResult.valid) {
        errors.push(...idResult.errors);
      } else {
        sanitized.id = idResult.sanitized;
      }
    }

    // Validate eventType
    if (event.eventType) {
      const typeResult = this.validateEventType(event.eventType);
      if (!typeResult.valid) {
        errors.push(...typeResult.errors);
      } else {
        sanitized.eventType = typeResult.sanitized;
      }
    }

    // Validate and sanitize category
    if (event.category) {
      const categoryResult = this.validateString(event.category, 'category', 100);
      if (!categoryResult.valid) {
        errors.push(...categoryResult.errors);
      } else {
        sanitized.category = categoryResult.sanitized;
      }
    }

    // Validate and sanitize action
    if (event.action) {
      const actionResult = this.validateString(event.action, 'action', 100);
      if (!actionResult.valid) {
        errors.push(...actionResult.errors);
      } else {
        sanitized.action = actionResult.sanitized;
      }
    }

    // Validate and sanitize label
    if (event.label !== undefined) {
      const labelResult = this.validateString(event.label, 'label', this.MAX_LABEL_LENGTH);
      if (!labelResult.valid) {
        errors.push(...labelResult.errors);
      } else {
        sanitized.label = labelResult.sanitized;
      }
    }

    // Validate value
    if (event.value !== undefined) {
      const valueResult = this.validateNumber(event.value, 'value');
      if (!valueResult.valid) {
        errors.push(...valueResult.errors);
      } else {
        sanitized.value = valueResult.sanitized;
      }
    }

    // Validate timestamp
    if (event.timestamp !== undefined) {
      const timestampResult = this.validateTimestamp(event.timestamp);
      if (!timestampResult.valid) {
        errors.push(...timestampResult.errors);
      } else {
        sanitized.timestamp = timestampResult.sanitized;
      }
    }

    // Validate duration
    if (event.duration !== undefined) {
      const durationResult = this.validateNumber(event.duration, 'duration', 0);
      if (!durationResult.valid) {
        errors.push(...durationResult.errors);
      } else {
        sanitized.duration = durationResult.sanitized;
      }
    }

    // Validate metadata
    if (event.metadata) {
      const metadataResult = this.validateMetadata(event.metadata);
      if (!metadataResult.valid) {
        errors.push(...metadataResult.errors);
      } else {
        sanitized.metadata = metadataResult.sanitized;
      }
    }

    // Validate context
    if (event.context) {
      const contextResult = this.validateContext(event.context);
      if (!contextResult.valid) {
        errors.push(...contextResult.errors);
      } else {
        sanitized.context = contextResult.sanitized;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized,
    };
  }

  private static validateSessionId(sessionId: any): ValidationResult<string> {
    const errors: EventValidationError[] = [];

    if (typeof sessionId !== 'string') {
      errors.push(new EventValidationError(
        'SessionId must be a string',
        'sessionId',
        sessionId,
        'type:string'
      ));
      return { valid: false, errors };
    }

    if (sessionId.length === 0) {
      errors.push(new EventValidationError(
        'SessionId cannot be empty',
        'sessionId',
        sessionId,
        'minLength:1'
      ));
      return { valid: false, errors };
    }

    if (sessionId.length > this.MAX_STRING_LENGTH) {
      errors.push(new EventValidationError(
        `SessionId exceeds maximum length of ${this.MAX_STRING_LENGTH}`,
        'sessionId',
        sessionId,
        `maxLength:${this.MAX_STRING_LENGTH}`
      ));
      return { valid: false, errors };
    }

    // Sanitize: trim whitespace
    const sanitized = sessionId.trim();

    return { valid: true, errors: [], sanitized };
  }

  private static validateId(id: any): ValidationResult<string> {
    const errors: EventValidationError[] = [];

    if (typeof id !== 'string') {
      errors.push(new EventValidationError(
        'Id must be a string',
        'id',
        id,
        'type:string'
      ));
      return { valid: false, errors };
    }

    if (id.length === 0) {
      errors.push(new EventValidationError(
        'Id cannot be empty',
        'id',
        id,
        'minLength:1'
      ));
      return { valid: false, errors };
    }

    if (id.length > this.MAX_STRING_LENGTH) {
      errors.push(new EventValidationError(
        `Id exceeds maximum length of ${this.MAX_STRING_LENGTH}`,
        'id',
        id,
        `maxLength:${this.MAX_STRING_LENGTH}`
      ));
      return { valid: false, errors };
    }

    // Sanitize: trim whitespace
    const sanitized = id.trim();

    return { valid: true, errors: [], sanitized };
  }

  private static validateEventType(eventType: any): ValidationResult<TelemetryEvent['eventType']> {
    const errors: EventValidationError[] = [];

    if (typeof eventType !== 'string') {
      errors.push(new EventValidationError(
        'EventType must be a string',
        'eventType',
        eventType,
        'type:string'
      ));
      return { valid: false, errors };
    }

    if (!this.VALID_EVENT_TYPES.includes(eventType)) {
      errors.push(new EventValidationError(
        `EventType must be one of: ${this.VALID_EVENT_TYPES.join(', ')}`,
        'eventType',
        eventType,
        'enum:' + this.VALID_EVENT_TYPES.join(',')
      ));
      return { valid: false, errors };
    }

    return { valid: true, errors: [], sanitized: eventType as TelemetryEvent['eventType'] };
  }

  private static validateString(
    value: any,
    field: string,
    maxLength: number = this.MAX_STRING_LENGTH
  ): ValidationResult<string> {
    const errors: EventValidationError[] = [];

    if (typeof value !== 'string') {
      errors.push(new EventValidationError(
        `${field} must be a string`,
        field,
        value,
        'type:string'
      ));
      return { valid: false, errors };
    }

    if (value.length > maxLength) {
      errors.push(new EventValidationError(
        `${field} exceeds maximum length of ${maxLength}`,
        field,
        value,
        `maxLength:${maxLength}`
      ));
      return { valid: false, errors };
    }

    // Sanitize: trim whitespace and remove control characters
    const sanitized = value.trim().replace(/[\x00-\x1F\x7F]/g, '');

    return { valid: true, errors: [], sanitized };
  }

  private static validateNumber(
    value: any,
    field: string,
    min?: number,
    max?: number
  ): ValidationResult<number> {
    const errors: EventValidationError[] = [];

    if (typeof value !== 'number' || isNaN(value)) {
      errors.push(new EventValidationError(
        `${field} must be a valid number`,
        field,
        value,
        'type:number'
      ));
      return { valid: false, errors };
    }

    if (min !== undefined && value < min) {
      errors.push(new EventValidationError(
        `${field} must be at least ${min}`,
        field,
        value,
        `min:${min}`
      ));
      return { valid: false, errors };
    }

    if (max !== undefined && value > max) {
      errors.push(new EventValidationError(
        `${field} must be at most ${max}`,
        field,
        value,
        `max:${max}`
      ));
      return { valid: false, errors };
    }

    return { valid: true, errors: [], sanitized: value };
  }

  private static validateTimestamp(timestamp: any): ValidationResult<number> {
    const errors: EventValidationError[] = [];
    const now = Date.now();
    const oneYearFromNow = now + 365 * 24 * 60 * 60 * 1000;
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

    if (typeof timestamp !== 'number' || isNaN(timestamp)) {
      errors.push(new EventValidationError(
        'Timestamp must be a valid number',
        'timestamp',
        timestamp,
        'type:number'
      ));
      return { valid: false, errors };
    }

    if (timestamp < oneYearAgo || timestamp > oneYearFromNow) {
      errors.push(new EventValidationError(
        'Timestamp must be within one year of current time',
        'timestamp',
        timestamp,
        'range:1year'
      ));
      return { valid: false, errors };
    }

    return { valid: true, errors: [], sanitized: timestamp };
  }

  private static validateMetadata(metadata: any): ValidationResult<Record<string, any>> {
    const errors: EventValidationError[] = [];

    if (typeof metadata !== 'object' || metadata === null) {
      errors.push(new EventValidationError(
        'Metadata must be an object',
        'metadata',
        metadata,
        'type:object'
      ));
      return { valid: false, errors };
    }

    // Check size
    const size = JSON.stringify(metadata).length;
    if (size > this.MAX_METADATA_SIZE) {
      errors.push(new EventValidationError(
        `Metadata exceeds maximum size of ${this.MAX_METADATA_SIZE} bytes`,
        'metadata',
        metadata,
        `maxSize:${this.MAX_METADATA_SIZE}`
      ));
      return { valid: false, errors };
    }

    // Deep sanitize metadata
    const sanitized = this.sanitizeObject(metadata);

    return { valid: true, errors: [], sanitized };
  }

  private static validateContext(context: any): ValidationResult<TelemetryContext> {
    const errors: EventValidationError[] = [];

    if (typeof context !== 'object' || context === null) {
      errors.push(new EventValidationError(
        'Context must be an object',
        'context',
        context,
        'type:object'
      ));
      return { valid: false, errors };
    }

    // Validate specific context fields
    const sanitized: any = {};

    if (context.userId !== undefined) {
      const userIdResult = this.validateString(context.userId, 'context.userId');
      if (userIdResult.valid) {
        sanitized.userId = userIdResult.sanitized;
      }
    }

    if (context.environment !== undefined) {
      const envResult = this.validateString(context.environment, 'context.environment', 50);
      if (envResult.valid) {
        sanitized.environment = envResult.sanitized;
      }
    }

    if (context.version !== undefined) {
      const versionResult = this.validateString(context.version, 'context.version', 50);
      if (versionResult.valid) {
        sanitized.version = versionResult.sanitized;
      }
    }

    // Copy other fields with sanitization
    for (const [key, value] of Object.entries(context)) {
      if (!['userId', 'environment', 'version'].includes(key)) {
        sanitized[key] = this.sanitizeValue(value);
      }
    }

    return { valid: true, errors: [], sanitized };
  }

  private static sanitizeObject(obj: any, depth = 0): any {
    if (depth > 10) {
      // Prevent deep recursion
      return '[DEPTH_LIMIT_EXCEEDED]';
    }

    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeValue(item, depth + 1));
    }

    if (typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Sanitize key
        const sanitizedKey = key.slice(0, 100).replace(/[^\w\-_.]/g, '_');
        sanitized[sanitizedKey] = this.sanitizeValue(value, depth + 1);
      }
      return sanitized;
    }

    return this.sanitizeValue(obj);
  }

  private static sanitizeValue(value: any, depth = 0): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      // Remove control characters and limit length
      return value.slice(0, 1000).replace(/[\x00-\x1F\x7F]/g, '');
    }

    if (typeof value === 'number') {
      return isFinite(value) ? value : null;
    }

    if (typeof value === 'boolean') {
      return value;
    }

    if (Array.isArray(value) || typeof value === 'object') {
      return this.sanitizeObject(value, depth);
    }

    // Other types: convert to string
    return String(value).slice(0, 100);
  }
}