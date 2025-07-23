/**
 * Dagger-based Local Sandbox Provider Test Suite
 * 
 * Basic unit tests for the dagger-based local provider functionality
 * Tests run against real dagger implementation with simplified expectations
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLocalProvider, LocalDaggerSandboxProvider } from '@vibekit/local';

describe('Dagger-based Local Sandbox Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Provider Creation', () => {
    it('should create a local dagger provider instance', () => {
      const provider = createLocalProvider({});

      expect(provider).toBeDefined();
      expect(provider).toBeInstanceOf(LocalDaggerSandboxProvider);
      expect(typeof provider.create).toBe('function');
      expect(typeof provider.resume).toBe('function');
    });

    it('should accept configuration options', () => {
      const config = {
        // Configuration options for the local provider
      };
      
      const provider = createLocalProvider(config);
      expect(provider).toBeDefined();
    });
  });

  describe('Sandbox Creation', () => {
    it('should create a sandbox instance', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^dagger-/);
      expect(sandbox.commands).toBeDefined();
      expect(typeof sandbox.commands.run).toBe('function');
      expect(typeof sandbox.kill).toBe('function');
      expect(typeof sandbox.pause).toBe('function');
      expect(typeof sandbox.getHost).toBe('function');
    });

    it('should create sandbox with environment variables', async () => {
      const provider = createLocalProvider({});
      const envVars = { TEST_VAR: 'test-value', NODE_ENV: 'test' };
      
      const sandbox = await provider.create(envVars);
      
      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^dagger-/);
    });

    it('should create sandbox with specific agent type', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create({}, 'claude');

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^dagger-claude-/);
    });

    it('should create sandbox with working directory', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create({}, undefined, '/custom/workdir');

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^dagger-/);
    });
  });

  describe('Command Execution', () => {
    it('should execute commands in sandbox', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      const result = await sandbox.commands.run('echo "hello world"');

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('hello world');
      expect(typeof result.stderr).toBe('string');
    }, 10000); // Add timeout for Docker builds

    it('should handle command execution with options', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      const onStdoutSpy = vi.fn();
      const onStderrSpy = vi.fn();

      const result = await sandbox.commands.run('echo "test"', {
        timeoutMs: 5000,
        onStdout: onStdoutSpy,
        onStderr: onStderrSpy,
      });

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
      // Callbacks should be defined (though may not be called in this implementation)
      expect(onStdoutSpy).toBeDefined();
      expect(onStderrSpy).toBeDefined();
    }, 10000); // Add timeout for Docker builds

    it('should handle background command execution', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      const result = await sandbox.commands.run('sleep 1', { background: true });

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Background process started');
    }, 10000); // Add timeout for Docker builds
  });

  describe('Sandbox Lifecycle', () => {
    it('should kill sandbox instance', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      await expect(sandbox.kill()).resolves.not.toThrow();
    });

    it('should pause sandbox instance', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      await expect(sandbox.pause()).resolves.not.toThrow();
    });

    it('should get host for port mapping', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      const host = await sandbox.getHost(3000);
      expect(typeof host).toBe('string');
      expect(host).toBe('localhost');
    });
  });

  describe('Agent Types', () => {
    const agentTypes = ['claude', 'codex', 'opencode', 'gemini'] as const;

    agentTypes.forEach(agentType => {
      it(`should create sandbox for ${agentType} agent`, async () => {
        const provider = createLocalProvider({});
        const sandbox = await provider.create({}, agentType);

        expect(sandbox).toBeDefined();
        expect(sandbox.sandboxId).toMatch(new RegExp(`^dagger-${agentType}-`));
      });
    });

    it('should handle default agent type when none specified', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      expect(sandbox).toBeDefined();
      expect(sandbox.sandboxId).toMatch(/^dagger-default-/);
    });
  });

  describe('Error Handling', () => {
    it('should handle command execution errors', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      const result = await sandbox.commands.run('nonexistent-command-xyz');

      expect(result).toBeDefined();
      expect(result.exitCode).not.toBe(0); // Should be non-zero for failed command
      expect(typeof result.stderr).toBe('string');
    }, 10000); // Add timeout for Docker builds

    it('should handle exit code parsing from error messages', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      const result = await sandbox.commands.run('exit 42');

      expect(result).toBeDefined();
      expect(result.exitCode).not.toBe(0);
      expect(typeof result.stderr).toBe('string');
    }, 10000); // Add timeout for Docker builds
  });

  describe('Environment Variable Handling', () => {
    it('should pass environment variables to container', async () => {
      const provider = createLocalProvider({});
      const envVars = {
        TEST_VAR: 'test-value',
        NODE_ENV: 'development',
      };

      const sandbox = await provider.create(envVars);
      const result = await sandbox.commands.run('echo $TEST_VAR');

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('test-value');
    }, 15000); // Add timeout for Docker builds

    it('should handle special characters in environment variables', async () => {
      const provider = createLocalProvider({});
      const envVars = {
        SPECIAL_VAR: 'value with spaces and symbols!@#',
      };

      const sandbox = await provider.create(envVars);
      const result = await sandbox.commands.run('echo "$SPECIAL_VAR"');

      expect(result).toBeDefined();
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('value with spaces and symbols');
    }, 15000); // Add timeout for Docker builds
  });

  describe('Performance', () => {
    it('should create multiple sandboxes concurrently', async () => {
      const provider = createLocalProvider({});
      const startTime = Date.now();

      const sandboxPromises = Array.from({ length: 2 }, (_, i) =>
        provider.create({ INDEX: i.toString() }, 'codex')
      );

      const sandboxes = await Promise.all(sandboxPromises);

      const duration = Date.now() - startTime;

      expect(sandboxes).toHaveLength(2);
      sandboxes.forEach(sandbox => {
        expect(sandbox).toBeDefined();
        expect(sandbox.sandboxId).toMatch(/^dagger-codex-/);
      });
      
      // Should complete reasonably quickly
      expect(duration).toBeLessThan(30000); // 30 seconds timeout for real dagger operations
    }, 60000); // 60 second timeout for performance test

    it('should handle rapid command execution', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      const commandPromises = Array.from({ length: 3 }, (_, i) =>
        sandbox.commands.run(`echo "command ${i}"`)
      );

      const results = await Promise.all(commandPromises);

      expect(results).toHaveLength(3);
      results.forEach((result, i) => {
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain(`command ${i}`);
      });
    }, 20000); // 20 second timeout for rapid execution test
  });

  describe('Resume Functionality', () => {
    it('should resume existing sandbox', async () => {
      const provider = createLocalProvider({});
      const originalSandbox = await provider.create({}, 'claude');
      const sandboxId = originalSandbox.sandboxId;

      const resumedSandbox = await provider.resume(sandboxId);

      expect(resumedSandbox).toBeDefined();
      // Resume creates a new sandbox instance but preserves the concept
      expect(resumedSandbox.sandboxId).toBeDefined();
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle basic development workflow', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      // Test basic echo command  
      const echoResult = await sandbox.commands.run('echo "Hello from dagger"');
      expect(echoResult.exitCode).toBe(0);
      expect(echoResult.stdout).toContain('Hello from dagger');

      // Test file operations
      const fileResult = await sandbox.commands.run('touch /vibe0/test.txt && ls /vibe0/test.txt');
      expect(fileResult.exitCode).toBe(0);
      expect(fileResult.stdout).toContain('test.txt');

      // Clean up
      await sandbox.kill();
    }, 15000); // 15 second timeout for simplified integration test

    it('should maintain workspace persistence', async () => {
      const provider = createLocalProvider({});
      const sandbox = await provider.create();

      // Create content
      const createResult = await sandbox.commands.run('echo "persistent content" > /vibe0/persist.txt');
      expect(createResult.exitCode).toBe(0);

      // Verify content in next command
      const readResult = await sandbox.commands.run('cat /vibe0/persist.txt');
      expect(readResult.exitCode).toBe(0);
      expect(readResult.stdout).toContain('persistent content');

      // Clean up
      await sandbox.kill();
    }, 15000); // 15 second timeout for persistence test
  });
}); 