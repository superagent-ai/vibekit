import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import type { TelemetryEvent } from '../core/types.js';

export interface EncryptionConfig {
  enabled?: boolean;
  key?: string;
  algorithm?: string;
}

export class DataEncryption {
  private config: EncryptionConfig;
  private key?: string;
  
  constructor(config: EncryptionConfig = {}) {
    this.config = {
      algorithm: 'aes-256-ctr',
      ...config,
    };
    
    if (config.enabled) {
      if (!config.key) {
        // Try to get key from environment
        const envKey = process.env.TELEMETRY_ENCRYPTION_KEY;
        if (envKey) {
          this.key = envKey;
        } else {
          throw new Error(
            'Encryption is enabled but no key provided. ' +
            'Please set TELEMETRY_ENCRYPTION_KEY environment variable or provide key in config.'
          );
        }
      } else {
        this.key = config.key;
      }
      
      // Validate key length
      if (this.key.length !== 64) {
        throw new Error(
          'Encryption key must be 64 hex characters (32 bytes). ' +
          'Generate with: openssl rand -hex 32'
        );
      }
    }
  }
  
  async encrypt(event: TelemetryEvent): Promise<TelemetryEvent> {
    if (!this.config.enabled || !this.key) {
      return event;
    }
    
    const encrypted = { ...event };
    
    // Encrypt sensitive fields
    if (encrypted.label) {
      encrypted.label = this.encryptString(encrypted.label);
    }
    
    if (encrypted.metadata) {
      encrypted.metadata = {
        ...encrypted.metadata,
        _encrypted: true,
        _data: this.encryptString(JSON.stringify(encrypted.metadata)),
      };
    }
    
    return encrypted;
  }
  
  async decrypt(event: TelemetryEvent): Promise<TelemetryEvent> {
    if (!this.config.enabled || !this.key) {
      return event;
    }
    
    const decrypted = { ...event };
    
    // Decrypt label if it was encrypted
    if (decrypted.label && this.isEncrypted(decrypted.label)) {
      try {
        decrypted.label = this.decryptString(decrypted.label);
      } catch {
        // If decryption fails, leave as is
      }
    }
    
    // Decrypt metadata if it was encrypted
    if (decrypted.metadata && typeof decrypted.metadata === 'object' && 
        '_encrypted' in decrypted.metadata && '_data' in decrypted.metadata) {
      try {
        const encryptedData = decrypted.metadata._data as string;
        const decryptedData = this.decryptString(encryptedData);
        decrypted.metadata = JSON.parse(decryptedData);
      } catch {
        // If decryption fails, remove encryption markers but keep data
        const { _encrypted, _data, ...rest } = decrypted.metadata as any;
        decrypted.metadata = rest;
      }
    }
    
    return decrypted;
  }
  
  private encryptString(text: string): string {
    if (!this.key) throw new Error('Encryption key not available');
    
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.config.algorithm!, Buffer.from(this.key, 'hex'), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `enc:${iv.toString('hex')}:${encrypted}`;
  }
  
  private decryptString(encryptedText: string): string {
    if (!this.key) throw new Error('Decryption key not available');
    
    if (!this.isEncrypted(encryptedText)) {
      return encryptedText;
    }
    
    const parts = encryptedText.split(':');
    if (parts.length !== 3 || parts[0] !== 'enc') {
      throw new Error('Invalid encrypted format');
    }
    
    const iv = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    
    const decipher = createDecipheriv(this.config.algorithm!, Buffer.from(this.key, 'hex'), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  private isEncrypted(text: string): boolean {
    return typeof text === 'string' && text.startsWith('enc:');
  }
}