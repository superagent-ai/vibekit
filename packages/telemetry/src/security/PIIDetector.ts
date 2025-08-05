import type { TelemetryEvent } from '../core/types.js';
import { DEFAULT_PII_PATTERNS } from '../core/constants.js';

export interface PIIConfig {
  enabled?: boolean;
  patterns?: Record<string, RegExp> | any;
  customPatterns?: Record<string, RegExp> | Array<RegExp>;
  sensitiveFields?: string[];
  action?: 'redact' | 'detect';
  redactPattern?: string;
}

export class PIIDetector {
  private patterns: Map<string, RegExp>;
  private sensitiveFields: Set<string>;
  private redactPattern: string;
  
  constructor(config: PIIConfig = {}) {
    this.patterns = new Map();
    this.sensitiveFields = new Set(config.sensitiveFields || []);
    this.redactPattern = config.redactPattern || '[REDACTED]';
    
    // Handle the test's configuration format
    if (config.patterns && typeof config.patterns === 'object') {
      const { email, phone, ssn, creditCard, custom } = config.patterns;
      
      if (email) this.patterns.set('email', DEFAULT_PII_PATTERNS.get('email')!);
      if (phone) this.patterns.set('phone', DEFAULT_PII_PATTERNS.get('phone')!);
      if (ssn) this.patterns.set('ssn', DEFAULT_PII_PATTERNS.get('ssn')!);
      if (creditCard) this.patterns.set('creditCard', DEFAULT_PII_PATTERNS.get('creditCard')!);
      
      // Handle custom patterns array
      if (Array.isArray(custom)) {
        custom.forEach((item, index) => {
          if (item.pattern) {
            this.patterns.set(item.name || `custom_${index}`, item.pattern);
          }
        });
      }
    } else {
      // Use default patterns
      this.patterns = new Map(DEFAULT_PII_PATTERNS);
    }
    
    // Add custom patterns
    if (config.customPatterns) {
      if (Array.isArray(config.customPatterns)) {
        config.customPatterns.forEach((pattern, index) => {
          this.patterns.set(`custom_${index}`, pattern);
        });
      } else {
        for (const [name, pattern] of Object.entries(config.customPatterns)) {
          this.patterns.set(name, pattern);
        }
      }
    }
  }
  
  async sanitize(event: TelemetryEvent): Promise<TelemetryEvent> {
    const sanitized = { ...event };
    
    // Sanitize string fields
    if (sanitized.label && typeof sanitized.label === 'string') {
      sanitized.label = this.sanitizeString(sanitized.label);
    }
    
    // Sanitize metadata
    if (sanitized.metadata) {
      sanitized.metadata = this.sanitizeObject(sanitized.metadata);
    }
    
    // Sanitize context
    if (sanitized.context) {
      sanitized.context = this.sanitizeObject(sanitized.context);
    }
    
    return sanitized;
  }
  
  private sanitizeString(value: string): string {
    let sanitized = value;
    
    // Special handling for API keys and passwords - replace the key-value pair but keep prefix
    const specialPatterns = [
      { pattern: /(api[_-]?key|apiKey|API-KEY|x-api-key)[\s:=]+[\w-]{20,}/gi, replacement: this.redactPattern },
      { pattern: /(password|PASSWORD|secret|SECRET|db_password)[\s:=]+\S+/gi, replacement: this.redactPattern },
    ];
    
    for (const { pattern, replacement } of specialPatterns) {
      sanitized = sanitized.replace(pattern, replacement);
    }
    
    // Then apply regular patterns
    for (const [name, pattern] of this.patterns) {
      sanitized = sanitized.replace(pattern, this.redactPattern);
    }
    
    return sanitized;
  }
  
  private sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        // Check if this is a sensitive field
        const isSensitiveField = this.sensitiveFields.has(key.toLowerCase());
        
        // Sanitize the key
        const sanitizedKey = this.sanitizeString(key);
        
        // If it's a sensitive field, always redact the entire value
        if (isSensitiveField) {
          sanitized[sanitizedKey] = this.redactPattern;
        } else {
          sanitized[sanitizedKey] = this.sanitizeObject(value);
        }
      }
      return sanitized;
    }
    
    return obj;
  }
  
  detectPII(text: string): Array<{ type: string; match: string; start: number; end: number }> {
    const detections: Array<{ type: string; match: string; start: number; end: number }> = [];
    
    for (const [type, pattern] of this.patterns) {
      let match;
      const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      
      while ((match = globalPattern.exec(text)) !== null) {
        detections.push({
          type,
          match: match[0],
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
    
    return detections;
  }
}