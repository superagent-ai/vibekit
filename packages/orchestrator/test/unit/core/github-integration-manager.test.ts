/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitHubIntegrationManager, GitHubConfig, TaskIssueMapping } from '../../../src/core/github-integration-manager';
import { JSONStateStore } from '../../../src/storage/json-state-store';
import { JSONLEventStore } from '../../../src/storage/jsonl-event-store';
import { Task } from '../../../src/providers/base';

// Mock the storage classes
vi.mock('../../../src/storage/json-state-store');
vi.mock('../../../src/storage/jsonl-event-store');

describe('GitHubIntegrationManager', () => {
  let manager: GitHubIntegrationManager;
  let mockStateStore: vi.Mocked<JSONStateStore>;
  let mockEventStore: vi.Mocked<JSONLEventStore>;
  let mockConfig: GitHubConfig;
  let mockTask: Task;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Create mock instances
    mockStateStore = new JSONStateStore() as any;
    mockEventStore = new JSONLEventStore() as any;

    // Setup mock config
    mockConfig = {
      repository: 'test-owner/test-repo',
      token: 'test-token',
      defaultBranch: 'main',
      labels: {
        taskPending: 'status: pending',
        taskInProgress: 'status: in-progress',
        taskCompleted: 'status: completed',
        taskFailed: 'status: failed',
        priority: {
          high: 'priority: high',
          medium: 'priority: medium',
          low: 'priority: low'
        }
      },
      autoAssign: ['test-user'],
      milestoneMapping: {}
    };

    // Setup mock task
    mockTask = {
      id: 'task-123',
      title: 'Test Task',
      description: 'Test task description',
      status: 'pending',
      priority: 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      details: 'Detailed requirements',
      testStrategy: 'Unit and integration tests',
      fileScope: ['src/components/test.ts'],
      dependencies: ['task-456'],
      subtasks: [{
        title: 'Subtask 1',
        status: 'pending'
      }],
      estimatedHours: 4
    };

    // Create manager instance
    manager = new GitHubIntegrationManager(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();

      await manager.initialize();

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-integration', 
        expect.objectContaining({
          type: 'github.integration.initialized',
          data: { repository: 'test-owner/test-repo' }
        })
      );
    });

    it('should load existing mappings on initialization', async () => {
      const mockMappings = [{
        taskId: 'task-123',
        issueNumber: 456,
        issueId: 789,
        repository: 'test-owner/test-repo',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        syncStatus: 'synced' as const
      }];

      mockStateStore.loadState.mockResolvedValue({ mappings: mockMappings });
      mockEventStore.appendEvent.mockResolvedValue();

      await manager.initialize();

      const allMappings = await manager.getAllMappings();
      expect(allMappings).toEqual(mockMappings);
    });
  });

  describe('createIssueFromTask', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await manager.initialize();
    });

    it('should create a new GitHub issue for task', async () => {
      mockStateStore.saveState.mockResolvedValue();
      
      const result = await manager.createIssueFromTask(mockTask, 'session-123');

      expect(result).toMatchObject({
        title: 'Test Task',
        body: expect.stringContaining('Test task description'),
        state: 'open'
      });

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-integration',
        expect.objectContaining({
          type: 'github.issue.created',
          data: expect.objectContaining({
            taskId: 'task-123',
            sessionId: 'session-123'
          })
        })
      );
    });

    it('should return existing issue if mapping already exists', async () => {
      // Setup existing mapping
      const existingMapping: TaskIssueMapping = {
        taskId: 'task-123',
        issueNumber: 456,
        issueId: 789,
        repository: 'test-owner/test-repo',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        syncStatus: 'synced'
      };

      // Mock the private method by accessing through any
      (manager as any).mappings.set('task-123', existingMapping);

      const result = await manager.createIssueFromTask(mockTask);

      expect(result.number).toBe(456);
      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-integration',
        expect.objectContaining({
          type: 'github.issue.existing_found'
        })
      );
    });

    it('should generate proper issue body from task', async () => {
      mockStateStore.saveState.mockResolvedValue();
      
      const result = await manager.createIssueFromTask(mockTask);

      expect(result.body).toContain('## Description');
      expect(result.body).toContain('Test task description');
      expect(result.body).toContain('## Details');
      expect(result.body).toContain('Detailed requirements');
      expect(result.body).toContain('## Test Strategy');
      expect(result.body).toContain('Unit and integration tests');
      expect(result.body).toContain('## File Scope');
      expect(result.body).toContain('src/components/test.ts');
      expect(result.body).toContain('## Dependencies');
      expect(result.body).toContain('Task task-456');
      expect(result.body).toContain('## Subtasks');
      expect(result.body).toContain('Subtask 1 (pending)');
      expect(result.body).toContain('## Estimated Hours');
      expect(result.body).toContain('4 hours');
      expect(result.body).toContain('*Generated by VibeKit Orchestrator*');
    });

    it('should apply correct labels based on task status and priority', async () => {
      mockStateStore.saveState.mockResolvedValue();
      
      const result = await manager.createIssueFromTask(mockTask);

      const labelNames = result.labels.map((label: any) => label.name);
      expect(labelNames).toContain('status: pending');
      expect(labelNames).toContain('priority: medium');
    });
  });

  describe('updateIssueFromTask', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await manager.initialize();
    });

    it('should update existing GitHub issue', async () => {
      // Setup existing mapping
      const mapping: TaskIssueMapping = {
        taskId: 'task-123',
        issueNumber: 456,
        issueId: 789,
        repository: 'test-owner/test-repo',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        syncStatus: 'synced'
      };

      (manager as any).mappings.set('task-123', mapping);
      mockStateStore.saveState.mockResolvedValue();

      const updatedTask = { ...mockTask, status: 'completed' as const };
      const result = await manager.updateIssueFromTask(updatedTask);

      expect(result?.state).toBe('closed');
      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-integration',
        expect.objectContaining({
          type: 'github.issue.updated',
          data: expect.objectContaining({
            taskId: 'task-123',
            issueNumber: 456
          })
        })
      );
    });

    it('should throw error if no mapping exists', async () => {
      await expect(manager.updateIssueFromTask(mockTask)).rejects.toThrow(
        'No GitHub issue found for task task-123'
      );
    });
  });

  describe('syncTaskStatusToIssue', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await manager.initialize();
    });

    it('should sync task status to GitHub issue', async () => {
      const mapping: TaskIssueMapping = {
        taskId: 'task-123',
        issueNumber: 456,
        issueId: 789,
        repository: 'test-owner/test-repo',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        syncStatus: 'synced'
      };

      (manager as any).mappings.set('task-123', mapping);
      mockStateStore.saveState.mockResolvedValue();

      const completedTask = { ...mockTask, status: 'completed' as const };
      await manager.syncTaskStatusToIssue(completedTask);

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-integration',
        expect.objectContaining({
          type: 'github.sync.task_to_issue',
          data: expect.objectContaining({
            taskId: 'task-123',
            issueNumber: 456,
            newStatus: 'completed',
            newState: 'closed'
          })
        })
      );
    });

    it('should handle sync errors gracefully', async () => {
      const mapping: TaskIssueMapping = {
        taskId: 'task-123',
        issueNumber: 456,
        issueId: 789,
        repository: 'test-owner/test-repo',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        syncStatus: 'synced'
      };

      (manager as any).mappings.set('task-123', mapping);

      // Mock GitHub API error
      const mockError = new Error('GitHub API error');
      vi.spyOn(manager as any, 'updateGitHubIssue').mockRejectedValue(mockError);

      mockStateStore.saveState.mockResolvedValue();

      await expect(manager.syncTaskStatusToIssue(mockTask)).rejects.toThrow('GitHub API error');

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-integration',
        expect.objectContaining({
          type: 'github.sync.failed',
          data: expect.objectContaining({
            error: 'GitHub API error'
          })
        })
      );
    });
  });

  describe('linkTaskToIssue', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await manager.initialize();
    });

    it('should link existing task to existing GitHub issue', async () => {
      mockStateStore.saveState.mockResolvedValue();

      await manager.linkTaskToIssue('task-123', 456);

      expect(mockStateStore.saveState).toHaveBeenCalledWith(
        'github-mappings/task-123',
        expect.objectContaining({
          taskId: 'task-123',
          issueNumber: 456,
          syncStatus: 'synced'
        })
      );

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-integration',
        expect.objectContaining({
          type: 'github.issue.linked',
          data: expect.objectContaining({
            taskId: 'task-123',
            issueNumber: 456
          })
        })
      );
    });

    it('should throw error if GitHub issue does not exist', async () => {
      // Mock getIssue to return null
      vi.spyOn(manager as any, 'getIssue').mockResolvedValue(null);

      await expect(manager.linkTaskToIssue('task-123', 999)).rejects.toThrow(
        'GitHub issue #999 not found'
      );
    });
  });

  describe('utility methods', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await manager.initialize();
    });

    it('should generate issue reference for PR descriptions', () => {
      const mapping: TaskIssueMapping = {
        taskId: 'task-123',
        issueNumber: 456,
        issueId: 789,
        repository: 'test-owner/test-repo',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        syncStatus: 'synced'
      };

      (manager as any).mappings.set('task-123', mapping);

      const reference = manager.getIssueReference('task-123');
      expect(reference).toBe('#456');

      const nonExistentReference = manager.getIssueReference('non-existent');
      expect(nonExistentReference).toBeNull();
    });

    it('should generate issue closing syntax for PR descriptions', () => {
      const mapping: TaskIssueMapping = {
        taskId: 'task-123',
        issueNumber: 456,
        issueId: 789,
        repository: 'test-owner/test-repo',
        createdAt: '2023-01-01T00:00:00Z',
        updatedAt: '2023-01-01T00:00:00Z',
        syncStatus: 'synced'
      };

      (manager as any).mappings.set('task-123', mapping);

      const closingSyntax = manager.getIssueClosingSyntax('task-123');
      expect(closingSyntax).toBe('Closes #456');

      const nonExistentSyntax = manager.getIssueClosingSyntax('non-existent');
      expect(nonExistentSyntax).toBeNull();
    });
  });

  describe('label and color management', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await manager.initialize();
    });

    it('should return correct colors for task status', () => {
      const getColorForStatus = (manager as any).getColorForStatus;
      
      expect(getColorForStatus('pending')).toBe('fbca04');
      expect(getColorForStatus('in_progress')).toBe('0052cc');
      expect(getColorForStatus('completed')).toBe('0e8a16');
      expect(getColorForStatus('failed')).toBe('d73a49');
    });

    it('should return correct colors for task priority', () => {
      const getColorForPriority = (manager as any).getColorForPriority;
      
      expect(getColorForPriority('high')).toBe('d73a49');
      expect(getColorForPriority('medium')).toBe('fbca04');
      expect(getColorForPriority('low')).toBe('0e8a16');
    });

    it('should convert task status to GitHub issue state', () => {
      const getIssueStateForTask = (manager as any).getIssueStateForTask;
      
      expect(getIssueStateForTask({ status: 'pending' })).toBe('open');
      expect(getIssueStateForTask({ status: 'in_progress' })).toBe('open');
      expect(getIssueStateForTask({ status: 'completed' })).toBe('closed');
      expect(getIssueStateForTask({ status: 'failed' })).toBe('open');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await manager.initialize();
    });

    it('should handle storage errors during initialization', async () => {
      const storageError = new Error('Storage unavailable');
      mockStateStore.loadState.mockRejectedValue(storageError);
      
      // Should not throw, but handle gracefully
      await expect(manager.initialize()).resolves.not.toThrow();
    });

    it('should handle event logging errors gracefully', async () => {
      mockEventStore.appendEvent.mockRejectedValue(new Error('Event store error'));
      mockStateStore.saveState.mockResolvedValue();
      
      // Should still complete successfully
      const result = await manager.createIssueFromTask(mockTask);
      expect(result).toBeDefined();
    });
  });
});