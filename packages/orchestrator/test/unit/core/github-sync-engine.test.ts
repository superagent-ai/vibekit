/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { 
  GitHubSyncEngine, 
  SyncEvent, 
  SyncRule, 
  SyncStatus, 
  GitHubWebhookEvent,
  SyncEnginePresets 
} from '../../../src/core/github-sync-engine';
import { GitHubIntegrationManager, TaskIssueMapping } from '../../../src/core/github-integration-manager';
import { PRMergeManager } from '../../../src/core/pr-merge-manager';
import { JSONStateStore } from '../../../src/storage/json-state-store';
import { JSONLEventStore } from '../../../src/storage/jsonl-event-store';
import { Task } from '../../../src/providers/base';

// Mock the storage classes
vi.mock('../../../src/storage/json-state-store');
vi.mock('../../../src/storage/jsonl-event-store');

describe('GitHubSyncEngine', () => {
  let syncEngine: GitHubSyncEngine;
  let mockGitHubIntegration: vi.Mocked<GitHubIntegrationManager>;
  let mockPRMergeManager: vi.Mocked<PRMergeManager>;
  let mockStateStore: vi.Mocked<JSONStateStore>;
  let mockEventStore: vi.Mocked<JSONLEventStore>;
  let mockTask: Task;
  let mockMapping: TaskIssueMapping;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Create mock instances
    mockStateStore = new JSONStateStore() as any;
    mockEventStore = new JSONLEventStore() as any;

    mockGitHubIntegration = {
      getMappingForTask: vi.fn(),
      getAllMappings: vi.fn(),
      syncTaskStatusToIssue: vi.fn()
    } as any;

    mockPRMergeManager = {
      attemptAutoMerge: vi.fn()
    } as any;

    // Setup mock task
    mockTask = {
      id: 'task-123',
      title: 'Test Task',
      description: 'Test task description',
      status: 'in_progress',
      priority: 'medium',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Setup mock mapping
    mockMapping = {
      taskId: 'task-123',
      issueNumber: 456,
      issueId: 789,
      repository: 'test-owner/test-repo',
      createdAt: '2023-01-01T00:00:00Z',
      updatedAt: '2023-01-01T00:00:00Z',
      syncStatus: 'synced'
    };

    syncEngine = new GitHubSyncEngine(mockGitHubIntegration, mockPRMergeManager);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize successfully with default sync status', async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();

      await syncEngine.initialize();

      const status = syncEngine.getSyncStatus();
      expect(status.totalSynced).toBe(0);
      expect(status.totalErrors).toBe(0);
      expect(status.pendingSyncs).toEqual([]);

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          type: 'sync.engine.initialized'
        })
      );
    });

    it('should load existing sync status from storage', async () => {
      const storedStatus: SyncStatus = {
        lastSyncTimestamp: '2023-01-01T12:00:00Z',
        totalSynced: 10,
        totalErrors: 2,
        pendingSyncs: ['sync-1', 'sync-2'],
        recentErrors: []
      };

      mockStateStore.loadState.mockImplementation((key) => {
        if (key === 'github-sync-status') return Promise.resolve(storedStatus);
        return Promise.resolve(null);
      });
      mockEventStore.appendEvent.mockResolvedValue();

      await syncEngine.initialize();

      const status = syncEngine.getSyncStatus();
      expect(status).toEqual(storedStatus);
    });

    it('should load pending sync events from storage', async () => {
      const pendingEvents = {
        'sync-1': {
          id: 'sync-1',
          type: 'task_to_github',
          sourceId: 'task-123',
          targetId: '456',
          changes: { status: 'completed' },
          status: 'pending',
          timestamp: '2023-01-01T12:00:00Z'
        } as SyncEvent
      };

      mockStateStore.loadState.mockImplementation((key) => {
        if (key === 'github-sync-queue') return Promise.resolve(pendingEvents);
        return Promise.resolve(null);
      });
      mockEventStore.appendEvent.mockResolvedValue();

      await syncEngine.initialize();

      const status = syncEngine.getSyncStatus();
      expect(status.pendingSyncs).toContain('sync-1');
    });

    it('should start periodic sync on initialization', async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      
      const processPendingSyncsSpy = vi.spyOn(syncEngine, 'processPendingSyncs').mockResolvedValue();

      await syncEngine.initialize();

      // Fast-forward time to trigger periodic sync
      vi.advanceTimersByTime(30000); // Default sync interval

      expect(processPendingSyncsSpy).toHaveBeenCalled();
    });
  });

  describe('onTaskStatusChanged', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await syncEngine.initialize();
    });

    it('should create sync event for task status change', async () => {
      mockGitHubIntegration.getMappingForTask.mockResolvedValue(mockMapping);
      mockEventStore.appendEvent.mockResolvedValue();

      await syncEngine.onTaskStatusChanged(mockTask);

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          type: 'sync.task_to_github.update',
          data: expect.objectContaining({
            taskId: 'task-123',
            issueNumber: 456
          })
        })
      );
    });

    it('should handle missing GitHub issue mapping', async () => {
      mockGitHubIntegration.getMappingForTask.mockResolvedValue(null);

      await syncEngine.onTaskStatusChanged(mockTask);

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          type: 'sync.task_to_github.no_mapping',
          data: expect.objectContaining({
            taskId: 'task-123'
          })
        })
      );
    });

    it('should handle sync errors gracefully', async () => {
      mockGitHubIntegration.getMappingForTask.mockRejectedValue(new Error('Database error'));

      await syncEngine.onTaskStatusChanged(mockTask);

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          type: 'sync.task_to_github.error',
          data: expect.objectContaining({
            taskId: 'task-123',
            error: 'Database error'
          })
        })
      );

      const status = syncEngine.getSyncStatus();
      expect(status.totalErrors).toBe(1);
      expect(status.recentErrors).toHaveLength(1);
    });
  });

  describe('onGitHubWebhookReceived', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await syncEngine.initialize();
    });

    it('should process relevant webhook events', async () => {
      const webhookEvent: GitHubWebhookEvent = {
        action: 'closed',
        number: 456,
        issue: {
          id: 789,
          number: 456,
          title: 'Test Issue',
          body: 'Test body',
          state: 'closed',
          labels: [],
          assignees: [],
          html_url: 'https://github.com/test-owner/test-repo/issues/456',
          created_at: '2023-01-01T00:00:00Z',
          updated_at: '2023-01-01T12:00:00Z'
        },
        repository: {
          full_name: 'test-owner/test-repo'
        },
        sender: {
          login: 'test-user'
        }
      };

      mockGitHubIntegration.getAllMappings.mockResolvedValue([mockMapping]);
      mockStateStore.saveState.mockResolvedValue();

      await syncEngine.onGitHubWebhookReceived(webhookEvent);

      const status = syncEngine.getSyncStatus();
      expect(status.pendingSyncs).toHaveLength(1);

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          data: expect.objectContaining({
            event: webhookEvent
          })
        })
      );
    });

    it('should ignore irrelevant webhook events', async () => {
      const irrelevantEvent: GitHubWebhookEvent = {
        action: 'synchronize', // Not in relevant actions
        number: 456,
        repository: {
          full_name: 'test-owner/test-repo'
        },
        sender: {
          login: 'test-user'
        }
      };

      await syncEngine.onGitHubWebhookReceived(irrelevantEvent);

      const status = syncEngine.getSyncStatus();
      expect(status.pendingSyncs).toHaveLength(0);
    });

    it('should handle webhook for unmapped issues', async () => {
      const webhookEvent: GitHubWebhookEvent = {
        action: 'closed',
        number: 999, // Not mapped
        repository: {
          full_name: 'test-owner/test-repo'
        },
        sender: {
          login: 'test-user'
        }
      };

      mockGitHubIntegration.getAllMappings.mockResolvedValue([mockMapping]); // Different issue number

      await syncEngine.onGitHubWebhookReceived(webhookEvent);

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          type: 'sync.github_to_task.no_mapping',
          data: expect.objectContaining({
            issueNumber: 999
          })
        })
      );
    });

    it('should extract changes from webhook events correctly', async () => {
      const labeledEvent: GitHubWebhookEvent = {
        action: 'labeled',
        number: 456,
        label: { name: 'bug' },
        repository: {
          full_name: 'test-owner/test-repo'
        },
        sender: {
          login: 'test-user'
        }
      };

      mockGitHubIntegration.getAllMappings.mockResolvedValue([mockMapping]);
      mockStateStore.saveState.mockResolvedValue();

      await syncEngine.onGitHubWebhookReceived(labeledEvent);

      // Should extract labelAdded change
      expect(mockStateStore.saveState).toHaveBeenCalledWith('github-sync-queue',
        expect.objectContaining({
          [expect.any(String)]: expect.objectContaining({
            changes: { labelAdded: 'bug' }
          })
        })
      );
    });
  });

  describe('processPendingSyncs', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await syncEngine.initialize();
    });

    it('should process pending sync events in batches', async () => {
      // Add some pending syncs manually
      const syncEvent1: SyncEvent = {
        id: 'sync-1',
        type: 'task_to_github',
        sourceId: 'task-123',
        targetId: '456',
        changes: { status: 'completed' },
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      const syncEvent2: SyncEvent = {
        id: 'sync-2',
        type: 'github_to_task',
        sourceId: '456',
        targetId: 'task-123',
        changes: { status: 'closed' },
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      // Add to internal queue (simulating webhook events)
      (syncEngine as any).syncQueue.set('sync-1', syncEvent1);
      (syncEngine as any).syncQueue.set('sync-2', syncEvent2);
      (syncEngine as any).syncStatus.pendingSyncs = ['sync-1', 'sync-2'];

      mockStateStore.saveState.mockResolvedValue();

      await syncEngine.processPendingSyncs();

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          type: 'sync.event.completed'
        })
      );

      const status = syncEngine.getSyncStatus();
      expect(status.pendingSyncs).toHaveLength(0);
      expect(status.totalSynced).toBe(2);
    });

    it('should not process when already processing', async () => {
      (syncEngine as any).isProcessing = true;
      
      const processSpy = vi.spyOn(syncEngine as any, 'processSyncEvent');

      await syncEngine.processPendingSyncs();

      expect(processSpy).not.toHaveBeenCalled();
    });

    it('should handle sync event processing errors', async () => {
      const failingEvent: SyncEvent = {
        id: 'sync-failing',
        type: 'task_to_github',
        sourceId: 'task-123',
        targetId: '456',
        changes: { status: 'completed' },
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      (syncEngine as any).syncQueue.set('sync-failing', failingEvent);
      (syncEngine as any).syncStatus.pendingSyncs = ['sync-failing'];

      // Mock processing error
      vi.spyOn(syncEngine as any, 'syncTaskToGitHub').mockRejectedValue(new Error('API error'));
      mockStateStore.saveState.mockResolvedValue();

      await syncEngine.processPendingSyncs();

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          type: 'sync.event.failed'
        })
      );

      const status = syncEngine.getSyncStatus();
      expect(status.totalErrors).toBe(1);
    });
  });

  describe('forceFullSync', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await syncEngine.initialize();
    });

    it('should create sync events for all mapped tasks', async () => {
      const mappings: TaskIssueMapping[] = [
        mockMapping,
        {
          taskId: 'task-456',
          issueNumber: 789,
          issueId: 101112,
          repository: 'test-owner/test-repo',
          createdAt: '2023-01-01T00:00:00Z',
          updatedAt: '2023-01-01T00:00:00Z',
          syncStatus: 'synced'
        }
      ];

      mockGitHubIntegration.getAllMappings.mockResolvedValue(mappings);
      mockStateStore.saveState.mockResolvedValue();

      await syncEngine.forceFullSync();

      const status = syncEngine.getSyncStatus();
      expect(status.pendingSyncs).toHaveLength(2);
      expect(status.totalSynced).toBe(2); // Processed immediately
    });
  });

  describe('configureSyncRules', () => {
    it('should update sync rules configuration', () => {
      const customRules: SyncRule[] = [
        {
          field: 'priority',
          direction: 'bidirectional',
          conflictResolution: 'github_wins'
        }
      ];

      syncEngine.configureSyncRules(customRules);

      // Test that rules are applied (indirectly by checking transformation)
      const appliedRules = (syncEngine as any).syncRules;
      expect(appliedRules).toEqual(customRules);
    });
  });

  describe('sync rule processing', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await syncEngine.initialize();
    });

    it('should apply status transformation rules', async () => {
      mockGitHubIntegration.getMappingForTask.mockResolvedValue(mockMapping);

      const completedTask = { ...mockTask, status: 'completed' as const };
      await syncEngine.onTaskStatusChanged(completedTask);

      // Should transform 'completed' status to 'closed' state for GitHub
      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          type: 'sync.task_to_github.update',
          data: expect.objectContaining({
            updates: expect.objectContaining({
              status: 'closed' // Transformed
            })
          })
        })
      );
    });

    it('should respect sync rule directions', async () => {
      // Configure rules to only sync from task to GitHub
      const taskOnlyRules: SyncRule[] = [
        {
          field: 'status',
          direction: 'task_to_github',
          conflictResolution: 'task_wins'
        }
      ];

      syncEngine.configureSyncRules(taskOnlyRules);

      // GitHub to task sync should be ignored
      const webhookEvent: GitHubWebhookEvent = {
        action: 'closed',
        number: 456,
        repository: { full_name: 'test-owner/test-repo' },
        sender: { login: 'test-user' }
      };

      mockGitHubIntegration.getAllMappings.mockResolvedValue([mockMapping]);
      mockStateStore.saveState.mockResolvedValue();

      await syncEngine.onGitHubWebhookReceived(webhookEvent);

      // Process the sync event
      await syncEngine.processPendingSyncs();

      // Should not update task because rule is task_to_github only
      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('github-sync',
        expect.objectContaining({
          type: 'sync.github_to_task.update',
          data: expect.objectContaining({
            updates: {} // Empty because rule blocked the sync
          })
        })
      );
    });
  });

  describe('default sync rules', () => {
    it('should provide comprehensive default sync rules', () => {
      const rules = GitHubSyncEngine.getDefaultSyncRules();

      expect(rules).toHaveLength(5);
      
      const statusRule = rules.find(r => r.field === 'status');
      expect(statusRule?.direction).toBe('bidirectional');
      expect(statusRule?.conflictResolution).toBe('latest_wins');
      expect(statusRule?.transform).toBeDefined();

      const titleRule = rules.find(r => r.field === 'title');
      expect(titleRule?.direction).toBe('task_to_github');
      expect(titleRule?.conflictResolution).toBe('task_wins');
    });

    it('should transform task status to GitHub state correctly', () => {
      const rules = GitHubSyncEngine.getDefaultSyncRules();
      const statusRule = rules.find(r => r.field === 'status');

      expect(statusRule?.transform?.('pending', 'task_to_github')).toBe('open');
      expect(statusRule?.transform?.('in_progress', 'task_to_github')).toBe('open');
      expect(statusRule?.transform?.('completed', 'task_to_github')).toBe('closed');
      expect(statusRule?.transform?.('failed', 'task_to_github')).toBe('open');
    });

    it('should transform GitHub state to task status correctly', () => {
      const rules = GitHubSyncEngine.getDefaultSyncRules();
      const statusRule = rules.find(r => r.field === 'status');

      expect(statusRule?.transform?.('open', 'github_to_task')).toBe('in_progress');
      expect(statusRule?.transform?.('closed', 'github_to_task')).toBe('completed');
    });
  });

  describe('SyncEnginePresets', () => {
    it('should provide realtime preset configuration', () => {
      const preset = SyncEnginePresets.realtime;

      expect(preset.syncInterval).toBe(10000); // 10 seconds
      expect(preset.maxRetries).toBe(5);
      expect(preset.batchSize).toBe(20);
      expect(preset.rules).toContain(
        expect.objectContaining({
          field: 'priority',
          direction: 'bidirectional'
        })
      );
    });

    it('should provide conservative preset configuration', () => {
      const preset = SyncEnginePresets.conservative;

      expect(preset.syncInterval).toBe(300000); // 5 minutes
      expect(preset.maxRetries).toBe(3);
      expect(preset.batchSize).toBe(5);
      
      // Should only have task_to_github rules
      const githubToTaskRules = preset.rules.filter(r => r.direction === 'github_to_task');
      expect(githubToTaskRules).toHaveLength(0);
    });

    it('should provide statusOnly preset configuration', () => {
      const preset = SyncEnginePresets.statusOnly;

      expect(preset.syncInterval).toBe(60000); // 1 minute
      expect(preset.rules).toHaveLength(1);
      expect(preset.rules[0].field).toBe('status');
    });
  });

  describe('error handling and resilience', () => {
    beforeEach(async () => {
      mockStateStore.loadState.mockResolvedValue(null);
      mockEventStore.appendEvent.mockResolvedValue();
      await syncEngine.initialize();
    });

    it('should handle storage failures gracefully', async () => {
      mockStateStore.saveState.mockRejectedValue(new Error('Storage error'));
      mockGitHubIntegration.getMappingForTask.mockResolvedValue(mockMapping);

      // Should not throw
      await expect(syncEngine.onTaskStatusChanged(mockTask)).resolves.not.toThrow();
    });

    it('should limit recent errors to prevent memory bloat', async () => {
      // Generate many errors
      for (let i = 0; i < 20; i++) {
        const failingTask = { ...mockTask, id: `failing-task-${i}` };
        mockGitHubIntegration.getMappingForTask.mockRejectedValue(new Error(`Error ${i}`));
        await syncEngine.onTaskStatusChanged(failingTask);
      }

      const status = syncEngine.getSyncStatus();
      expect(status.recentErrors.length).toBeLessThanOrEqual(10); // Should be capped
    });

    it('should retry failed sync events up to max retries', async () => {
      const failingEvent: SyncEvent = {
        id: 'sync-retry',
        type: 'task_to_github',
        sourceId: 'task-123',
        targetId: '456',
        changes: { status: 'completed' },
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      (syncEngine as any).syncQueue.set('sync-retry', failingEvent);
      (syncEngine as any).syncStatus.pendingSyncs = ['sync-retry'];

      // Mock consistent failure
      vi.spyOn(syncEngine as any, 'syncTaskToGitHub').mockRejectedValue(new Error('Persistent error'));
      mockStateStore.saveState.mockResolvedValue();

      // Process multiple times to trigger retries
      await syncEngine.processPendingSyncs();
      await syncEngine.processPendingSyncs();
      await syncEngine.processPendingSyncs();

      const event = (syncEngine as any).syncQueue.get('sync-retry');
      expect(event?.retryCount).toBe(3); // Max retries reached
      expect(event?.status).toBe('failed');

      const status = syncEngine.getSyncStatus();
      expect(status.totalErrors).toBe(1); // Only counted once after max retries
    });
  });
});