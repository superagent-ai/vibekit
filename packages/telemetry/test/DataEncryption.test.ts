import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataEncryption } from '../src/security/DataEncryption.js';
import type { TelemetryEvent } from '../src/core/types.js';

describe('DataEncryption', () => {
  let encryption: DataEncryption;
  const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    encryption = new DataEncryption({
      enabled: true,
      key: testKey,
    });
  });

  describe('initialization', () => {
    it('should initialize with provided key', () => {
      const encryptionWithKey = new DataEncryption({
        enabled: true,
        key: testKey,
      });
      expect(encryptionWithKey).toBeDefined();
    });

    it('should generate random key when enabled but no key provided', () => {
      // After security fix, encryption now requires explicit key
      expect(() => {
        new DataEncryption({
          enabled: true,
        });
      }).toThrow('Encryption is enabled but no key provided');
    });

    it('should not require key when disabled', () => {
      const encryptionDisabled = new DataEncryption({
        enabled: false,
      });
      expect(encryptionDisabled).toBeDefined();
    });
  });

  describe('encrypt', () => {
    it('should return original event when encryption disabled', async () => {
      const disabledEncryption = new DataEncryption({ enabled: false });
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'encrypt',
        timestamp: Date.now(),
        label: 'sensitive data',
        metadata: { secret: 'value' },
      };

      const result = await disabledEncryption.encrypt(event);
      expect(result).toEqual(event);
    });

    it('should encrypt label when present', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'encrypt',
        timestamp: Date.now(),
        label: 'sensitive label',
      };

      const encrypted = await encryption.encrypt(event);
      
      expect(encrypted.label).not.toBe('sensitive label');
      expect(encrypted.label).toMatch(/^enc:[a-f0-9]+:[a-f0-9]+$/);
      expect(encrypted.id).toBe(event.id); // Other fields unchanged
      expect(encrypted.sessionId).toBe(event.sessionId);
    });

    it('should encrypt metadata when present', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'encrypt',
        timestamp: Date.now(),
        metadata: {
          secret: 'sensitive data',
          nested: { key: 'value' },
        },
      };

      const encrypted = await encryption.encrypt(event);
      
      expect(encrypted.metadata).toHaveProperty('_encrypted', true);
      expect(encrypted.metadata).toHaveProperty('_data');
      expect((encrypted.metadata as any)._data).toMatch(/^enc:[a-f0-9]+:[a-f0-9]+$/);
    });

    it('should not modify events without sensitive fields', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'encrypt',
        timestamp: Date.now(),
      };

      const encrypted = await encryption.encrypt(event);
      expect(encrypted).toEqual(event);
    });
  });

  describe('decrypt', () => {
    it('should return original event when encryption disabled', async () => {
      const disabledEncryption = new DataEncryption({ enabled: false });
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'decrypt',
        timestamp: Date.now(),
        label: 'enc:abcd:1234',
      };

      const result = await disabledEncryption.decrypt(event);
      expect(result).toEqual(event);
    });

    it('should decrypt encrypted label', async () => {
      const originalEvent: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'decrypt',
        timestamp: Date.now(),
        label: 'original label',
      };

      const encrypted = await encryption.encrypt(originalEvent);
      const decrypted = await encryption.decrypt(encrypted);

      expect(decrypted.label).toBe('original label');
    });

    it('should decrypt encrypted metadata', async () => {
      const originalEvent: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'decrypt',
        timestamp: Date.now(),
        metadata: {
          secret: 'sensitive data',
          public: 'not secret',
        },
      };

      const encrypted = await encryption.encrypt(originalEvent);
      const decrypted = await encryption.decrypt(encrypted);

      expect(decrypted.metadata).toEqual({
        secret: 'sensitive data',
        public: 'not secret',
      });
    });

    it('should handle decryption errors gracefully', async () => {
      const eventWithBadEncryption: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'decrypt',
        timestamp: Date.now(),
        label: 'enc:invalid:data',
        metadata: {
          _encrypted: true,
          _data: 'enc:bad:encryption',
        },
      };

      const decrypted = await encryption.decrypt(eventWithBadEncryption);
      
      // Should leave bad label as-is
      expect(decrypted.label).toBe('enc:invalid:data');
      
      // Should clean up bad metadata
      expect(decrypted.metadata).toEqual({});
    });

    it('should not modify non-encrypted data', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'decrypt',
        timestamp: Date.now(),
        label: 'plain text',
        metadata: { normal: 'data' },
      };

      const decrypted = await encryption.decrypt(event);
      expect(decrypted).toEqual(event);
    });
  });

  describe('round-trip encryption', () => {
    it('should maintain data integrity through encrypt/decrypt cycle', async () => {
      const originalEvent: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'roundtrip',
        timestamp: Date.now(),
        label: 'sensitive label with special chars: àáâãäå',
        value: 42,
        duration: 1000,
        metadata: {
          string: 'text',
          number: 123,
          boolean: true,
          nested: {
            array: [1, 2, 3],
            object: { key: 'value' },
          },
          unicode: '🔒 encrypted data 🔐',
        },
        context: {
          user: 'test-user',
          version: '1.0.0',
        },
      };

      const encrypted = await encryption.encrypt(originalEvent);
      const decrypted = await encryption.decrypt(encrypted);

      expect(decrypted).toEqual(originalEvent);
    });

    it('should work with different encryption keys', async () => {
      const key1 = '1111111111111111111111111111111111111111111111111111111111111111';
      const key2 = '2222222222222222222222222222222222222222222222222222222222222222';
      
      const encryption1 = new DataEncryption({ enabled: true, key: key1 });
      const encryption2 = new DataEncryption({ enabled: true, key: key2 });

      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'keys',
        timestamp: Date.now(),
        label: 'test data',
      };

      const encrypted1 = await encryption1.encrypt(event);
      const encrypted2 = await encryption2.encrypt(event);

      // Different keys should produce different encrypted results
      expect(encrypted1.label).not.toBe(encrypted2.label);

      // Each key should decrypt its own data correctly
      const decrypted1 = await encryption1.decrypt(encrypted1);
      const decrypted2 = await encryption2.decrypt(encrypted2);

      expect(decrypted1.label).toBe('test data');
      expect(decrypted2.label).toBe('test data');
    });
  });
});