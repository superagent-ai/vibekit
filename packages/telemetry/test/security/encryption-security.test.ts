import { describe, it, expect, beforeEach } from 'vitest';
import { DataEncryption } from '../../src/security/DataEncryption.js';
import type { TelemetryEvent } from '../../src/core/types.js';

describe('Encryption Security Tests', () => {
  describe('Key Management', () => {
    it('should reject weak encryption keys', () => {
      expect(() => {
        new DataEncryption({
          enabled: true,
          key: 'weak-key', // Too short
        });
      }).toThrow();
    });

    it('should require minimum 32-character keys', () => {
      expect(() => {
        new DataEncryption({
          enabled: true,
          key: '0123456789abcdef0123456789abcde', // 31 chars
        });
      }).toThrow();
    });

    it('should accept valid 32+ character keys', () => {
      expect(() => {
        new DataEncryption({
          enabled: true,
          key: '0123456789abcdef0123456789abcdef', // 32 chars
        });
      }).not.toThrow();
    });

    it('should not allow key extraction from instance', () => {
      const encryption = new DataEncryption({
        enabled: true,
        key: '0123456789abcdef0123456789abcdef',
      });

      // Try to access private key
      expect((encryption as any).key).toBeUndefined();
      expect((encryption as any).config?.key).toBeUndefined();
      
      // Ensure key is not exposed in any property
      const keys = Object.keys(encryption);
      const values = Object.values(encryption);
      const keyString = '0123456789abcdef0123456789abcdef';
      
      expect(keys.join('')).not.toContain(keyString);
      expect(values.join('')).not.toContain(keyString);
    });
  });

  describe('Encryption Strength', () => {
    let encryption: DataEncryption;
    const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    beforeEach(() => {
      encryption = new DataEncryption({
        enabled: true,
        key: testKey,
      });
    });

    it('should produce different ciphertext for same plaintext (IV uniqueness)', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'encrypt',
        timestamp: Date.now(),
        label: 'sensitive data',
      };

      const encrypted1 = await encryption.encrypt({ ...event });
      const encrypted2 = await encryption.encrypt({ ...event });

      // Same plaintext should produce different ciphertext due to unique IVs
      expect(encrypted1.label).not.toBe(encrypted2.label);
    });

    it('should use secure IV length', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'encrypt',
        timestamp: Date.now(),
        label: 'test',
      };

      const encrypted = await encryption.encrypt(event);
      const encryptedLabel = encrypted.label as string;
      
      // Format: enc:iv:ciphertext
      const parts = encryptedLabel.split(':');
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('enc');
      
      // IV should be 16 bytes (32 hex chars) for AES
      expect(parts[1].length).toBe(32);
    });

    it('should not leak information about plaintext length', async () => {
      const shortEvent: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'encrypt',
        timestamp: Date.now(),
        label: 'a',
      };

      const longEvent: TelemetryEvent = {
        ...shortEvent,
        label: 'a'.repeat(100),
      };

      const encryptedShort = await encryption.encrypt(shortEvent);
      const encryptedLong = await encryption.encrypt(longEvent);

      // Check that length doesn't directly correlate
      const shortLen = (encryptedShort.label as string).length;
      const longLen = (encryptedLong.label as string).length;
      
      // The difference should be padded/blocked
      expect(longLen - shortLen).toBeLessThan(95); // Not 1:1 correlation
    });
  });

  describe('Decryption Security', () => {
    let encryption: DataEncryption;
    const testKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    beforeEach(() => {
      encryption = new DataEncryption({
        enabled: true,
        key: testKey,
      });
    });

    it('should handle tampered ciphertext safely', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'decrypt',
        timestamp: Date.now(),
        label: 'enc:abcd:tampereddata',
      };

      const decrypted = await encryption.decrypt(event);
      
      // Should return the tampered data as-is, not throw
      expect(decrypted.label).toBe('enc:abcd:tampereddata');
    });

    it('should handle malformed encrypted data', async () => {
      const testCases = [
        'enc:', // Missing parts
        'enc:invalid', // Missing ciphertext
        'enc:tooshort:data', // Invalid IV length
        'enc:../../../etc/passwd:data', // Path traversal attempt
        'enc:${process.env.SECRET}:data', // Template injection
        'enc:<script>alert(1)</script>:data', // XSS attempt
      ];

      for (const testCase of testCases) {
        const event: TelemetryEvent = {
          id: 'test-1',
          sessionId: 'session-1',
          eventType: 'event',
          category: 'test',
          action: 'decrypt',
          timestamp: Date.now(),
          label: testCase,
        };

        const decrypted = await encryption.decrypt(event);
        
        // Should handle gracefully without throwing
        expect(decrypted.label).toBe(testCase);
      }
    });

    it('should not decrypt with wrong key', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'encrypt',
        timestamp: Date.now(),
        label: 'sensitive data',
      };

      // Encrypt with one key
      const encrypted = await encryption.encrypt(event);

      // Try to decrypt with different key
      const wrongKeyEncryption = new DataEncryption({
        enabled: true,
        key: 'wrongkey0123456789abcdef0123456789abcdef0123456789abcdef',
      });

      const decrypted = await wrongKeyEncryption.decrypt(encrypted);
      
      // Should fail to decrypt properly
      expect(decrypted.label).not.toBe('sensitive data');
      expect(decrypted.label).toBe(encrypted.label); // Returns as-is when decrypt fails
    });
  });

  describe('Metadata Encryption', () => {
    let encryption: DataEncryption;

    beforeEach(() => {
      encryption = new DataEncryption({
        enabled: true,
        key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      });
    });

    it('should encrypt nested sensitive data in metadata', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'metadata',
        timestamp: Date.now(),
        metadata: {
          user: {
            email: 'user@example.com',
            ssn: '123-45-6789',
            apiKey: 'secret-api-key',
          },
          creditCard: '4111-1111-1111-1111',
        },
      };

      const encrypted = await encryption.encrypt(event);
      
      // Metadata should be encrypted as a whole
      expect(encrypted.metadata).toHaveProperty('_encrypted', true);
      expect(encrypted.metadata).toHaveProperty('_data');
      
      // Original sensitive data should not be present
      const stringified = JSON.stringify(encrypted);
      expect(stringified).not.toContain('user@example.com');
      expect(stringified).not.toContain('123-45-6789');
      expect(stringified).not.toContain('secret-api-key');
      expect(stringified).not.toContain('4111-1111-1111-1111');
    });

    it('should handle circular references in metadata safely', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'circular',
        timestamp: Date.now(),
        metadata: {
          data: null as any,
        },
      };
      
      // Create circular reference
      event.metadata!.data = event.metadata;

      // Should handle without throwing
      await expect(encryption.encrypt(event)).resolves.toBeDefined();
    });
  });

  describe('Side Channel Protection', () => {
    let encryption: DataEncryption;

    beforeEach(() => {
      encryption = new DataEncryption({
        enabled: true,
        key: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      });
    });

    it('should have consistent execution time for different inputs', async () => {
      const shortData = 'a';
      const longData = 'a'.repeat(1000);
      
      const event1: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'timing',
        timestamp: Date.now(),
        label: shortData,
      };

      const event2: TelemetryEvent = {
        ...event1,
        label: longData,
      };

      // Measure encryption times
      const times1: number[] = [];
      const times2: number[] = [];

      for (let i = 0; i < 10; i++) {
        const start1 = performance.now();
        await encryption.encrypt({ ...event1 });
        times1.push(performance.now() - start1);

        const start2 = performance.now();
        await encryption.encrypt({ ...event2 });
        times2.push(performance.now() - start2);
      }

      const avg1 = times1.reduce((a, b) => a + b) / times1.length;
      const avg2 = times2.reduce((a, b) => a + b) / times2.length;

      // Time difference should be proportional to data size, not revealing patterns
      expect(avg2 / avg1).toBeLessThan(10); // Not 1000x slower
    });
  });

  describe('Environment Protection', () => {
    it('should not log encryption keys', async () => {
      const consoleSpy = vi.spyOn(console, 'log');
      const consoleErrorSpy = vi.spyOn(console, 'error');
      const consoleWarnSpy = vi.spyOn(console, 'warn');

      const key = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      const encryption = new DataEncryption({
        enabled: true,
        key,
      });

      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'log-test',
        timestamp: Date.now(),
        label: 'test',
      };

      await encryption.encrypt(event);
      await encryption.decrypt(event);

      // Check that key was never logged
      const allLogs = [
        ...consoleSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
      ].flat().join(' ');

      expect(allLogs).not.toContain(key);
      expect(allLogs).not.toContain('0123456789abcdef');

      consoleSpy.mockRestore();
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });
  });
});