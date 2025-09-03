import { EventEmitter } from 'events';
import { JSONLEventStore } from '../storage/jsonl-event-store';
import { TaskProgressManager, type TaskProgress } from './task-progress-manager';
import { ProjectProvider } from '../providers/base';
import { Task } from '../types/task';

export interface ProviderSyncConfig {
  provider: ProjectProvider;
  syncInterval?: number; // milliseconds
  autoSync?: boolean;
  bidirectionalSync?: boolean;
}

export interface SyncResult {
  success: boolean;
  tasksUpdated: number;
  errors: string[];
  duration: number;
}

export class ProviderSyncManager extends EventEmitter {
  private eventStore = new JSONLEventStore();
  private progressManager: TaskProgressManager;
  private providers = new Map<string, ProviderSyncConfig>();
  private syncTimers = new Map<string, NodeJS.Timeout>();

  constructor(progressManager: TaskProgressManager) {
    super();
    this.progressManager = progressManager;

    // Listen to progress changes and sync to providers
    this.progressManager.on('progress', (progress: TaskProgress) => {
      this.handleProgressUpdate(progress);
    });
  }

  async registerProvider(providerId: string, config: ProviderSyncConfig): Promise<void> {
    this.providers.set(providerId, config);

    // Log provider registration
    await this.eventStore.appendEvent(`sync/${providerId}`, {
      id: this.generateEventId(),
      type: 'provider.registered',
      timestamp: new Date().toISOString(),
      data: {
        providerId,
        autoSync: config.autoSync,
        syncInterval: config.syncInterval,
        bidirectionalSync: config.bidirectionalSync
      }
    });

    // Set up automatic sync if enabled
    if (config.autoSync && config.syncInterval) {
      const timer = setInterval(async () => {
        await this.syncProvider(providerId);
      }, config.syncInterval);

      this.syncTimers.set(providerId, timer);
    }

    console.log(`🔄 Provider ${providerId} registered for synchronization`);
  }

  async unregisterProvider(providerId: string): Promise<void> {
    // Clear sync timer
    const timer = this.syncTimers.get(providerId);
    if (timer) {
      clearInterval(timer);
      this.syncTimers.delete(providerId);
    }

    this.providers.delete(providerId);

    await this.eventStore.appendEvent(`sync/${providerId}`, {
      id: this.generateEventId(),
      type: 'provider.unregistered',
      timestamp: new Date().toISOString(),
      data: { providerId }
    });

    console.log(`🔄 Provider ${providerId} unregistered from synchronization`);
  }

  async syncProvider(providerId: string): Promise<SyncResult> {
    const startTime = Date.now();
    const config = this.providers.get(providerId);

    if (!config) {
      throw new Error(`Provider ${providerId} not registered`);
    }

    const result: SyncResult = {
      success: false,
      tasksUpdated: 0,
      errors: [],
      duration: 0
    };

    try {
      console.log(`🔄 Starting sync for provider ${providerId}...`);

      // Get all tasks from the provider
      const providerTasks = await config.provider.getTasks();
      
      // For each task, sync status from our progress to provider
      for (const task of providerTasks) {
        try {
          await this.syncTaskToProvider(providerId, task, config);
          result.tasksUpdated++;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          result.errors.push(`Task ${task.id}: ${errorMessage}`);
        }
      }

      // If bidirectional sync is enabled, also pull updates from provider
      if (config.bidirectionalSync) {
        await this.syncFromProvider(providerId, providerTasks);
      }

      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      // Log sync result
      await this.eventStore.appendEvent(`sync/${providerId}`, {
        id: this.generateEventId(),
        type: result.success ? 'sync.completed' : 'sync.partial',
        timestamp: new Date().toISOString(),
        data: {
          providerId,
          tasksUpdated: result.tasksUpdated,
          errors: result.errors,
          duration: result.duration
        }
      });

      console.log(`✅ Sync completed for ${providerId}: ${result.tasksUpdated} tasks updated in ${result.duration}ms`);
      if (result.errors.length > 0) {
        console.warn(`⚠️ Sync had ${result.errors.length} errors for ${providerId}`);
      }

      this.emit('sync:completed', { providerId, result });
      return result;

    } catch (error) {
      result.success = false;
      result.duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      result.errors.push(errorMessage);

      await this.eventStore.appendEvent(`sync/${providerId}`, {
        id: this.generateEventId(),
        type: 'sync.failed',
        timestamp: new Date().toISOString(),
        data: {
          providerId,
          error: errorMessage,
          duration: result.duration
        }
      });

      console.error(`❌ Sync failed for ${providerId}: ${errorMessage}`);
      this.emit('sync:failed', { providerId, error: errorMessage });
      
      return result;
    }
  }

  private async syncTaskToProvider(providerId: string, task: Task, config: ProviderSyncConfig): Promise<void> {
    // Find any progress for this task across all sessions
    // This is a simplified implementation - in reality, you'd need session context
    const sessionId = 'current-session'; // This should come from context
    const progress = await this.progressManager.getProgress(sessionId, task.id);

    if (progress) {
      // Map our progress status to provider status
      let providerStatus: Task['status'] = task.status;

      switch (progress.status) {
        case 'pending':
          providerStatus = 'pending';
          break;
        case 'in_progress':
          providerStatus = 'in_progress';
          break;
        case 'completed':
          providerStatus = 'completed';
          break;
        case 'failed':
          providerStatus = 'failed';
          break;
        case 'paused':
          providerStatus = 'pending'; // Map paused to pending in provider
          break;
      }

      // Update provider if status changed
      if (providerStatus !== task.status) {
        await config.provider.updateTaskStatus(task.id, providerStatus);
        
        console.log(`   🔄 Updated task ${task.id} status: ${task.status} → ${providerStatus}`);
      }
    }
  }

  private async syncFromProvider(providerId: string, providerTasks: Task[]): Promise<void> {
    // This would implement pulling status updates from the provider
    // and updating our progress accordingly
    console.log(`   🔄 Bidirectional sync from ${providerId} (${providerTasks.length} tasks)`);
    
    // Implementation would check for tasks that have been updated in the provider
    // and sync those changes back to our progress system
  }

  private async handleProgressUpdate(progress: TaskProgress): Promise<void> {
    // When progress is updated, sync to all registered providers
    for (const [providerId, config] of this.providers) {
      if (config.autoSync) {
        try {
          // In a real implementation, you'd queue this for batch processing
          // to avoid hammering the provider with individual updates
          await this.syncSingleTaskToProvider(providerId, progress, config);
        } catch (error) {
          console.warn(`⚠️ Failed to auto-sync task ${progress.taskId} to ${providerId}: ${error}`);
        }
      }
    }
  }

  private async syncSingleTaskToProvider(
    providerId: string, 
    progress: TaskProgress, 
    config: ProviderSyncConfig
  ): Promise<void> {
    // Get the task from provider to check current status
    try {
      const task = await config.provider.getTask(progress.taskId);
      
      // Map progress status to provider status
      let providerStatus: Task['status'] = task.status;
      
      switch (progress.status) {
        case 'in_progress':
          providerStatus = 'in_progress';
          break;
        case 'completed':
          providerStatus = 'completed';
          break;
        case 'failed':
          providerStatus = 'failed';
          break;
      }

      if (providerStatus !== task.status) {
        await config.provider.updateTaskStatus(progress.taskId, providerStatus);
      }
    } catch (error) {
      // Task might not exist in provider, skip silently
    }
  }

  async syncAllProviders(): Promise<Map<string, SyncResult>> {
    const results = new Map<string, SyncResult>();
    
    console.log(`🔄 Starting sync for all ${this.providers.size} registered providers...`);
    
    for (const [providerId] of this.providers) {
      try {
        const result = await this.syncProvider(providerId);
        results.set(providerId, result);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.set(providerId, {
          success: false,
          tasksUpdated: 0,
          errors: [errorMessage],
          duration: 0
        });
      }
    }

    const totalUpdated = Array.from(results.values())
      .reduce((sum, result) => sum + result.tasksUpdated, 0);
    
    console.log(`✅ Completed sync for all providers: ${totalUpdated} total tasks updated`);
    
    return results;
  }

  async cleanup(): Promise<void> {
    // Clear all timers
    for (const [providerId, timer] of this.syncTimers) {
      clearInterval(timer);
    }
    this.syncTimers.clear();

    // Clear providers
    this.providers.clear();

    console.log('🧹 Provider sync manager cleaned up');
  }

  getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}