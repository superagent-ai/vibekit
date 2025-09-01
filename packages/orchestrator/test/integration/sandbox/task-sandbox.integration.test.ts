import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';
import { TaskSandbox } from '../../../src/sandbox/task-sandbox';
import type { Task } from '../../../src/types/task';
import { DockerTestHelpers } from '../docker-test-helpers';

describe('TaskSandbox Integration Tests (Real Docker)', () => {
  let taskSandbox: TaskSandbox;
  let sessionId: string;
  let taskId: string;
  let worktreePath: string;

  const mockTask: Task = {
    id: 'integration-task-123',
    title: 'Integration Test Task',
    description: 'A test task for Docker integration testing',
    priority: 'medium',
    status: 'pending',
    fileScope: ['*.ts', '*.js']
  };

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

    sessionId = DockerTestHelpers.generateTestSessionId('task-sandbox');
    taskId = `task-${Date.now()}`;
    worktreePath = '/tmp'; // Use temp directory since we don't have real git repo

    taskSandbox = new TaskSandbox(sessionId, taskId, worktreePath);
  });

  afterEach(async () => {
    // Clean up any remaining test resources
    if (sessionId) {
      await DockerTestHelpers.cleanup(sessionId);
    }
  });

  describe('Agent Initialization with VibeKit Image', () => {
    it('should initialize with default agent type using VibeKit image', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      // Measure initialization time
      const { duration } = await DockerTestHelpers.measureTime(async () => {
        await taskSandbox.initializeForAgent();
      });

      console.log(`✅ Task sandbox initialized in ${duration}ms`);
      
      // Should be fast with VibeKit image (no package installation)
      expect(duration).toBeLessThan(10000);
    }, 15000);

    it('should initialize with custom agent type using same VibeKit image', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      // Test that different agent types all use the same optimized image
      const agentTypes = ['python-agent', 'node-agent', 'code-agent', 'review-agent'];
      
      for (const agentType of agentTypes) {
        const testTaskSandbox = new TaskSandbox(
          `${sessionId}-${agentType}`, 
          `${taskId}-${agentType}`, 
          worktreePath
        );

        const { duration } = await DockerTestHelpers.measureTime(async () => {
          await testTaskSandbox.initializeForAgent(agentType);
        });

        console.log(`✅ Agent ${agentType} initialized in ${duration}ms`);
        
        // All agent types should be fast with the same VibeKit image
        expect(duration).toBeLessThan(10000);
      }
    }, 30000);
  });

  describe('Task Execution with Real Containers', () => {
    beforeEach(async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        return;
      }

      await taskSandbox.initializeForAgent();
    });

    it('should execute task operations in VibeKit container', async () => {
      // Skip if Docker is not available  
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      // This test simulates task execution but won't commit since there's no real git repo
      const { result, duration } = await DockerTestHelpers.measureTime(async () => {
        return await taskSandbox.executeTask(mockTask);
      });

      console.log(`✅ Task execution completed in ${duration}ms`);
      console.log('📄 Task result:', {
        success: result.success,
        outputLength: result.output.length,
        artifactsFiles: result.artifacts.files.length,
        artifactsCommits: result.artifacts.commits.length
      });

      // Task should complete (may succeed or fail due to no git repo, but shouldn't crash)
      expect(result).toBeDefined();
      expect(result.artifacts).toBeDefined();
      expect(result.artifacts.files).toBeInstanceOf(Array);
      expect(result.artifacts.commits).toBeInstanceOf(Array);
      
      // Should be reasonably fast
      expect(duration).toBeLessThan(30000);
    }, 45000);

    it('should handle working directory operations', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      const { result: workDir, duration } = await DockerTestHelpers.measureTime(async () => {
        return await taskSandbox.getWorkingDirectory();
      });

      console.log(`✅ Working directory query completed in ${duration}ms: ${workDir.trim()}`);
      
      // Should return the mounted working directory
      expect(workDir.trim()).toBe('/code');
      expect(duration).toBeLessThan(5000);
    }, 10000);

    it('should list files in container', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      const { result: files, duration } = await DockerTestHelpers.measureTime(async () => {
        return await taskSandbox.listFiles('*');
      });

      console.log(`✅ File listing completed in ${duration}ms, found ${files.length} files`);
      
      // Should return an array (may be empty in temp directory)
      expect(Array.isArray(files)).toBe(true);
      expect(duration).toBeLessThan(5000);
    }, 10000);
  });

  describe('VibeKit Tools Verification', () => {
    beforeEach(async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        return;
      }

      await taskSandbox.initializeForAgent();
    });

    it('should have all required development tools in VibeKit image', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      // Test that VibeKit image contains all the tools we expect
      const toolChecks = [
        { name: 'Node.js', command: 'node --version' },
        { name: 'Python', command: 'python3 --version' },
        { name: 'Git', command: 'git --version' },
        { name: 'Curl', command: 'curl --version' },
        { name: 'Basic shell tools', command: 'which ls pwd echo' },
      ];

      for (const tool of toolChecks) {
        try {
          // Use withDaggerClient to execute commands in the container
          const output = await (taskSandbox as any).withDaggerClient(async (client) => {
            const container = (taskSandbox as any).createTaskContainer(client, 'task-agent');
            return await container
              .withExec(['sh', '-c', tool.command])
              .stdout();
          });

          console.log(`✅ ${tool.name}: ${output.split('\n')[0]}`);
          expect(output.trim().length).toBeGreaterThan(0);
        } catch (error) {
          console.error(`❌ ${tool.name} not available:`, error);
          throw new Error(`Required tool ${tool.name} not available in VibeKit image`);
        }
      }
    }, 20000);

    it('should verify VibeKit environment variables are set', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      // Check that environment variables are properly set in the container
      const output = await (taskSandbox as any).withDaggerClient(async (client) => {
        const container = (taskSandbox as any).createTaskContainer(client, 'task-agent');
        return await container
          .withExec(['sh', '-c', 'echo "TASK_ID=$TASK_ID" && echo "SESSION_ID=$SESSION_ID" && echo "AGENT_TYPE=$AGENT_TYPE" && echo "VIBEKIT_SANDBOX_ACTIVE=$VIBEKIT_SANDBOX_ACTIVE"'])
          .stdout();
      });

      console.log('✅ Container environment:', output);
      
      expect(output).toContain(`TASK_ID=${taskId}`);
      expect(output).toContain(`SESSION_ID=${sessionId}`);
      expect(output).toContain('AGENT_TYPE=task-agent');
      expect(output).toContain('VIBEKIT_SANDBOX_ACTIVE=1');
    }, 15000);
  });

  describe('Performance Benchmarking', () => {
    it('should demonstrate container startup speed with VibeKit image', async () => {
      // Skip if Docker is not available
      if (!await DockerTestHelpers.isDockerAvailable() || !await DockerTestHelpers.isVibeKitImageAvailable()) {
        console.log('⚠️  Skipping test - Docker or VibeKit image not available');
        return;
      }

      // Test multiple container initializations to measure consistency
      const initTimes = [];
      
      for (let i = 0; i < 3; i++) {
        const testTaskSandbox = new TaskSandbox(
          `${sessionId}-perf-${i}`,
          `perf-task-${i}`,
          worktreePath
        );

        const { duration } = await DockerTestHelpers.measureTime(async () => {
          await testTaskSandbox.initializeForAgent();
        });

        initTimes.push(duration);
        console.log(`✅ Initialization ${i}: ${duration}ms`);
      }

      const avgTime = initTimes.reduce((a, b) => a + b, 0) / initTimes.length;
      const maxTime = Math.max(...initTimes);
      
      console.log(`📊 Container Initialization Performance:`);
      console.log(`   Average: ${avgTime.toFixed(0)}ms`);
      console.log(`   Maximum: ${maxTime.toFixed(0)}ms`);
      console.log(`   All times: [${initTimes.map(t => t.toFixed(0)).join(', ')}]ms`);

      // All initializations should be fast with VibeKit image
      expect(maxTime).toBeLessThan(15000);
      expect(avgTime).toBeLessThan(10000);
      
      // Compare to old approach: Ubuntu + package installation would take 2+ minutes (120,000ms)
      const oldApproachTime = 120000;
      const improvementFactor = oldApproachTime / avgTime;
      
      console.log(`🚀 Performance improvement: ~${improvementFactor.toFixed(0)}x faster than Ubuntu + package installation`);
      expect(improvementFactor).toBeGreaterThan(10); // At least 10x improvement
    }, 60000);
  });
});