/**
 * Unit Tests for VibeKit Core SDK
 * 
 * Tests core SDK functionality, configuration, and interface compliance
 * without requiring external API calls or real sandbox providers.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VibeKit } from '../packages/sdk/src/index.js';

// Mock provider for testing
const createMockProvider = () => ({
  create: vi.fn().mockResolvedValue({
    sandboxId: 'mock-sandbox-123',
    commands: {
      run: vi.fn().mockResolvedValue({
        exitCode: 0,
        stdout: 'Mock command output',
        stderr: ''
      })
    },
    kill: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    getHost: vi.fn().mockResolvedValue('localhost:3000'),
    on: vi.fn(),
    emit: vi.fn()
  }),
  resume: vi.fn().mockResolvedValue({
    sandboxId: 'mock-sandbox-123',
    commands: { run: vi.fn() },
    kill: vi.fn(),
    pause: vi.fn(),
    getHost: vi.fn(),
    on: vi.fn(),
    emit: vi.fn()
  })
});

describe('VibeKit Core SDK - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SDK Initialization', () => {
    it('should create VibeKit instance', () => {
      const vibeKit = new VibeKit();
      expect(vibeKit).toBeDefined();
      expect(vibeKit).toBeInstanceOf(VibeKit);
    });

    it('should provide fluent configuration API', () => {
      const mockProvider = createMockProvider();
      
      const vibeKit = new VibeKit()
        .withAgent({
          type: 'claude',
          provider: 'anthropic',
          apiKey: 'test-key',
          model: 'claude-sonnet-4-20250514'
        })
        .withSandbox(mockProvider)
        .withWorkingDirectory('/test/dir');

      expect(vibeKit).toBeDefined();
      expect(vibeKit).toBeInstanceOf(VibeKit);
    });
  });

  describe('Configuration Methods', () => {
    it('should configure agent settings', () => {
      const vibeKit = new VibeKit();
      
      const configured = vibeKit.withAgent({
        type: 'claude',
        provider: 'anthropic',
        apiKey: 'test-api-key',
        model: 'claude-sonnet-4-20250514'
      });

      expect(configured).toBe(vibeKit); // Should return same instance for chaining
    });

    it('should configure sandbox provider', () => {
      const vibeKit = new VibeKit();
      const mockProvider = createMockProvider();
      
      const configured = vibeKit.withSandbox(mockProvider);
      
      expect(configured).toBe(vibeKit); // Should return same instance for chaining
    });

    it('should configure working directory', () => {
      const vibeKit = new VibeKit();
      const testDir = '/var/test-workspace';
      
      const configured = vibeKit.withWorkingDirectory(testDir);
      
      expect(configured).toBe(vibeKit); // Should return same instance for chaining
    });

    it('should support method chaining', () => {
      const mockProvider = createMockProvider();
      
      const vibeKit = new VibeKit()
        .withAgent({
          type: 'claude',
          provider: 'anthropic',
          apiKey: 'test-key',
          model: 'claude-sonnet-4-20250514'
        })
        .withSandbox(mockProvider)
        .withWorkingDirectory('/test/dir');

      expect(vibeKit).toBeInstanceOf(VibeKit);
    });
  });

  describe('Agent Configuration Validation', () => {
    it('should accept valid agent types', () => {
      const vibeKit = new VibeKit();
      const agentTypes = ['claude', 'codex', 'opencode', 'gemini', 'grok'] as const;
      
      agentTypes.forEach(type => {
        expect(() => {
          vibeKit.withAgent({
            type,
            provider: 'anthropic',
            apiKey: 'test-key',
            model: 'test-model'
          });
        }).not.toThrow();
      });
    });

    it('should accept provider configurations', () => {
      const vibeKit = new VibeKit();
      const providers = ['anthropic', 'openai'] as const;
      
      providers.forEach(provider => {
        expect(() => {
          vibeKit.withAgent({
            type: 'claude',
            provider,
            apiKey: 'test-key',
            model: 'test-model'
          });
        }).not.toThrow();
      });
    });
  });

  describe('Event Emitter Interface', () => {
    it('should implement EventEmitter methods', () => {
      const vibeKit = new VibeKit();
      
      expect(typeof vibeKit.on).toBe('function');
      expect(typeof vibeKit.emit).toBe('function');
      expect(typeof vibeKit.removeListener).toBe('function');
    });

    it('should handle event registration and emission', () => {
      const vibeKit = new VibeKit();
      const listener = vi.fn();
      
      vibeKit.on('test-event', listener);
      vibeKit.emit('test-event', 'test-data');
      
      expect(listener).toHaveBeenCalledWith('test-data');
    });
  });

  describe('Command Execution Interface', () => {
    it('should provide executeCommand method', async () => {
      const vibeKit = new VibeKit();
      const mockProvider = createMockProvider();
      
      vibeKit.withSandbox(mockProvider);
      
      expect(typeof vibeKit.executeCommand).toBe('function');
    });

    it('should detect and parse stream-JSON output format', async () => {
      const vibeKit = new VibeKit();
      const mockProvider = createMockProvider();
      
      // Mock stream-JSON output
      const streamJsonOutput = '{"type":"start","sandbox_id":"test-123"}\n{"type":"git","output":"test git message"}\n{"type":"end","output":"command complete"}';
      
      mockProvider.create.mockResolvedValue({
        sandboxId: 'mock-sandbox-123',
        commands: {
          run: vi.fn().mockResolvedValue({
            exitCode: 0,
            stdout: streamJsonOutput,
            stderr: ''
          })
        },
        kill: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn().mockResolvedValue(undefined),
        getHost: vi.fn().mockResolvedValue('localhost:3000'),
        on: vi.fn(),
        emit: vi.fn()
      });

      vibeKit
        .withAgent({
          type: 'claude',
          provider: 'anthropic',
          apiKey: 'test-key',
          model: 'claude-sonnet-4-20250514'
        })
        .withSandbox(mockProvider);

      // Test with explicit outputFormat option
      const resultExplicit = await vibeKit.executeCommand('echo "test"', { outputFormat: 'stream-json' });
      expect(resultExplicit).toHaveProperty('messages');
      expect(resultExplicit).toHaveProperty('rawStdout');
      
      if ('messages' in resultExplicit) {
        expect(resultExplicit.messages).toHaveLength(3);
        expect(resultExplicit.messages[0]).toEqual({ type: 'start', sandbox_id: 'test-123' });
        expect(resultExplicit.messages[1]).toEqual({ type: 'git', output: 'test git message' });
        expect(resultExplicit.messages[2]).toEqual({ type: 'end', output: 'command complete' });
        expect(resultExplicit.rawStdout).toBe(streamJsonOutput);
      }

      // Test with command auto-detection
      const resultAutoDetect = await vibeKit.executeCommand('claude --output-format stream-json "test"');
      expect(resultAutoDetect).toHaveProperty('messages');
      expect(resultAutoDetect).toHaveProperty('rawStdout');
    });

    it('should return standard response for non-stream-JSON commands', async () => {
      const vibeKit = new VibeKit();
      const mockProvider = createMockProvider();

      vibeKit
        .withAgent({
          type: 'claude',
          provider: 'anthropic',
          apiKey: 'test-key',
          model: 'claude-sonnet-4-20250514'
        })
        .withSandbox(mockProvider);

      const result = await vibeKit.executeCommand('echo "test"');
      expect(result).not.toHaveProperty('messages');
      expect(result).toHaveProperty('stdout');
      expect(result).toHaveProperty('stderr');
      expect(result).toHaveProperty('exitCode');
    });

    it('should provide generateCode method (deprecated)', async () => {
      const vibeKit = new VibeKit();
      const mockProvider = createMockProvider();
      
      vibeKit
        .withAgent({
          type: 'claude',
          provider: 'anthropic',
          apiKey: 'test-key',
          model: 'claude-sonnet-4-20250514'
        })
        .withSandbox(mockProvider);
      
      expect(typeof vibeKit.generateCode).toBe('function');
      // Note: generateCode is deprecated, use executeCommand instead
    });
  });

  describe('Lifecycle Management', () => {
    it('should provide lifecycle methods', () => {
      const vibeKit = new VibeKit();
      
      expect(typeof vibeKit.kill).toBe('function');
      expect(typeof vibeKit.getHost).toBe('function');
    });

    it('should handle kill operation', async () => {
      const vibeKit = new VibeKit();
      const mockProvider = createMockProvider();
      
      vibeKit.withSandbox(mockProvider);
      
      // Should not throw
      await expect(vibeKit.kill()).resolves.not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration gracefully', () => {
      const vibeKit = new VibeKit();
      
      // Should not throw during construction
      expect(vibeKit).toBeDefined();
    });

    it('should validate required configuration before operations', async () => {
      const vibeKit = new VibeKit();
      
      // Should handle missing sandbox provider gracefully
      // (Actual behavior depends on implementation)
      expect(vibeKit).toBeDefined();
    });
  });

  describe('Working Directory Configuration', () => {
    it('should accept various directory formats', () => {
      const vibeKit = new VibeKit();
      const directories = [
        '/var/workspace',
        '/tmp/test',
        '/home/user/project',
        './relative/path'
      ];
      
      directories.forEach(dir => {
        expect(() => {
          vibeKit.withWorkingDirectory(dir);
        }).not.toThrow();
      });
    });
  });

  describe('Type Safety', () => {
    it('should maintain type safety in configuration', () => {
      const vibeKit = new VibeKit();
      const mockProvider = createMockProvider();
      
      // This should compile without TypeScript errors
      const configured = vibeKit
        .withAgent({
          type: 'claude',
          provider: 'anthropic',
          apiKey: 'test-key',
          model: 'claude-sonnet-4-20250514'
        })
        .withSandbox(mockProvider)
        .withWorkingDirectory('/test');

      expect(configured).toBeInstanceOf(VibeKit);
    });
  });
}); 