import type { TelemetryEvent, SecurityConfig } from '../core/types.js';
import { PIIDetector } from './PIIDetector.js';
import { DataEncryption } from './DataEncryption.js';

export class SecurityProvider {
  private piiDetector: PIIDetector;
  private encryption: DataEncryption;
  private config: SecurityConfig;
  
  constructor(config: SecurityConfig = {}) {
    this.config = {
      pii: { enabled: true },
      encryption: { enabled: false },
      retention: { enabled: true, maxAge: 30 },
      ...config,
    };
    
    this.piiDetector = new PIIDetector(this.config.pii);
    this.encryption = new DataEncryption(this.config.encryption);
  }
  
  async sanitize(event: TelemetryEvent): Promise<TelemetryEvent> {
    let sanitized = { ...event };
    
    // Apply PII detection and redaction
    if (this.config.pii?.enabled) {
      sanitized = await this.piiDetector.sanitize(sanitized);
    }
    
    // Apply encryption if configured
    if (this.config.encryption?.enabled) {
      sanitized = await this.encryption.encrypt(sanitized);
    }
    
    return sanitized;
  }
  
  async decrypt(event: TelemetryEvent): Promise<TelemetryEvent> {
    if (this.config.encryption?.enabled) {
      return this.encryption.decrypt(event);
    }
    return event;
  }
  
  /**
   * Clean up resources
   */
  shutdown(): void {
    // Currently, PIIDetector and DataEncryption don't have resources to clean up
    // But we add this method for consistency and future extensibility
  }
}