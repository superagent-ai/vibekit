import type { Plugin, TelemetryEvent, ExportResult } from '../../core/types.js';
import type { HookContext } from '../hooks/types.js';
import { createCipheriv, createDecipheriv, randomBytes, CipherGCM, DecipherGCM } from 'crypto';

/**
 * Example plugin that encrypts sensitive data in events
 */
export class EncryptionPlugin implements Plugin {
  name = 'encryption-plugin';
  version = '1.0.0';
  description = 'Encrypts sensitive fields in telemetry events';
  
  private algorithm = 'aes-256-gcm';
  private key: Buffer;
  private sensitiveFields: Set<string>;
  
  constructor(options: { 
    encryptionKey?: string; 
    sensitiveFields?: string[] 
  } = {}) {
    // Use provided key or generate one
    this.key = options.encryptionKey 
      ? Buffer.from(options.encryptionKey, 'hex')
      : randomBytes(32);
    
    this.sensitiveFields = new Set(options.sensitiveFields || [
      'userId',
      'email',
      'ipAddress',
      'creditCard',
      'ssn',
    ]);
  }
  
  async initialize(telemetry: any): Promise<void> {
    console.log(`${this.name} initialized with ${this.sensitiveFields.size} sensitive fields`);
  }
  
  async beforeStore(
    events: TelemetryEvent[],
    provider: string,
    context: HookContext
  ): Promise<TelemetryEvent[]> {
    return events.map(event => this.encryptEvent(event));
  }
  
  async afterQuery(
    results: TelemetryEvent[],
    filter: any,
    provider: string,
    context: HookContext
  ): Promise<TelemetryEvent[]> {
    return results.map(event => this.decryptEvent(event));
  }
  
  async beforeExport(
    events: TelemetryEvent[],
    format: string,
    options: any,
    context: HookContext
  ): Promise<TelemetryEvent[]> {
    // Decrypt for export unless explicitly requested to keep encrypted
    if (options?.keepEncrypted) {
      return events;
    }
    return events.map(event => this.decryptEvent(event));
  }
  
  private encryptEvent(event: TelemetryEvent): TelemetryEvent {
    const encrypted = { ...event };
    
    // Encrypt fields in metadata
    if (encrypted.metadata) {
      encrypted.metadata = this.encryptObject(encrypted.metadata);
    }
    
    // Encrypt fields in context
    if (encrypted.context) {
      encrypted.context = this.encryptObject(encrypted.context);
    }
    
    return encrypted;
  }
  
  private decryptEvent(event: TelemetryEvent): TelemetryEvent {
    const decrypted = { ...event };
    
    // Decrypt fields in metadata
    if (decrypted.metadata) {
      decrypted.metadata = this.decryptObject(decrypted.metadata);
    }
    
    // Decrypt fields in context
    if (decrypted.context) {
      decrypted.context = this.decryptObject(decrypted.context);
    }
    
    return decrypted;
  }
  
  private encryptObject(obj: any): any {
    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (this.sensitiveFields.has(key) && typeof value === 'string') {
        result[key] = this.encrypt(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.encryptObject(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  private decryptObject(obj: any): any {
    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string' && value.startsWith('encrypted:')) {
        try {
          result[key] = this.decrypt(value);
        } catch {
          result[key] = value; // Keep encrypted if decryption fails
        }
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.decryptObject(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  private encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.key, iv) as CipherGCM;
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    return `encrypted:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }
  
  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 4 || parts[0] !== 'encrypted') {
      throw new Error('Invalid encrypted format');
    }
    
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encrypted = parts[3];
    
    const decipher = createDecipheriv(this.algorithm, this.key, iv) as DecipherGCM;
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  async shutdown(): Promise<void> {
    console.log(`${this.name} shutdown complete`);
  }
}