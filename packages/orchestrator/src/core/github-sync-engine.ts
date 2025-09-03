/**
 * GitHub Bidirectional Sync Engine
 * 
 * Handles real-time synchronization between PM tool tasks and GitHub issues/PRs,
 * including webhook processing and conflict resolution.
 */

import { EventEmitter } from 'events';
import { JSONStateStore } from '../storage/json-state-store';
import { JSONLEventStore } from '../storage/jsonl-event-store';
import { GitHubIntegrationManager, GitHubIssue, TaskIssueMapping } from './github-integration-manager';
import { PRMergeManager } from './pr-merge-manager';
import { Task } from '../providers/base';
import { OctokitService } from '../services/octokit-service';

// GitHub webhook event types
export interface GitHubWebhookEvent {
  action: string;
  number?: number;
  issue?: GitHubIssue;
  pull_request?: any;
  label?: { name: string };
  assignee?: { login: string };
  milestone?: { title: string };
  repository: {
    full_name: string;
  };
  sender: {
    login: string;
  };
}

export interface SyncStatus {
  lastSyncTimestamp: string;
  totalSynced: number;
  totalErrors: number;
  pendingSyncs: string[];
  recentErrors: Array<{
    taskId?: string;
    issueNumber?: number;
    error: string;
    timestamp: string;
  }>;
}

export interface SyncEvent {
  id: string;
  type: 'task_to_github' | 'github_to_task';
  sourceId: string; // taskId or issueNumber
  targetId: string; // issueNumber or taskId
  changes: Record<string, any>;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  timestamp: string;
  retryCount?: number;
  error?: string;
}

export interface SyncRule {
  field: string;
  direction: 'bidirectional' | 'task_to_github' | 'github_to_task';
  transform?: (value: any, direction: string) => any;
  conflictResolution: 'github_wins' | 'task_wins' | 'latest_wins' | 'manual';
}

export class GitHubSyncEngine extends EventEmitter {
  private stateStore = new JSONStateStore();
  private eventStore = new JSONLEventStore();
  private githubIntegration: GitHubIntegrationManager;
  private prMergeManager?: PRMergeManager;
  private syncStatus: SyncStatus;
  private syncQueue = new Map<string, SyncEvent>();
  private isProcessing = false;
  private syncRules: SyncRule[] = [];
  private octokitService?: OctokitService;
  
  // Configurable sync settings
  private syncInterval = 30000; // 30 seconds
  private maxRetries = 3;
  private batchSize = 10;

  constructor(
    githubIntegration: GitHubIntegrationManager,
    prMergeManager?: PRMergeManager,
    githubConfig?: { token: string; repository: string }
  ) {
    super();
    this.githubIntegration = githubIntegration;
    this.prMergeManager = prMergeManager;
    
    // Initialize Octokit service if GitHub config is provided
    if (githubConfig) {
      if (!githubConfig.token) {
        throw new Error('GitHub token is required for sync engine. Set GITHUB_TOKEN environment variable.');
      }
      
      this.octokitService = new OctokitService({
        token: githubConfig.token,
        repository: githubConfig.repository,
        userAgent: 'VibeKit-SyncEngine/1.0'
      });
    }
    
    this.syncStatus = {
      lastSyncTimestamp: new Date().toISOString(),
      totalSynced: 0,
      totalErrors: 0,
      pendingSyncs: [],
      recentErrors: []
    };

    this.initializeSyncRules();
  }

  async initialize(): Promise<void> {
    // Test GitHub connection if Octokit service is available
    if (this.octokitService) {
      const connectionCheck = await this.octokitService.checkConnection();
      if (!connectionCheck.connected) {
        throw new Error(`Failed to connect to GitHub for sync engine: ${connectionCheck.error}`);
      }
    }

    // Load sync status from storage
    const storedStatus = await this.stateStore.loadState<SyncStatus>('github-sync-status');
    if (storedStatus) {
      this.syncStatus = storedStatus;
    }

    // Load pending sync events
    await this.loadPendingSyncEvents();

    // Start periodic sync
    this.startPeriodicSync();

    await this.logEvent('sync.engine.initialized', {
      syncInterval: this.syncInterval,
      pendingSyncs: this.syncStatus.pendingSyncs.length,
      octokitEnabled: !!this.octokitService
    });

    this.emit('initialized');
  }

  /**
   * Handle task status change and sync to GitHub
   */
  async onTaskStatusChanged(task: Task): Promise<void> {
    try {
      // Create sync event
      const syncEvent: SyncEvent = {
        id: this.generateSyncEventId(),
        type: 'task_to_github',
        sourceId: task.id,
        targetId: '', // Will be populated when we get the issue mapping
        changes: { status: task.status },
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      // Get GitHub issue mapping
      const mapping = await this.githubIntegration.getMappingForTask?.(task.id);
      if (!mapping) {
        await this.logEvent('sync.task_to_github.no_mapping', {
          taskId: task.id,
          taskStatus: task.status
        });
        return;
      }

      syncEvent.targetId = mapping.issueNumber.toString();
      this.syncQueue.set(syncEvent.id, syncEvent);

      // Process immediately for status changes
      await this.processSyncEvent(syncEvent);

    } catch (error) {
      await this.logEvent('sync.task_to_github.error', {
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      });
      
      this.syncStatus.totalErrors++;
      this.syncStatus.recentErrors.push({
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });

      this.emit('syncError', { taskId: task.id, error });
    }
  }

  /**
   * Handle GitHub webhook event and sync to PM tool
   */
  async onGitHubWebhookReceived(event: GitHubWebhookEvent): Promise<void> {
    try {
      // Only process relevant events
      if (!this.isRelevantWebhookEvent(event)) {
        return;
      }

      const syncEvent: SyncEvent = {
        id: this.generateSyncEventId(),
        type: 'github_to_task',
        sourceId: (event.number || event.issue?.number || 0).toString(),
        targetId: '', // Will be populated when we find the task mapping
        changes: this.extractChangesFromWebhook(event),
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      // Find task mapping for this issue
      const allMappings = await this.githubIntegration.getAllMappings();
      const mapping = allMappings.find(m => m.issueNumber === event.number);
      
      if (!mapping) {
        await this.logEvent('sync.github_to_task.no_mapping', {
          issueNumber: event.number,
          action: event.action
        });
        return;
      }

      syncEvent.targetId = mapping.taskId;
      this.syncQueue.set(syncEvent.id, syncEvent);

      // Queue for batch processing
      this.syncStatus.pendingSyncs.push(syncEvent.id);
      await this.saveSyncStatus();

      this.emit('webhookReceived', { event, syncEventId: syncEvent.id });

    } catch (error) {
      await this.logEvent('sync.github_to_task.error', {
        issueNumber: event.number,
        error: error instanceof Error ? error.message : String(error)
      });

      this.syncStatus.totalErrors++;
      this.syncStatus.recentErrors.push({
        issueNumber: event.number,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString()
      });

      this.emit('syncError', { issueNumber: event.number, error });
    }
  }

  /**
   * Process pending sync events in batches
   */
  async processPendingSyncs(): Promise<void> {
    if (this.isProcessing || this.syncStatus.pendingSyncs.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    try {
      const batch = this.syncStatus.pendingSyncs.splice(0, this.batchSize);
      
      for (const syncEventId of batch) {
        const syncEvent = this.syncQueue.get(syncEventId);
        if (syncEvent) {
          await this.processSyncEvent(syncEvent);
          this.syncQueue.delete(syncEventId);
        }
      }

      this.syncStatus.lastSyncTimestamp = new Date().toISOString();
      await this.saveSyncStatus();

    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    return { ...this.syncStatus };
  }

  /**
   * Force full synchronization of all mapped tasks
   */
  async forceFullSync(): Promise<void> {
    const allMappings = await this.githubIntegration.getAllMappings();
    
    for (const mapping of allMappings) {
      const syncEvent: SyncEvent = {
        id: this.generateSyncEventId(),
        type: 'task_to_github',
        sourceId: mapping.taskId,
        targetId: mapping.issueNumber.toString(),
        changes: { fullSync: true },
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      this.syncQueue.set(syncEvent.id, syncEvent);
      this.syncStatus.pendingSyncs.push(syncEvent.id);
    }

    await this.saveSyncStatus();
    await this.processPendingSyncs();
  }

  /**
   * Configure sync rules for field mapping
   */
  configureSyncRules(rules: SyncRule[]): void {
    this.syncRules = rules;
  }

  /**
   * Get default sync rules
   */
  static getDefaultSyncRules(): SyncRule[] {
    return [
      {
        field: 'status',
        direction: 'bidirectional',
        conflictResolution: 'latest_wins',
        transform: (value: any, direction: string) => {
          if (direction === 'task_to_github') {
            // Transform task status to GitHub issue state
            const statusMap: Record<string, 'open' | 'closed'> = {
              'pending': 'open',
              'in_progress': 'open',
              'completed': 'closed',
              'failed': 'open'
            };
            return statusMap[value] || 'open';
          } else {
            // Transform GitHub issue state to task status
            const stateMap: Record<string, string> = {
              'open': 'in_progress',
              'closed': 'completed'
            };
            return stateMap[value] || 'pending';
          }
        }
      },
      {
        field: 'assignees',
        direction: 'github_to_task',
        conflictResolution: 'github_wins'
      },
      {
        field: 'labels',
        direction: 'bidirectional',
        conflictResolution: 'github_wins'
      },
      {
        field: 'title',
        direction: 'task_to_github',
        conflictResolution: 'task_wins'
      },
      {
        field: 'description',
        direction: 'task_to_github',
        conflictResolution: 'task_wins'
      }
    ];
  }

  // Private helper methods

  private async processSyncEvent(syncEvent: SyncEvent): Promise<void> {
    syncEvent.status = 'processing';

    try {
      if (syncEvent.type === 'task_to_github') {
        await this.syncTaskToGitHub(syncEvent);
      } else {
        await this.syncGitHubToTask(syncEvent);
      }

      syncEvent.status = 'completed';
      this.syncStatus.totalSynced++;

      await this.logEvent('sync.event.completed', {
        syncEventId: syncEvent.id,
        type: syncEvent.type,
        sourceId: syncEvent.sourceId
      });

    } catch (error) {
      syncEvent.status = 'failed';
      syncEvent.error = error instanceof Error ? error.message : String(error);
      syncEvent.retryCount = (syncEvent.retryCount || 0) + 1;

      // Retry if under max retries
      if (syncEvent.retryCount < this.maxRetries) {
        syncEvent.status = 'pending';
        this.syncQueue.set(syncEvent.id, syncEvent);
        this.syncStatus.pendingSyncs.push(syncEvent.id);
      } else {
        this.syncStatus.totalErrors++;
        this.syncStatus.recentErrors.push({
          taskId: syncEvent.type === 'task_to_github' ? syncEvent.sourceId : syncEvent.targetId,
          issueNumber: syncEvent.type === 'github_to_task' ? parseInt(syncEvent.sourceId) : parseInt(syncEvent.targetId),
          error: syncEvent.error,
          timestamp: new Date().toISOString()
        });
      }

      await this.logEvent('sync.event.failed', {
        syncEventId: syncEvent.id,
        error: syncEvent.error,
        retryCount: syncEvent.retryCount
      });
    }
  }

  private async syncTaskToGitHub(syncEvent: SyncEvent): Promise<void> {
    const taskId = syncEvent.sourceId;
    const issueNumber = parseInt(syncEvent.targetId);

    // This would integrate with the PM tool to get current task state
    // For now, we'll use the changes provided in the sync event
    const taskChanges = syncEvent.changes;

    // Apply sync rules and transform data
    const githubUpdates: Record<string, any> = {};
    
    for (const [field, value] of Object.entries(taskChanges)) {
      const rule = this.syncRules.find(r => r.field === field);
      if (rule && (rule.direction === 'bidirectional' || rule.direction === 'task_to_github')) {
        const transformedValue = rule.transform ? rule.transform(value, 'task_to_github') : value;
        githubUpdates[field] = transformedValue;
      }
    }

    // Update GitHub issue if we have changes
    if (Object.keys(githubUpdates).length > 0) {
      if (this.octokitService) {
        try {
          // Actually update the GitHub issue
          const updatePayload: any = {};
          
          // Map our fields to GitHub API fields
          if (githubUpdates.status !== undefined) {
            updatePayload.state = githubUpdates.status;
          }
          if (githubUpdates.title !== undefined) {
            updatePayload.title = githubUpdates.title;
          }
          if (githubUpdates.description !== undefined) {
            updatePayload.body = githubUpdates.description;
          }
          if (githubUpdates.assignees !== undefined) {
            updatePayload.assignees = Array.isArray(githubUpdates.assignees) ? githubUpdates.assignees : [githubUpdates.assignees];
          }
          if (githubUpdates.labels !== undefined) {
            updatePayload.labels = Array.isArray(githubUpdates.labels) ? githubUpdates.labels : [githubUpdates.labels];
          }

          if (Object.keys(updatePayload).length > 0) {
            await this.octokitService.updateIssue(issueNumber, updatePayload);
            
            await this.logEvent('sync.task_to_github.success', {
              taskId,
              issueNumber,
              updates: githubUpdates,
              payload: updatePayload
            });
          }
        } catch (error) {
          await this.logEvent('sync.task_to_github.error', {
            taskId,
            issueNumber,
            updates: githubUpdates,
            error: error instanceof Error ? error.message : String(error)
          });
          throw error;
        }
      } else {
        // Log the intended update if no Octokit service available
        await this.logEvent('sync.task_to_github.update', {
          taskId,
          issueNumber,
          updates: githubUpdates,
          note: 'Octokit service not available, sync logged only'
        });
      }
    }
  }

  private async syncGitHubToTask(syncEvent: SyncEvent): Promise<void> {
    const issueNumber = parseInt(syncEvent.sourceId);
    const taskId = syncEvent.targetId;

    // Get current GitHub issue state if Octokit service is available
    let currentIssue;
    if (this.octokitService) {
      try {
        currentIssue = await this.octokitService.getIssue(issueNumber);
      } catch (error) {
        await this.logEvent('sync.github_to_task.fetch_error', {
          issueNumber,
          taskId,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }

    // Apply sync rules and transform data
    const taskUpdates: Record<string, any> = {};
    
    for (const [field, value] of Object.entries(syncEvent.changes)) {
      const rule = this.syncRules.find(r => r.field === field);
      if (rule && (rule.direction === 'bidirectional' || rule.direction === 'github_to_task')) {
        const transformedValue = rule.transform ? rule.transform(value, 'github_to_task') : value;
        taskUpdates[field] = transformedValue;
      }
    }

    // If we have the current issue, add additional context
    if (currentIssue) {
      // Add assignees if changed
      if (currentIssue.assignees.length > 0) {
        const assigneeLogins = currentIssue.assignees.map(a => a.login);
        taskUpdates.assignees = assigneeLogins;
      }
      
      // Add labels if changed
      if (currentIssue.labels.length > 0) {
        const labelNames = currentIssue.labels.map(l => l.name);
        taskUpdates.labels = labelNames;
      }
      
      // Add state changes
      if (currentIssue.state !== 'open') {
        const statusRule = this.syncRules.find(r => r.field === 'status');
        if (statusRule && statusRule.transform) {
          taskUpdates.status = statusRule.transform(currentIssue.state, 'github_to_task');
        }
      }
    }

    // Update PM tool task if we have changes
    if (Object.keys(taskUpdates).length > 0) {
      // This would integrate with the PM tool to update the task
      // For now, we'll log the intended update with enhanced context
      await this.logEvent('sync.github_to_task.update', {
        issueNumber,
        taskId,
        updates: taskUpdates,
        githubIssue: currentIssue ? {
          state: currentIssue.state,
          title: currentIssue.title,
          assignees: currentIssue.assignees.map(a => a.login),
          labels: currentIssue.labels.map(l => l.name)
        } : null,
        note: 'PM tool integration would update task here'
      });
      
      // Emit event for external task management integration
      this.emit('taskUpdateRequired', {
        taskId,
        updates: taskUpdates,
        source: 'github',
        issueNumber
      });
    }
  }

  private isRelevantWebhookEvent(event: GitHubWebhookEvent): boolean {
    const relevantActions = [
      'opened', 'closed', 'reopened', 'edited',
      'labeled', 'unlabeled', 'assigned', 'unassigned',
      'milestoned', 'demilestoned'
    ];

    return relevantActions.includes(event.action);
  }

  private extractChangesFromWebhook(event: GitHubWebhookEvent): Record<string, any> {
    const changes: Record<string, any> = {};

    switch (event.action) {
      case 'closed':
        changes.status = 'closed';
        break;
      case 'reopened':
        changes.status = 'open';
        break;
      case 'labeled':
        if (event.label) {
          changes.labelAdded = event.label.name;
        }
        break;
      case 'unlabeled':
        if (event.label) {
          changes.labelRemoved = event.label.name;
        }
        break;
      case 'assigned':
        if (event.assignee) {
          changes.assigneeAdded = event.assignee.login;
        }
        break;
      case 'unassigned':
        if (event.assignee) {
          changes.assigneeRemoved = event.assignee.login;
        }
        break;
      case 'milestoned':
        if (event.milestone) {
          changes.milestone = event.milestone.title;
        }
        break;
      case 'demilestoned':
        changes.milestone = null;
        break;
    }

    return changes;
  }

  private initializeSyncRules(): void {
    this.syncRules = GitHubSyncEngine.getDefaultSyncRules();
  }

  private startPeriodicSync(): void {
    setInterval(async () => {
      try {
        await this.processPendingSyncs();
      } catch (error) {
        await this.logEvent('sync.periodic.error', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, this.syncInterval);
  }

  private async loadPendingSyncEvents(): Promise<void> {
    // Load sync events from storage
    // This would restore incomplete sync events across restarts
    const pendingEvents = await this.stateStore.loadState<Record<string, SyncEvent>>('github-sync-queue');
    if (pendingEvents) {
      for (const [eventId, event] of Object.entries(pendingEvents)) {
        this.syncQueue.set(eventId, event);
        this.syncStatus.pendingSyncs.push(eventId);
      }
    }
  }

  private async saveSyncStatus(): Promise<void> {
    await this.stateStore.saveState('github-sync-status', this.syncStatus);
    
    // Save pending sync events
    const pendingEvents: Record<string, SyncEvent> = {};
    for (const eventId of this.syncStatus.pendingSyncs) {
      const event = this.syncQueue.get(eventId);
      if (event) {
        pendingEvents[eventId] = event;
      }
    }
    await this.stateStore.saveState('github-sync-queue', pendingEvents);
  }

  private async logEvent(type: string, data: any): Promise<void> {
    await this.eventStore.appendEvent('github-sync', {
      id: this.generateEventId(),
      type,
      timestamp: new Date().toISOString(),
      data
    });
  }

  private generateSyncEventId(): string {
    return `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `sync_evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Configuration presets for different sync scenarios
export const SyncEnginePresets = {
  /**
   * Real-time sync for development teams
   */
  realtime: {
    syncInterval: 10000, // 10 seconds
    maxRetries: 5,
    batchSize: 20,
    rules: [
      ...GitHubSyncEngine.getDefaultSyncRules(),
      {
        field: 'priority',
        direction: 'bidirectional' as const,
        conflictResolution: 'github_wins' as const
      }
    ]
  },

  /**
   * Conservative sync for large teams
   */
  conservative: {
    syncInterval: 300000, // 5 minutes
    maxRetries: 3,
    batchSize: 5,
    rules: GitHubSyncEngine.getDefaultSyncRules().filter(r => 
      r.direction !== 'github_to_task' // Only sync from PM tool to GitHub
    )
  },

  /**
   * Minimal sync for status updates only
   */
  statusOnly: {
    syncInterval: 60000, // 1 minute
    maxRetries: 3,
    batchSize: 10,
    rules: GitHubSyncEngine.getDefaultSyncRules().filter(r => 
      r.field === 'status'
    )
  }
};