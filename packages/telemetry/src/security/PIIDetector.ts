import type { TelemetryEvent } from '../core/types.js';
import { DEFAULT_PII_PATTERNS } from '../core/constants.js';

export interface PIIConfig {
  enabled?: boolean;
  patterns?: Record<string, RegExp>;
  customPatterns?: Record<string, RegExp>;
}

export class PIIDetector {
  private patterns: Map<string, RegExp>;
  
  constructor(config: PIIConfig = {}) {
    this.patterns = new Map(DEFAULT_PII_PATTERNS);
    
    // Add custom patterns
    if (config.customPatterns) {
      for (const [name, pattern] of Object.entries(config.customPatterns)) {
        this.patterns.set(name, pattern);
      }
    }
    
    // Override default patterns if provided
    if (config.patterns) {
      for (const [name, pattern] of Object.entries(config.patterns)) {
        this.patterns.set(name, pattern);
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
    
    for (const [name, pattern] of this.patterns) {
      sanitized = sanitized.replace(pattern, `[REDACTED_${name.toUpperCase()}]`);
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
        // Check if the key itself might contain sensitive info
        const sanitizedKey = this.sanitizeString(key);
        sanitized[sanitizedKey] = this.sanitizeObject(value);
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