import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OrchestratorSandbox } from '../../../src/sandbox/orchestrator-sandbox';
import type { SandboxOptions } from '../../../src/sandbox/orchestrator-sandbox';

// Mock Dagger client
const mockContainer = {
  from: vi.fn().mockReturnThis(),
  withExec: vi.fn().mockReturnThis(),
  withMountedCache: vi.fn().mockReturnThis(),
  withEnvVariable: vi.fn().mockReturnThis(),
  withWorkdir: vi.fn().mockReturnThis(),
  withDirectory: vi.fn().mockReturnThis(),
  stdout: vi.fn().mockResolvedValue('mocked output'),
  sync: vi.fn().mockResolvedValue('mocked sync')
};

const mockDirectory = {};

const mockClient = {
  container: vi.fn().mockReturnValue(mockContainer),
  directory: vi.fn().mockReturnValue(mockDirectory),
  cacheVolume: vi.fn().mockReturnValue('mocked-volume'),
  host: vi.fn().mockReturnValue({
    directory: vi.fn().mockReturnValue(mockDirectory)
  }),
};

// Mock the Dagger connect and close functions
vi.mock('@dagger.io/dagger', () => ({
  connect: vi.fn(),
  close: vi.fn()
}));

// Mock storage classes
vi.mock('../../../src/storage/json-state-store', () => ({
  JSONStateStore: vi.fn().mockImplementation(() => ({
    saveState: vi.fn().mockResolvedValue(undefined),
    loadState: vi.fn().mockResolvedValue(null),
    deleteState: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock('../../../src/storage/jsonl-event-store', () => ({
  JSONLEventStore: vi.fn().mockImplementation(() => ({
    appendEvent: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined)
  }))
}));

describe('OrchestratorSandbox', () => {
  let sandbox: OrchestratorSandbox;
  const mockOptions: SandboxOptions = {
    sessionId: 'test-session-123',
    volumes: {
      workspace: 'test-workspace',
      gitCache: 'test-git-cache',
      state: 'test-state',
      agentCache: 'test-agent-cache'
    }
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    
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
    
    sandbox = new OrchestratorSandbox(mockOptions);
  });

  afterEach(async () => {
    if (sandbox.isInitialized) {
      await sandbox.cleanup();
    }
  });

  describe('constructor', () => {
    it('should create a sandbox instance with correct options', () => {
      expect(sandbox.sessionInfo.sessionId).toBe('test-session-123');
      expect(sandbox.sessionInfo.volumes).toEqual(mockOptions.volumes);
      expect(sandbox.isInitialized).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize sandbox without repository', async () => {
      await sandbox.initialize();

      expect(sandbox.isInitialized).toBe(true);
      expect(mockClient.container).toHaveBeenCalled();
      expect(mockClient.cacheVolume).toHaveBeenCalledTimes(4); // workspace, git, state, agent
      expect(mockContainer.from).toHaveBeenCalledWith('vibekit-sandbox:latest');
      expect(mockContainer.withMountedCache).toHaveBeenCalledTimes(4);
    });

    it('should initialize sandbox with repository', async () => {
      const repoUrl = 'https://github.com/test/repo.git';
      await sandbox.initialize(repoUrl);

      expect(sandbox.isInitialized).toBe(true);
      expect(mockContainer.withExec).toHaveBeenCalled(); // For git operations
    });

    it('should throw error when already initialized', async () => {
      await sandbox.initialize();
      
      await expect(sandbox.initialize()).rejects.toThrow('Sandbox already initialized');
    });

    it('should handle initialization errors', async () => {
      mockClient.container.mockImplementationOnce(() => {
        throw new Error('Docker connection failed');
      });

      await expect(sandbox.initialize()).rejects.toThrow('Failed to initialize sandbox: Docker connection failed');
    });
  });

  describe('createWorktree', () => {
    beforeEach(async () => {
      await sandbox.initialize();
    });

    it('should create worktree successfully', async () => {
      const taskId = 'task-123';
      const expectedPath = `/workspace/tasks/${taskId}`;

      const worktreePath = await sandbox.createWorktree(taskId);

      expect(worktreePath).toBe(expectedPath);
      expect(mockContainer.withExec).toHaveBeenCalledWith([
        "sh", "-c",
        `cd /workspace/main && git worktree add ${expectedPath} -b task/${taskId} main`
      ]);
    });

    it('should create worktree with custom base branch', async () => {
      const taskId = 'task-456';
      const baseBranch = 'develop';
      const expectedPath = `/workspace/tasks/${taskId}`;

      const worktreePath = await sandbox.createWorktree(taskId, baseBranch);

      expect(worktreePath).toBe(expectedPath);
      expect(mockContainer.withExec).toHaveBeenCalledWith([
        "sh", "-c",
        `cd /workspace/main && git worktree add ${expectedPath} -b task/${taskId} ${baseBranch}`
      ]);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedSandbox = new OrchestratorSandbox(mockOptions);
      
      await expect(uninitializedSandbox.createWorktree('task-123')).rejects.toThrow('Sandbox not initialized');
    });

    it('should handle worktree creation errors', async () => {
      mockContainer.withExec.mockImplementationOnce(() => {
        throw new Error('Git worktree failed');
      });

      await expect(sandbox.createWorktree('task-123')).rejects.toThrow('Failed to create worktree for task task-123: Git worktree failed');
    });
  });

  describe('withTaskContainer', () => {
    beforeEach(async () => {
      await sandbox.initialize();
    });

    it('should create task-specific container and execute callback', async () => {
      const taskId = 'task-789';
      const worktreePath = '/workspace/tasks/task-789';
      const mockCallback = vi.fn().mockResolvedValue('callback-result');

      const result = await sandbox.withTaskContainer(taskId, worktreePath, mockCallback);

      expect(result).toBe('callback-result');
      const { connect } = await vi.importMock<typeof import('@dagger.io/dagger')>('@dagger.io/dagger');
      expect(connect).toHaveBeenCalled();
      expect(mockClient.container).toHaveBeenCalled();
      expect(mockContainer.withDirectory).toHaveBeenCalledWith("/code", mockDirectory);
      expect(mockContainer.withEnvVariable).toHaveBeenCalledWith("TASK_ID", taskId);
      expect(mockContainer.withEnvVariable).toHaveBeenCalledWith("SESSION_ID", mockOptions.sessionId);
      expect(mockCallback).toHaveBeenCalledWith(mockContainer);
    });

    it('should throw error when not initialized', async () => {
      const uninitializedSandbox = new OrchestratorSandbox(mockOptions);
      
      await expect(uninitializedSandbox.withTaskContainer('task-123', '/path', vi.fn()))
        .rejects.toThrow('Sandbox not initialized');
    });
  });

  describe('executeCommand', () => {
    beforeEach(async () => {
      await sandbox.initialize();
    });

    it('should execute command successfully', async () => {
      const taskId = 'task-123';
      const worktreePath = '/workspace/tasks/task-123';
      const command = ['echo', 'hello'];
      const expectedOutput = 'hello\n';
      mockContainer.stdout.mockResolvedValueOnce(expectedOutput);

      const result = await sandbox.executeCommand(taskId, worktreePath, command);

      expect(result).toBe(expectedOutput);
      const { connect } = await vi.importMock<typeof import('@dagger.io/dagger')>('@dagger.io/dagger');
      expect(connect).toHaveBeenCalled();
      expect(mockContainer.withExec).toHaveBeenCalledWith(command);
      expect(mockContainer.stdout).toHaveBeenCalled();
    });

    it('should handle command execution errors', async () => {
      const taskId = 'task-123';
      const worktreePath = '/workspace/tasks/task-123';
      const command = ['invalid-command'];
      mockContainer.withExec.mockImplementationOnce(() => {
        throw new Error('Command not found');
      });
      
      await expect(sandbox.executeCommand(taskId, worktreePath, command)).rejects.toThrow('Command not found');
    });
  });

  describe('cleanup', () => {
    it('should cleanup resources', async () => {
      await sandbox.initialize();
      
      await sandbox.cleanup();

      expect(sandbox.isInitialized).toBe(false);
      const { close } = await vi.importMock<typeof import('@dagger.io/dagger')>('@dagger.io/dagger');
      expect(close).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      await sandbox.initialize();
      const { close } = await vi.importMock<typeof import('@dagger.io/dagger')>('@dagger.io/dagger');
      close.mockImplementationOnce(() => {
        throw new Error('Close failed');
      });

      // Should not throw, just log error
      await expect(sandbox.cleanup()).resolves.toBeUndefined();
      expect(sandbox.isInitialized).toBe(false);
    });

    it('should handle cleanup when not initialized', async () => {
      // Should not throw even when not initialized
      await expect(sandbox.cleanup()).resolves.toBeUndefined();
    });
  });
});