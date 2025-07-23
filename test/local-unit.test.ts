/**
 * Unit Tests for Local Dagger Sandbox Provider
 * 
 * Fast unit tests that verify interface compliance, configuration handling,
 * and basic functionality using mocked dependencies. These tests should run
 * quickly without requiring Docker or external dependencies.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createLocalProvider, LocalSandboxProvider } from '@vibe-kit/local';

describe('Local Dagger Sandbox Provider - Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Provider Creation', () => {
    it('should create a local dagger provider instance', () => {
      const provider = createLocalProvider({});

      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(LocalSandboxProvider);
      expect(typeof provider.create).toBe('function');
      expect(typeof provider.resume).toBe('function');
    });

    it('should accept configuration options', () => {
      const config = {
        githubToken: 'test-token',
        preferRegistryImages: true
      };
      
      const provider = createLocalProvider(config);
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(LocalSandboxProvider);
    });

    it('should create provider with empty config', () => {
      const provider = createLocalProvider();
      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(LocalSandboxProvider);
    });
  });

  describe('Provider Interface Compliance', () => {
    it('should implement SandboxProvider interface', () => {
      const provider = createLocalProvider({});

      // Check required methods exist
      expect(typeof provider.create).toBe('function');
      expect(typeof provider.resume).toBe('function');
    });

    it('should return sandbox instances with correct interface', async () => {
      const provider = createLocalProvider({});
      
      // Note: This test uses mocked Dagger calls from test/setup.ts
      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^dagger-/);
      
      // Check SandboxInstance interface compliance
      expect(typeof sandbox.commands.run).toBe('function');
      expect(typeof sandbox.kill).toBe('function');
      expect(typeof sandbox.pause).toBe('function');
      expect(typeof sandbox.getHost).toBe('function');
      expect(typeof sandbox.on).toBe('function');
      expect(typeof sandbox.emit).toBe('function');
    });
  });

  describe('Configuration Validation', () => {
    it('should handle agent type configuration', async () => {
      const provider = createLocalProvider({});
      
      const agentTypes = ['claude', 'codex', 'opencode', 'gemini'] as const;
      
      for (const agentType of agentTypes) {
        const sandbox = await provider.create({}, agentType);
        expect(sandbox).toBeDefined();
        expect(sandbox.sandboxId).toContain(agentType);
      }
    });

    it('should handle environment variables parameter', async () => {
      const provider = createLocalProvider({});
      const envVars = {
        TEST_VAR: 'test-value',
        NODE_ENV: 'test'
      };
      
      const sandbox = await provider.create(envVars);
      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^dagger-/);
    });

    it('should handle working directory parameter', async () => {
      const provider = createLocalProvider({});
      const workingDir = '/custom/work/dir';
      
      const sandbox = await provider.create({}, 'claude', workingDir);
      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^dagger-claude-/);
    });

    it('should handle optional parameters', async () => {
      const provider = createLocalProvider({});
      
      // Test with minimal parameters
      const sandbox1 = await provider.create();
      expect(sandbox1).toBeDefined();
      
      // Test with all parameters
      const sandbox2 = await provider.create({NODE_ENV: 'test'}, 'codex', '/workdir');
      expect(sandbox2).toBeDefined();
    });
  });

  describe('Sandbox ID Generation', () => {
    it('should generate unique sandbox IDs', async () => {
      const provider = createLocalProvider({});
      
      const sandbox1 = await provider.create();
      // Add small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1));
      const sandbox2 = await provider.create();
      
      expect(sandbox1.sandboxId).not.toBe(sandbox2.sandboxId);
      expect(sandbox1.sandboxId).toMatch(/^dagger-default-/);
      expect(sandbox2.sandboxId).toMatch(/^dagger-default-/);
    });

    it('should include agent type in sandbox ID', async () => {
      const provider = createLocalProvider({});
      
      const claudeSandbox = await provider.create({}, 'claude');
      const codexSandbox = await provider.create({}, 'codex');
      
      expect(claudeSandbox.sandboxId).toContain('claude');
      expect(codexSandbox.sandboxId).toContain('codex');
      expect(claudeSandbox.sandboxId).not.toBe(codexSandbox.sandboxId);
    });

    it('should use default agent type when none specified', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^dagger-default-/);
    });
  });

  describe('Lifecycle Management Interface', () => {
    it('should provide sandbox lifecycle methods', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();
      
      // Test lifecycle methods exist and can be called without throwing
      expect(typeof sandbox.kill).toBe('function');
      expect(typeof sandbox.pause).toBe('function');
      
      await sandbox.pause();
      await sandbox.kill();
    });

    it('should provide port mapping functionality', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();
      
      expect(typeof sandbox.getHost).toBe('function');
      const host = await sandbox.getHost(3000);
      expect(typeof host).toBe('string');
      expect(host).toBe('localhost'); // Mocked response
    });
  });

  describe('Event Emitter Interface', () => {
    it('should implement EventEmitter interface', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();
      
      expect(typeof sandbox.on).toBe('function');
      expect(typeof sandbox.emit).toBe('function');
      
      // Test event handling
      const listener = vi.fn();
      sandbox.on('test-event', listener);
      
      const emitted = sandbox.emit('test-event', 'test-data');
      expect(emitted).toBe(true);
      expect(listener).toHaveBeenCalledWith('test-data');
    });

    it('should support multiple event listeners', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();
      
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      
      sandbox.on('multi-event', listener1);
      sandbox.on('multi-event', listener2);
      
      sandbox.emit('multi-event', 'data');
      
      expect(listener1).toHaveBeenCalledWith('data');
      expect(listener2).toHaveBeenCalledWith('data');
    });
  });

  describe('Resume Functionality', () => {
    it('should handle resume operation', async () => {
      const provider = createLocalProvider({});
      const sandboxId = 'test-sandbox-id';
      
      // Resume should work (currently returns a new instance with mocked implementation)
      const resumedSandbox = await provider.resume(sandboxId);
      expect(resumedSandbox).toBeDefined();
      expect(resumedSandbox.sandboxId).toBeDefined();
    });

    it('should resume with proper interface', async () => {
      const provider = createLocalProvider({});
      const resumedSandbox = await provider.resume('test-id');
      
      // Verify interface compliance
      expect(typeof resumedSandbox.commands.run).toBe('function');
      expect(typeof resumedSandbox.kill).toBe('function');
      expect(typeof resumedSandbox.pause).toBe('function');
      expect(typeof resumedSandbox.getHost).toBe('function');
    });
  });

  describe('Error Handling with Mocks', () => {
    it('should handle provider creation with invalid config gracefully', () => {
      // Provider should still be created even with potentially invalid config
      // since validation happens during sandbox creation
      const provider = createLocalProvider({ invalidOption: 'invalid' } as any);
      expect(provider).toBeDefined();
    });

    it('should handle sandbox creation with invalid parameters', async () => {
      const provider = createLocalProvider({});
      
      // Should not throw with unusual but not invalid parameters
      const sandbox = await provider.create(
        { WEIRD_VAR: '' }, 
        'claude' as any, 
        ''
      );
      expect(sandbox).toBeDefined();
    });
  });
}); 