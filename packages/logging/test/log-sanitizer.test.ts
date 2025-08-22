import { describe, it, expect } from 'vitest';
import { 
  sanitizeLogData,
  sanitizeMessage,
  sanitizeString,
  sanitizeObject,
  type SanitizeOptions
} from '../src/log-sanitizer';

describe('Log Sanitizer', () => {
  describe('sanitizeString', () => {
    it('should sanitize API keys', () => {
      const input = 'API key: sk-ant-1234567890abcdef';
      const result = sanitizeString(input);
      expect(result).toBe('API key: [REDACTED]');
    });

    it('should sanitize OpenAI API keys', () => {
      const input = 'OpenAI key: sk-abcdef1234567890abcdef1234567890';
      const result = sanitizeString(input);
      expect(result).toBe('OpenAI key: [REDACTED]');
    });

    it('should sanitize Groq API keys', () => {
      const input = 'Groq key: gsk_abcdef1234567890';
      const result = sanitizeString(input);
      expect(result).toBe('Groq key: [REDACTED]');
    });

    it('should sanitize Google API keys', () => {
      const input = 'Google key: AIzaAbCdEf1234567890123456789012345';
      const result = sanitizeString(input);
      expect(result).toBe('Google key: [REDACTED]');
    });

    it('should sanitize GitHub tokens', () => {
      const input = 'GitHub token: ghp_1234567890abcdef1234567890abcdef12';
      const result = sanitizeString(input);
      expect(result).toBe('GitHub token: [REDACTED]');
    });

    it('should sanitize bearer tokens', () => {
      const input = 'Authorization: Bearer abc123def456';
      const result = sanitizeString(input);
      expect(result).toBe('Authorization: [REDACTED]');
    });

    it('should sanitize passwords', () => {
      const input = 'password="secretpassword123"';
      const result = sanitizeString(input);
      expect(result).toBe('[REDACTED]');
    });

    it('should sanitize database URIs', () => {
      const input = 'mongodb://user:pass@localhost:27017/db';
      const result = sanitizeString(input);
      expect(result).toBe('[REDACTED]');
    });

    it('should preserve length when requested', () => {
      const input = 'sk-ant-1234567890abcdef';
      const result = sanitizeString(input, { preserveLength: true });
      expect(result.length).toBe(input.length);
      expect(result).toBe('*'.repeat(input.length));
    });

    it('should truncate long strings', () => {
      const input = 'a'.repeat(1500);
      const result = sanitizeString(input, { maxStringLength: 1000 });
      expect(result).toContain('[TRUNCATED]');
      expect(result.length).toBeLessThan(input.length);
    });

    it('should respect redactEmails option', () => {
      const input = 'Contact: user@example.com';
      
      const withRedaction = sanitizeString(input, { redactEmails: true });
      expect(withRedaction).toBe('Contact: [REDACTED]');
      
      const withoutRedaction = sanitizeString(input, { redactEmails: false });
      expect(withoutRedaction).toBe('Contact: user@example.com');
    });

    it('should respect redactIPs option', () => {
      const input = 'Server: 192.168.1.1';
      
      const withRedaction = sanitizeString(input, { redactIPs: true });
      expect(withRedaction).toBe('Server: [REDACTED]');
      
      const withoutRedaction = sanitizeString(input, { redactIPs: false });
      expect(withoutRedaction).toBe('Server: 192.168.1.1');
    });

    it('should use custom placeholder', () => {
      const input = 'API key: sk-ant-1234567890abcdef';
      const result = sanitizeString(input, { placeholder: '[HIDDEN]' });
      expect(result).toBe('API key: [HIDDEN]');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize sensitive field names', () => {
      const input = {
        username: 'user',
        password: 'secret123',
        apiKey: 'sk-ant-123',
        data: 'normal data'
      };
      
      const result = sanitizeObject(input);
      
      expect(result.username).toBe('user');
      expect(result.password).toBe('[REDACTED]');
      expect(result.apiKey).toBe('[REDACTED]');
      expect(result.data).toBe('normal data');
    });

    it('should sanitize nested objects', () => {
      const input = {
        config: {
          auth: {
            token: 'secret-token',
            user: 'username'
          }
        }
      };
      
      const result = sanitizeObject(input);
      
      expect(result.config.auth.token).toBe('[REDACTED]');
      expect(result.config.auth.user).toBe('username');
    });

    it('should handle arrays', () => {
      const input = {
        items: [
          { name: 'item1', secret: 'secret1' },
          { name: 'item2', secret: 'secret2' }
        ]
      };
      
      const result = sanitizeObject(input);
      
      expect(result.items[0].name).toBe('item1');
      expect(result.items[0].secret).toBe('[REDACTED]');
      expect(result.items[1].name).toBe('item2');
      expect(result.items[1].secret).toBe('[REDACTED]');
    });

    it('should handle Error objects', () => {
      const error = new Error('Test error with sk-ant-123456789');
      const result = sanitizeObject(error);
      
      expect(result.name).toBe('Error');
      expect(result.message).toBe('Test error with [REDACTED]');
      expect(result.stack).toBeDefined();
    });

    it('should handle primitive values', () => {
      expect(sanitizeObject('string')).toBe('string');
      expect(sanitizeObject(123)).toBe(123);
      expect(sanitizeObject(true)).toBe(true);
      expect(sanitizeObject(null)).toBe(null);
      expect(sanitizeObject(undefined)).toBe(undefined);
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01');
      const result = sanitizeObject(date);
      expect(result).toBe(date);
    });

    it('should prevent infinite recursion', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      const result = sanitizeObject(circular);
      // Should not throw and should handle deep nesting
      expect(result.name).toBe('test');
    });

    it('should handle very deep objects', () => {
      let deep: any = { level: 0 };
      for (let i = 1; i <= 15; i++) {
        deep = { level: i, nested: deep };
      }
      
      const result = sanitizeObject(deep);
      // Should handle max depth gracefully
      expect(result).toBeDefined();
    });
  });

  describe('sanitizeLogData', () => {
    it('should handle complex mixed data', () => {
      const input = {
        message: 'User logged in with token sk-ant-123456789',
        user: {
          id: 'user123',
          email: 'user@example.com',
          password: 'secret123'
        },
        metadata: {
          ip: '192.168.1.1',
          timestamp: new Date(),
          config: {
            apiKey: 'sk-openai-abcdef123456',
            debug: true
          }
        }
      };
      
      const result = sanitizeLogData(input);
      
      expect(result.message).toBe('User logged in with token [REDACTED]');
      expect(result.user.id).toBe('user123');
      expect(result.user.email).toBe('user@example.com'); // emails not redacted by default
      expect(result.user.password).toBe('[REDACTED]');
      expect(result.metadata.ip).toBe('192.168.1.1'); // IPs not redacted by default
      expect(result.metadata.config.apiKey).toBe('[REDACTED]');
      expect(result.metadata.config.debug).toBe(true);
    });

    it('should handle errors gracefully', () => {
      // Create an object that might cause issues during sanitization
      const problematic = Object.create(null);
      problematic.toString = () => { throw new Error('toString failed'); };
      
      const result = sanitizeLogData(problematic);
      
      expect(result._sanitization_error).toBe('Failed to sanitize log data');
      expect(result._original_type).toBe('object');
    });

    it('should use provided options', () => {
      const input = {
        email: 'user@example.com',
        ip: '192.168.1.1',
        message: 'long message ' + 'a'.repeat(1000)
      };
      
      const options: SanitizeOptions = {
        redactEmails: true,
        redactIPs: true,
        maxStringLength: 50,
        placeholder: '[HIDDEN]'
      };
      
      const result = sanitizeLogData(input, options);
      
      expect(result.email).toBe('[HIDDEN]');
      expect(result.ip).toBe('[HIDDEN]');
      expect(result.message).toContain('[TRUNCATED]');
    });
  });

  describe('sanitizeMessage', () => {
    it('should be an alias for sanitizeString', () => {
      const input = 'Message with sk-ant-123456789';
      expect(sanitizeMessage(input)).toBe(sanitizeString(input));
    });

    it('should accept options', () => {
      const input = 'Message with sk-ant-123456789';
      const options = { placeholder: '[CUSTOM]' };
      expect(sanitizeMessage(input, options)).toBe('Message with [CUSTOM]');
    });
  });

  describe('edge cases', () => {
    it('should handle empty strings', () => {
      expect(sanitizeString('')).toBe('');
      expect(sanitizeObject('')).toBe('');
    });

    it('should handle empty objects', () => {
      expect(sanitizeObject({})).toEqual({});
    });

    it('should handle empty arrays', () => {
      expect(sanitizeObject([])).toEqual([]);
    });

    it('should handle functions', () => {
      const fn = () => 'test';
      const result = sanitizeObject(fn);
      expect(typeof result).toBe('string');
    });

    it('should handle symbols', () => {
      const sym = Symbol('test');
      const result = sanitizeObject(sym);
      expect(typeof result).toBe('string');
    });
  });
});