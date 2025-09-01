import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { OrchestratorSandbox } from '../../../src/sandbox/orchestrator-sandbox';
import type { SandboxOptions } from '../../../src/sandbox/orchestrator-sandbox';
import { DockerTestHelpers } from '../docker-test-helpers';

describe('OrchestratorSandbox Integration Tests (Real Docker)', () => {
  let sandbox: OrchestratorSandbox;
  let sessionId: string;
  let testOptions: SandboxOptions;

  beforeAll(async () => {
    // Skip if Docker is not available
    if (!await DockerTestHelpers.isDockerAvailable()) {
      console.log('⚠️  Docker not available, skipping integration tests');
      return;
    }

    // Check if VibeKit image is available
    if (!await DockerTestHelpers.isVibeKitImageAvailable()) {
      console.log('⚠️  VibeKit image not available, skipping integration tests');
      return;
    }
  });

  beforeEach(async () => {
    // Skip if Docker is not available
    if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
      return;
    }

    sessionId = DockerTestHelpers.generateTestSessionId('orchestrator');
    testOptions = {
      sessionId,
      volumes: {
        workspace: `${sessionId}-workspace`,
        gitCache: `${sessionId}-git-cache`, 
        state: `${sessionId}-state`,
        agentCache: `${sessionId}-agent-cache`
      }
    };

    sandbox = new OrchestratorSandbox(testOptions);
  });

  afterEach(async () => {
    if (sandbox?.isInitialized) {
      try {
        await sandbox.cleanup();
      } catch (error) {
        console.warn('⚠️  Error during sandbox cleanup:', error);
      }
    }

    // Clean up any remaining test resources
    if (sessionId) {
      await DockerTestHelpers.cleanup(sessionId);
    }
  });

  describe('Real Docker Container Creation', () => {
    it('should initialize sandbox and create actual Docker containers', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      expect(sandbox.isInitialized).toBe(false);

      // Measure initialization time
      const { duration: initDuration } = await DockerTestHelpers.measureTime(async () => {
        await sandbox.initialize();
      });

      expect(sandbox.isInitialized).toBe(true);
      console.log(`✅ Sandbox initialized in ${initDuration}ms`);

      // Initialization with VibeKit image should be fast (under 10 seconds)
      expect(initDuration).toBeLessThan(10000);
    }, 15000); // 15 second timeout

    it('should create worktree with real Docker operations', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      await sandbox.initialize();
      
      const taskId = 'test-task-123';
      
      // This will fail because we don't have a real git repository
      // But we can test that it attempts to create containers
      try {
        await sandbox.createWorktree(taskId);
      } catch (error) {
        // Expected to fail due to no git repository
        // But Dagger connection should work
        expect(error.message).not.toContain('connect');
        expect(error.message).not.toContain('Docker');
      }
    }, 20000);

    it('should create task containers with VibeKit image', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      await sandbox.initialize();
      
      const taskId = 'container-test-456';
      const worktreePath = '/tmp'; // Use temp directory for testing
      
      // Test container creation and command execution
      const { duration } = await DockerTestHelpers.measureTime(async () => {
        return await sandbox.withTaskContainer(taskId, worktreePath, async (container) => {
          // Execute a simple command to verify VibeKit image works
          const output = await container
            .withExec(['sh', '-c', 'echo "Container test successful" && node --version'])
            .stdout();
          
          expect(output).toContain('Container test successful');
          expect(output).toContain('v'); // Node version should start with 'v'
          
          return output;
        });
      });
      
      console.log(`✅ Task container executed in ${duration}ms`);
      
      // VibeKit image should execute quickly
      expect(duration).toBeLessThan(10000);
    }, 20000);

    it('should execute commands in optimized containers', async () => {
      // Skip if Docker is not available  
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      await sandbox.initialize();
      
      const taskId = 'command-test-789';
      const worktreePath = '/tmp';
      
      const { result, duration } = await DockerTestHelpers.measureTime(async () => {
        return await sandbox.executeCommand(taskId, worktreePath, [
          'sh', '-c', 'echo "Testing VibeKit tools:" && node --version && python3 --version && git --version'
        ]);
      });
      
      // Verify VibeKit image has all required tools
      expect(result).toContain('Testing VibeKit tools:');
      expect(result).toContain('v'); // Node version
      expect(result).toContain('Python'); // Python version  
      expect(result).toContain('git version'); // Git version
      
      console.log(`✅ Command executed in ${duration}ms`);
      console.log('📄 Tool versions:', result.replace(/\n/g, ' | '));
      
      // Should be fast with pre-installed tools
      expect(duration).toBeLessThan(10000);
    }, 25000);
  });

  describe('Performance Optimization Validation', () => {
    it('should demonstrate VibeKit image speed advantage', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');  
        return;
      }

      await sandbox.initialize();
      
      const taskId = 'perf-test-001';
      const worktreePath = '/tmp';
      
      // Test multiple container operations to measure consistency
      const operations = [];
      
      for (let i = 0; i < 3; i++) {
        const { duration } = await DockerTestHelpers.measureTime(async () => {
          return await sandbox.withTaskContainer(`${taskId}-${i}`, worktreePath, async (container) => {
            return await container
              .withExec(['echo', `Operation ${i} completed`])
              .stdout();
          });
        });
        
        operations.push(duration);
        console.log(`✅ Operation ${i}: ${duration}ms`);
      }
      
      const avgDuration = operations.reduce((a, b) => a + b, 0) / operations.length;
      const maxDuration = Math.max(...operations);
      
      console.log(`📊 Performance Summary:`);
      console.log(`   Average: ${avgDuration.toFixed(0)}ms`);
      console.log(`   Maximum: ${maxDuration.toFixed(0)}ms`);
      
      // All operations should be fast with VibeKit image
      expect(maxDuration).toBeLessThan(10000);
      expect(avgDuration).toBeLessThan(5000);
    }, 60000);
  });

  describe('Cleanup and Resource Management', () => {
    it('should properly cleanup containers and resources', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      await sandbox.initialize();
      
      // Get container count before operations
      const containersBefore = await DockerTestHelpers.getRunningContainers();
      
      // Perform some operations
      await sandbox.withTaskContainer('cleanup-test', '/tmp', async (container) => {
        return await container
          .withExec(['echo', 'cleanup test'])
          .stdout();
      });
      
      // Cleanup
      await sandbox.cleanup();
      
      // Wait a moment for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check that no additional containers are running
      const containersAfter = await DockerTestHelpers.getRunningContainers();
      
      // Should not have more containers than we started with
      expect(containersAfter.length).toBeLessThanOrEqual(containersBefore.length);
      
      // Sandbox should be marked as not initialized
      expect(sandbox.isInitialized).toBe(false);
    }, 30000);
  });
});