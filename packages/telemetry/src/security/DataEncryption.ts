import { createCipher, createDecipher, randomBytes } from 'crypto';
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
    
    if (config.enabled && !config.key) {
      // Generate a random key if encryption is enabled but no key provided
      this.key = randomBytes(32).toString('hex');
      console.warn('Encryption enabled but no key provided. Generated random key. Data may not be decryptable after restart.');
    } else {
      this.key = config.key;
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
    if (decrypted.metadata && decrypted.metadata._encrypted) {
      try {
        const decryptedData = this.decryptString(decrypted.metadata._data);
        decrypted.metadata = JSON.parse(decryptedData);
      } catch {
        // If decryption fails, remove encryption markers but keep data
        const { _encrypted, _data, ...rest } = decrypted.metadata;
        decrypted.metadata = rest;
      }
    }
    
    return decrypted;
  }
  
  private encryptString(text: string): string {
    if (!this.key) throw new Error('Encryption key not available');
    
    const iv = randomBytes(16);
    const cipher = createCipher(this.config.algorithm!, this.key);
    
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
    
    const decipher = createDecipher(this.config.algorithm!, this.key);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
  
  private isEncrypted(text: string): boolean {
    return typeof text === 'string' && text.startsWith('enc:');
  }
}