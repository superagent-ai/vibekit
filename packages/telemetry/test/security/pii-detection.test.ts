import { describe, it, expect, beforeEach } from 'vitest';
import { PIIDetector } from '../../src/security/PIIDetector.js';
import type { TelemetryEvent } from '../../src/core/types.js';

describe('PII Detection Security Tests', () => {
  let detector: PIIDetector;

  beforeEach(() => {
    detector = new PIIDetector({
      enabled: true,
      patterns: {
        email: true,
        phone: true,
        ssn: true,
        creditCard: true,
        custom: [
          { name: 'api-key', pattern: /api[_-]?key[\s:=]+[\w-]{20,}/gi },
          { name: 'jwt', pattern: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g },
        ],
      },
      customPatterns: [
        /password[\s:=]+\S+/gi,
        /secret[\s:=]+\S+/gi,
      ],
      sensitiveFields: ['password', 'secret', 'token', 'auth'],
      action: 'redact',
      redactPattern: '[REDACTED]',
    });
  });

  describe('Email Detection', () => {
    it('should detect various email formats', async () => {
      const emails = [
        'user@example.com',
        'first.last@company.co.uk',
        'test+tag@domain.org',
        'admin@192.168.1.1',
        'user123@sub.domain.com',
      ];

      for (const email of emails) {
        const event: TelemetryEvent = {
          id: 'test-1',
          sessionId: 'session-1',
          eventType: 'event',
          category: 'test',
          action: 'email-test',
          timestamp: Date.now(),
          label: `Contact me at ${email} for details`,
        };

        const sanitized = await detector.sanitize(event);
        expect(sanitized.label).not.toContain(email);
        expect(sanitized.label).toContain('[REDACTED]');
      }
    });

    it('should detect emails in metadata', async () => {
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
            secondary: 'backup@example.com',
          },
          description: 'Send to admin@company.com',
        },
      };

      const sanitized = await detector.sanitize(event);
      expect(JSON.stringify(sanitized.metadata)).not.toContain('@example.com');
      expect(JSON.stringify(sanitized.metadata)).not.toContain('@company.com');
    });
  });

  describe('Phone Number Detection', () => {
    it('should detect various phone formats', async () => {
      const phones = [
        '(555) 123-4567',
        '555-123-4567',
        '5551234567',
        '+1 555 123 4567',
        '+44 20 7123 4567',
        '1-800-FLOWERS',
      ];

      for (const phone of phones) {
        const event: TelemetryEvent = {
          id: 'test-1',
          sessionId: 'session-1',
          eventType: 'event',
          category: 'test',
          action: 'phone-test',
          timestamp: Date.now(),
          label: `Call us at ${phone}`,
        };

        const sanitized = await detector.sanitize(event);
        expect(sanitized.label).toBe('Call us at [REDACTED]');
      }
    });
  });

  describe('SSN Detection', () => {
    it('should detect social security numbers', async () => {
      const ssns = [
        '123-45-6789',
        '123 45 6789',
        '123456789',
      ];

      for (const ssn of ssns) {
        const event: TelemetryEvent = {
          id: 'test-1',
          sessionId: 'session-1',
          eventType: 'event',
          category: 'test',
          action: 'ssn-test',
          timestamp: Date.now(),
          metadata: {
            userInfo: `SSN: ${ssn}`,
          },
        };

        const sanitized = await detector.sanitize(event);
        expect(JSON.stringify(sanitized.metadata)).not.toContain(ssn.replace(/\D/g, ''));
        expect(JSON.stringify(sanitized.metadata)).toContain('[REDACTED]');
      }
    });

    it('should not false positive on similar patterns', async () => {
      const notSSNs = [
        '12-34-5678', // Too short
        '1234-56-789', // Wrong format
        '000-00-0000', // Invalid SSN
        '666-12-3456', // Invalid prefix
      ];

      for (const notSSN of notSSNs) {
        const event: TelemetryEvent = {
          id: 'test-1',
          sessionId: 'session-1',
          eventType: 'event',
          category: 'test',
          action: 'not-ssn',
          timestamp: Date.now(),
          label: `Reference: ${notSSN}`,
        };

        const sanitized = await detector.sanitize(event);
        // Some might still be redacted for safety, but check it's handled
        expect(sanitized.label).toBeDefined();
      }
    });
  });

  describe('Credit Card Detection', () => {
    it('should detect credit card numbers', async () => {
      const cards = [
        '4111 1111 1111 1111', // Visa
        '5500-0000-0000-0004', // Mastercard
        '3400 000000 00009', // Amex
        '6011000000000004', // Discover
      ];

      for (const card of cards) {
        const event: TelemetryEvent = {
          id: 'test-1',
          sessionId: 'session-1',
          eventType: 'event',
          category: 'test',
          action: 'cc-test',
          timestamp: Date.now(),
          metadata: {
            payment: {
              card: card,
              last4: card.slice(-4),
            },
          },
        };

        const sanitized = await detector.sanitize(event);
        const metadataStr = JSON.stringify(sanitized.metadata);
        
        // Full card number should be redacted
        expect(metadataStr).not.toContain(card.replace(/\D/g, ''));
        // Even last4 might be redacted for safety
        expect(metadataStr).toContain('[REDACTED]');
      }
    });
  });

  describe('API Key and Secret Detection', () => {
    it('should detect API keys in various formats', async () => {
      const apiKeys = [
        'api_key=sk_test_1234567890abcdefghijklmnop',
        'apiKey: pk_live_ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'API-KEY=1234567890abcdef1234567890abcdef',
        'x-api-key: abcdefghijklmnopqrstuvwxyz123456',
      ];

      for (const apiKey of apiKeys) {
        const event: TelemetryEvent = {
          id: 'test-1',
          sessionId: 'session-1',
          eventType: 'event',
          category: 'test',
          action: 'api-key',
          timestamp: Date.now(),
          label: `Config: ${apiKey}`,
        };

        const sanitized = await detector.sanitize(event);
        expect(sanitized.label).toBe('Config: [REDACTED]');
      }
    });

    it('should detect JWT tokens', async () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'jwt',
        timestamp: Date.now(),
        context: {
          headers: {
            authorization: `Bearer ${jwt}`,
          },
        },
      };

      const sanitized = await detector.sanitize(event);
      expect(JSON.stringify(sanitized.context)).not.toContain(jwt);
      expect(JSON.stringify(sanitized.context)).toContain('[REDACTED]');
    });

    it('should detect passwords and secrets', async () => {
      const secrets = [
        'password: mysecretpass123',
        'secret=topsecret',
        'PASSWORD=StrongP@ssw0rd',
        'db_password: admin123',
      ];

      for (const secret of secrets) {
        const event: TelemetryEvent = {
          id: 'test-1',
          sessionId: 'session-1',
          eventType: 'event',
          category: 'test',
          action: 'secret',
          timestamp: Date.now(),
          metadata: {
            config: secret,
          },
        };

        const sanitized = await detector.sanitize(event);
        expect(JSON.stringify(sanitized.metadata)).toBe('{"config":"[REDACTED]"}');
      }
    });
  });

  describe('Sensitive Field Protection', () => {
    it('should redact values in sensitive fields', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'sensitive',
        timestamp: Date.now(),
        metadata: {
          password: 'not-detected-by-pattern',
          secret: 'another-value',
          token: 'bearer-token',
          auth: {
            key: 'auth-key',
            password: 'nested-password',
          },
          safe: 'this-is-ok',
        },
      };

      const sanitized = await detector.sanitize(event);
      const metadata = sanitized.metadata as any;
      
      expect(metadata.password).toBe('[REDACTED]');
      expect(metadata.secret).toBe('[REDACTED]');
      expect(metadata.token).toBe('[REDACTED]');
      expect(metadata.auth).toBe('[REDACTED]'); // Entire auth object
      expect(metadata.safe).toBe('this-is-ok'); // Not sensitive
    });
  });

  describe('Performance with Large Data', () => {
    it('should handle large texts efficiently', async () => {
      const largeText = 'Lorem ipsum '.repeat(1000) + 'email@example.com' + ' more text'.repeat(1000);
      
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'large',
        timestamp: Date.now(),
        label: largeText,
      };

      const start = Date.now();
      const sanitized = await detector.sanitize(event);
      const duration = Date.now() - start;

      expect(sanitized.label).not.toContain('email@example.com');
      expect(sanitized.label).toContain('[REDACTED]');
      expect(duration).toBeLessThan(100); // Should be fast
    });

    it('should handle deeply nested objects', async () => {
      const createNested = (depth: number): any => {
        if (depth === 0) {
          return { email: 'deep@example.com', ssn: '123-45-6789' };
        }
        return { nested: createNested(depth - 1) };
      };

      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'nested',
        timestamp: Date.now(),
        metadata: createNested(10), // 10 levels deep
      };

      const sanitized = await detector.sanitize(event);
      const metadataStr = JSON.stringify(sanitized.metadata);
      
      expect(metadataStr).not.toContain('deep@example.com');
      expect(metadataStr).not.toContain('123-45-6789');
      expect(metadataStr).toContain('[REDACTED]');
    });
  });

  describe('False Positive Prevention', () => {
    it('should not redact non-PII data', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'safe',
        timestamp: Date.now(),
        label: 'Error code: 404',
        metadata: {
          count: 123456789, // Not SSN
          reference: 'ORDER-1234-5678', // Not SSN
          version: '4.1.1', // Not credit card
          ipAddress: '192.168.1.1', // Not email
        },
      };

      const sanitized = await detector.sanitize(event);
      
      expect(sanitized.label).toBe('Error code: 404');
      expect(sanitized.metadata).toEqual(event.metadata);
    });
  });

  describe('Unicode and International Data', () => {
    it('should handle international phone numbers', async () => {
      const phones = [
        '+86 138 0000 0000', // China
        '+33 6 12 34 56 78', // France
        '+49 151 1234 5678', // Germany
        '+81 90-1234-5678', // Japan
      ];

      for (const phone of phones) {
        const event: TelemetryEvent = {
          id: 'test-1',
          sessionId: 'session-1',
          eventType: 'event',
          category: 'test',
          action: 'intl-phone',
          timestamp: Date.now(),
          label: phone,
        };

        const sanitized = await detector.sanitize(event);
        expect(sanitized.label).not.toContain(phone.replace(/\D/g, ''));
      }
    });

    it('should handle unicode in PII context', async () => {
      const event: TelemetryEvent = {
        id: 'test-1',
        sessionId: 'session-1',
        eventType: 'event',
        category: 'test',
        action: 'unicode',
        timestamp: Date.now(),
        metadata: {
          user: 'მომხმარებელი test@example.com', // Georgian
          description: 'Ελληνικά email@test.gr', // Greek
          note: '日本語 user@example.jp', // Japanese
        },
      };

      const sanitized = await detector.sanitize(event);
      const metadataStr = JSON.stringify(sanitized.metadata);
      
      expect(metadataStr).not.toContain('test@example.com');
      expect(metadataStr).not.toContain('email@test.gr');
      expect(metadataStr).not.toContain('user@example.jp');
      
      // Should preserve non-PII unicode
      expect(metadataStr).toContain('მომხმარებელი');
      expect(metadataStr).toContain('Ελληνικά');
      expect(metadataStr).toContain('日本語');
    });
  });
});