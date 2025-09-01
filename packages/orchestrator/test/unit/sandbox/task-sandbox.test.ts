import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskSandbox } from '../../../src/sandbox/task-sandbox';
import type { Task } from '../../../src/types/task';

// Mock Dagger container
const mockContainer = {
  from: vi.fn().mockReturnThis(),
  withExec: vi.fn().mockReturnThis(),
  withDirectory: vi.fn().mockReturnThis(),
  withWorkdir: vi.fn().mockReturnThis(),
  withEnvVariable: vi.fn().mockReturnThis(),
  stdout: vi.fn().mockResolvedValue('mocked output'),
  sync: vi.fn().mockResolvedValue('mocked sync')
};

const mockClient = {
  container: vi.fn().mockReturnValue(mockContainer),
  host: vi.fn().mockReturnValue({
    directory: vi.fn().mockReturnValue({})
  })
};

// Mock Dagger imports
vi.mock('@dagger.io/dagger', () => ({
  connect: vi.fn(),
  close: vi.fn()
}));

// Mock storage classes
vi.mock('../../../src/storage/jsonl-event-store', () => ({
  JSONLEventStore: vi.fn().mockImplementation(() => ({
    appendEvent: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('TaskSandbox', () => {
  let taskSandbox: TaskSandbox;
  const sessionId = 'test-session-123';
  const taskId = 'task-456';
  const worktreePath = '/workspace/tasks/task-456';

  const mockTask: Task = {
    id: taskId,
    title: 'Test Task',
    description: 'A test task for unit testing',
    priority: 'medium',
    status: 'pending',
    fileScope: ['src/**/*.ts', 'tests/**/*.ts']
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Reset specific mock implementations
    mockContainer.stdout.mockReset();
    mockContainer.stdout.mockResolvedValue('mocked output');
    
    // Setup mock connect to call callback with mock client
    const { connect } = await vi.importMock<typeof import('@dagger.io/dagger')>('@dagger.io/dagger');
    connect.mockImplementation((callback: any) => {
      // Mock the promise-based API that dagger uses
      const promise = new Promise(async (resolve, reject) => {
        try {
          await callback(mockClient);
          resolve(undefined);
        } catch (error) {
          reject(error);
        }
      });
      return promise;
    });
    
    taskSandbox = new TaskSandbox(sessionId, taskId, worktreePath);
  });

  describe('initializeForAgent', () => {
    it('should initialize with default agent type', async () => {
      await taskSandbox.initializeForAgent();

      const { connect } = await vi.importMock<typeof import('@dagger.io/dagger')>('@dagger.io/dagger');
      expect(connect).toHaveBeenCalled();
      expect(mockClient.container).toHaveBeenCalled();
      expect(mockContainer.from).toHaveBeenCalledWith('vibekit-sandbox:latest');
      expect(mockContainer.withDirectory).toHaveBeenCalledWith("/code", {});
      expect(mockContainer.withWorkdir).toHaveBeenCalledWith("/code");
      expect(mockContainer.withEnvVariable).toHaveBeenCalledWith("TASK_ID", taskId);
      expect(mockContainer.withEnvVariable).toHaveBeenCalledWith("SESSION_ID", sessionId);
      expect(mockContainer.withEnvVariable).toHaveBeenCalledWith("AGENT_TYPE", 'task-agent');
      expect(mockContainer.sync).toHaveBeenCalled();
    });

    it('should initialize with custom agent type', async () => {
      const agentType = 'python-agent';
      await taskSandbox.initializeForAgent(agentType);

      const { connect } = await vi.importMock<typeof import('@dagger.io/dagger')>('@dagger.io/dagger');
      expect(connect).toHaveBeenCalled();
      expect(mockContainer.from).toHaveBeenCalledWith('vibekit-sandbox:latest');
      expect(mockContainer.withEnvVariable).toHaveBeenCalledWith("AGENT_TYPE", agentType);
      expect(mockContainer.sync).toHaveBeenCalled();
    });

    it('should throw error when already initialized', async () => {
      await taskSandbox.initializeForAgent();
      
      await expect(taskSandbox.initializeForAgent()).rejects.toThrow('Task sandbox already initialized');
    });

    it('should handle initialization errors', async () => {
      const { connect } = await vi.importMock<typeof import('@dagger.io/dagger')>('@dagger.io/dagger');
      connect.mockImplementationOnce(async (callback: any) => {
        const errorClient = {
          ...mockClient,
          container: vi.fn(() => {
            throw new Error('Container creation failed');
          })
        };
        await callback(errorClient);
      });

      await expect(taskSandbox.initializeForAgent()).rejects.toThrow('Failed to initialize task sandbox: Container creation failed');
    });
  });

  describe('executeTask', () => {
    beforeEach(async () => {
      await taskSandbox.initializeForAgent();
    });

    it('should execute task successfully', async () => {
      // Mock the command outputs
      mockContainer.stdout
        .mockResolvedValueOnce('Analysis complete') // Analysis
        .mockResolvedValueOnce('') // Git status before
        .mockResolvedValueOnce('File created successfully') // Task execution
        .mockResolvedValueOnce('M  TASK_task-456.md\n') // Git status after (has changes)
        .mockResolvedValueOnce('abc123def456') // Commit hash
        .mockResolvedValueOnce('./TASK_task-456.md'); // Modified files (with ./ prefix)

      const result = await taskSandbox.executeTask(mockTask);

      expect(result.success).toBe(true);
      expect(result.output).toContain('Analysis complete');
      expect(result.output).toContain('File created successfully');
      expect(result.artifacts.commits).toEqual(['abc123def456']);
      expect(result.artifacts.files).toEqual(['./TASK_task-456.md']);
    });

    it('should handle task with no changes', async () => {
      // Mock the command outputs with no changes
      mockContainer.stdout
        .mockResolvedValueOnce('Analysis complete') // Analysis
        .mockResolvedValueOnce('') // Git status before
        .mockResolvedValueOnce('No changes needed') // Task execution
        .mockResolvedValueOnce('') // Git status after (no changes)
        .mockResolvedValueOnce(''); // No modified files

      const result = await taskSandbox.executeTask(mockTask);

      expect(result.success).toBe(true);
      expect(result.artifacts.commits).toEqual([]);
      expect(result.artifacts.files).toEqual([]);
    });

    it('should handle task execution errors', async () => {
      mockContainer.withExec.mockImplementationOnce(() => {
        throw new Error('Command execution failed');
      });

      const result = await taskSandbox.executeTask(mockTask);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command execution failed');
      expect(result.artifacts.commits).toEqual([]);
      expect(result.artifacts.files).toEqual([]);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedSandbox = new TaskSandbox(sessionId, taskId, worktreePath);
      
      await expect(uninitializedSandbox.executeTask(mockTask)).rejects.toThrow('Task sandbox not initialized');
    });
  });

  describe('commitChanges', () => {
    beforeEach(async () => {
      await taskSandbox.initializeForAgent();
    });

    it('should commit changes successfully', async () => {
      const commitMessage = 'Test commit message';
      const expectedHash = 'abc123def456';
      
      mockContainer.stdout
        .mockResolvedValueOnce('M  file1.txt\nA  file2.txt\n') // Git status (has changes)
        .mockResolvedValueOnce(expectedHash); // Commit hash

      const commitHash = await taskSandbox.commitChanges(commitMessage);

      expect(commitHash).toBe(expectedHash);
      expect(mockContainer.withExec).toHaveBeenCalledWith(['git', 'add', '.']);
      expect(mockContainer.withExec).toHaveBeenCalledWith(['git', 'commit', '-m', commitMessage]);
      expect(mockContainer.withExec).toHaveBeenCalledWith(['git', 'rev-parse', 'HEAD']);
    });

    it('should throw error when no changes to commit', async () => {
      mockContainer.stdout.mockResolvedValueOnce(''); // Empty git status

      await expect(taskSandbox.commitChanges('Test commit')).rejects.toThrow('No changes to commit');
    });

    it('should handle commit errors', async () => {
      mockContainer.stdout.mockResolvedValueOnce('M  file1.txt\n'); // Has changes
      mockContainer.withExec.mockImplementationOnce(() => {
        throw new Error('Git commit failed');
      });

      await expect(taskSandbox.commitChanges('Test commit')).rejects.toThrow('Failed to commit changes: Git commit failed');
    });
  });

  describe('getWorkingDirectory', () => {
    beforeEach(async () => {
      await taskSandbox.initializeForAgent();
    });

    it('should return working directory', async () => {
      const expectedPath = '/code';
      mockContainer.stdout.mockResolvedValueOnce(expectedPath);

      const workingDir = await taskSandbox.getWorkingDirectory();

      expect(workingDir).toBe(expectedPath);
      expect(mockContainer.withExec).toHaveBeenCalledWith(['pwd']);
    });
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      await taskSandbox.initializeForAgent();
    });

    it('should list files with default pattern', async () => {
      mockContainer.stdout.mockResolvedValueOnce('./file1.txt\n./file2.js\n./src/file3.ts\n');

      const files = await taskSandbox.listFiles();

      expect(files).toEqual(['file1.txt', 'file2.js', 'src/file3.ts']);
      expect(mockContainer.withExec).toHaveBeenCalledWith(['find', '.', '-name', '*', '-type', 'f']);
    });

    it('should list files with custom pattern', async () => {
      mockContainer.stdout.mockResolvedValueOnce('./src/file1.ts\n./src/file2.ts\n');

      const files = await taskSandbox.listFiles('*.ts');

      expect(files).toEqual(['src/file1.ts', 'src/file2.ts']);
      expect(mockContainer.withExec).toHaveBeenCalledWith(['find', '.', '-name', '*.ts', '-type', 'f']);
    });

    it('should return empty array when no files found', async () => {
      mockContainer.stdout.mockResolvedValueOnce('');

      const files = await taskSandbox.listFiles();

      expect(files).toEqual([]);
    });

    it('should handle find command errors', async () => {
      mockContainer.withExec.mockImplementationOnce(() => {
        throw new Error('Find command failed');
      });

      const files = await taskSandbox.listFiles();

      expect(files).toEqual([]);
    });
  });

  describe('agent image consistency', () => {
    it('should use VibeKit image for all agent types', async () => {
      // All agent types now use the same optimized VibeKit image
      const agentTypes = ['task-agent', 'code-agent', 'python-agent', 'review-agent', 'unknown-agent'];

      for (const agentType of agentTypes) {
        vi.clearAllMocks();
        // Reset mock connect for each test
        const { connect } = await vi.importMock<typeof import('@dagger.io/dagger')>('@dagger.io/dagger');
        connect.mockImplementation((callback: any) => {
          // Mock the promise-based API that dagger uses
          const promise = new Promise(async (resolve, reject) => {
            try {
              await callback(mockClient);
              resolve(undefined);
            } catch (error) {
              reject(error);
            }
          });
          return promise;
        });
        
        const sandbox = new TaskSandbox(sessionId, `task-${agentType}`, worktreePath);
        
        await sandbox.initializeForAgent(agentType);
        
        // All agents should use the same optimized VibeKit image
        expect(mockContainer.from).toHaveBeenCalledWith('vibekit-sandbox:latest');
      }
    });
  });
});