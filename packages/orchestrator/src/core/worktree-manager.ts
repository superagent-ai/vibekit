import { JSONStateStore } from '../storage/json-state-store';
import { JSONLEventStore } from '../storage/jsonl-event-store';

export interface WorktreeState {
  id: string;
  taskId: string;
  path: string;
  branch: string;
  baseBranch: string;
  status: 'active' | 'completed' | 'merged' | 'abandoned' | 'failed';
  createdAt: Date;
  lastActiveAt: Date;
  lastCommit?: string;
  uncommittedFiles?: string[];
  conflictStatus?: 'none' | 'detected' | 'resolved';
  mergeStatus?: {
    canMerge: boolean;
    conflicts?: string[];
    behindBy?: number;
    aheadBy?: number;
  };
}

export interface WorktreeConfig {
  maxConcurrentWorktrees?: number;
  cleanupAfterMerge?: boolean;
  autoResolveConflicts?: boolean;
  branchNamingStrategy?: 'taskId' | 'timestamp' | 'custom';
  defaultBaseBranch?: string;
}

export interface WorktreeOperation {
  id: string;
  type: 'create' | 'cleanup' | 'merge' | 'sync';
  worktreeId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
}

export class WorktreeManager {
  private stateStore = new JSONStateStore();
  private eventStore = new JSONLEventStore();
  private sessionId: string;
  private config: WorktreeConfig;
  private activeWorktrees: Map<string, WorktreeState> = new Map();
  private activeOperations: Map<string, WorktreeOperation> = new Map();

  constructor(sessionId: string, config: WorktreeConfig = {}) {
    this.sessionId = sessionId;
    this.config = {
      maxConcurrentWorktrees: 5,
      cleanupAfterMerge: true,
      autoResolveConflicts: false,
      branchNamingStrategy: 'taskId',
      defaultBaseBranch: 'main',
      ...config
    };
  }

  /**
   * Initialize the WorktreeManager and load existing state
   */
  async initialize(): Promise<void> {
    try {
      // Load existing worktree states
      const existingStates = await this.stateStore.loadState<WorktreeState[]>(
        `sessions/${this.sessionId}/worktrees`
      ) || [];

      // Populate active worktrees map
      for (const state of existingStates) {
        if (state.status === 'active' || state.status === 'failed') {
          this.activeWorktrees.set(state.id, state);
        }
      }

      // Load pending operations
      const existingOperations = await this.stateStore.loadState<WorktreeOperation[]>(
        `sessions/${this.sessionId}/worktree-operations`
      ) || [];

      // Populate active operations map
      for (const operation of existingOperations) {
        if (operation.status === 'pending' || operation.status === 'running') {
          this.activeOperations.set(operation.id, operation);
        }
      }

      // Log initialization
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'worktree.manager.initialized',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          activeWorktrees: this.activeWorktrees.size,
          pendingOperations: this.activeOperations.size,
          config: this.config
        }
      });

      console.log(`🌳 WorktreeManager initialized with ${this.activeWorktrees.size} active worktrees`);

    } catch (error) {
      throw new Error(`Failed to initialize WorktreeManager: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Create a new worktree for a task
   */
  async createWorktree(taskId: string, baseBranch?: string): Promise<WorktreeState> {
    // Check concurrent worktree limit
    if (this.activeWorktrees.size >= this.config.maxConcurrentWorktrees!) {
      throw new Error(`Maximum concurrent worktrees (${this.config.maxConcurrentWorktrees}) reached`);
    }

    // Check if worktree already exists for this task
    const existingWorktree = Array.from(this.activeWorktrees.values())
      .find(w => w.taskId === taskId && w.status === 'active');
    
    if (existingWorktree) {
      console.log(`🌳 Using existing worktree for task ${taskId}: ${existingWorktree.id}`);
      return existingWorktree;
    }

    const worktreeId = this.generateWorktreeId();
    const branchName = this.generateBranchName(taskId, worktreeId);
    const worktreePath = `/workspace/tasks/${taskId}`;
    const effectiveBaseBranch = baseBranch || this.config.defaultBaseBranch!;

    const worktreeState: WorktreeState = {
      id: worktreeId,
      taskId,
      path: worktreePath,
      branch: branchName,
      baseBranch: effectiveBaseBranch,
      status: 'active',
      createdAt: new Date(),
      lastActiveAt: new Date(),
      conflictStatus: 'none'
    };

    try {
      // Add to active worktrees
      this.activeWorktrees.set(worktreeId, worktreeState);
      
      // Save state
      await this.saveWorktreeStates();

      // Log worktree creation
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'worktree.created',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          worktreeId,
          taskId,
          branch: branchName,
          path: worktreePath,
          baseBranch: effectiveBaseBranch
        }
      });

      console.log(`🌳 Created worktree ${worktreeId} for task ${taskId} (${branchName})`);
      return worktreeState;

    } catch (error) {
      // Remove from active worktrees on failure
      this.activeWorktrees.delete(worktreeId);
      
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'worktree.create.failed',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          worktreeId,
          taskId,
          error: error instanceof Error ? error.message : String(error)
        }
      });

      throw new Error(`Failed to create worktree for task ${taskId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  /**
   * Update worktree status and metadata
   */
  async updateWorktreeStatus(worktreeId: string, status: WorktreeState['status'], metadata: Partial<WorktreeState> = {}): Promise<void> {
    const worktree = this.activeWorktrees.get(worktreeId);
    if (!worktree) {
      throw new Error(`Worktree ${worktreeId} not found`);
    }

    const previousStatus = worktree.status;
    worktree.status = status;
    worktree.lastActiveAt = new Date();
    
    // Update additional metadata
    Object.assign(worktree, metadata);

    // Move to inactive if completed/merged/abandoned
    if (['completed', 'merged', 'abandoned'].includes(status)) {
      this.activeWorktrees.delete(worktreeId);
    }

    // Save state
    await this.saveWorktreeStates();

    // Log status change
    await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
      id: this.generateEventId(),
      type: 'worktree.status.changed',
      timestamp: new Date().toISOString(),
      sessionId: this.sessionId,
      data: { 
        worktreeId,
        taskId: worktree.taskId,
        previousStatus,
        newStatus: status,
        metadata
      }
    });

    console.log(`🌳 Updated worktree ${worktreeId} status: ${previousStatus} → ${status}`);
  }

  /**
   * Get worktree status and information
   */
  getWorktree(worktreeId: string): WorktreeState | undefined {
    return this.activeWorktrees.get(worktreeId);
  }

  /**
   * Get worktree by task ID
   */
  getWorktreeByTask(taskId: string): WorktreeState | undefined {
    return Array.from(this.activeWorktrees.values())
      .find(w => w.taskId === taskId);
  }

  /**
   * List all active worktrees
   */
  getActiveWorktrees(): WorktreeState[] {
    return Array.from(this.activeWorktrees.values());
  }

  /**
   * Cleanup a specific worktree
   */
  async cleanupWorktree(worktreeId: string, force: boolean = false): Promise<void> {
    const worktree = this.activeWorktrees.get(worktreeId);
    
    if (!worktree) {
      // Try to load from persistent state
      const allStates = await this.stateStore.loadState<WorktreeState[]>(
        `sessions/${this.sessionId}/worktrees`
      ) || [];
      
      const persistedWorktree = allStates.find(w => w.id === worktreeId);
      
      if (!persistedWorktree || persistedWorktree.status === 'abandoned') {
        // Worktree already cleaned up or doesn't exist - success
        console.log(`🧹 Worktree ${worktreeId} already cleaned up or not found`);
        return;
      }
    }

    const operationId = this.generateOperationId();
    const operation: WorktreeOperation = {
      id: operationId,
      type: 'cleanup',
      worktreeId,
      status: 'pending',
      startedAt: new Date()
    };

    try {
      this.activeOperations.set(operationId, operation);
      operation.status = 'running';

      // Mark as abandoned in persistent storage BEFORE removing from active
      if (worktree) {
        await this.updateWorktreeStatus(worktreeId, 'abandoned');
      }

      // Remove from active worktrees (updateWorktreeStatus already does this for 'abandoned' status)

      operation.status = 'completed';
      operation.completedAt = new Date();

      // Log cleanup
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'worktree.cleaned',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { worktreeId, force }
      });

      console.log(`🧹 Cleaned up worktree ${worktreeId}`);

    } catch (error) {
      operation.status = 'failed';
      operation.error = error instanceof Error ? error.message : String(error);
      operation.completedAt = new Date();

      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'worktree.cleanup.failed',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          worktreeId,
          error: operation.error
        }
      });

      throw new Error(`Failed to cleanup worktree ${worktreeId}: ${operation.error}`);
    } finally {
      this.activeOperations.delete(operationId);
      await this.saveOperations();
    }
  }

  /**
   * Cleanup all worktrees for this session
   */
  async cleanupAll(force: boolean = false): Promise<void> {
    const worktreesToClean = Array.from(this.activeWorktrees.keys());
    const cleanupPromises = worktreesToClean.map(id => 
      this.cleanupWorktree(id, force).catch(error => {
        console.error(`Failed to cleanup worktree ${id}:`, error);
        return null; // Don't fail the entire cleanup
      })
    );

    await Promise.allSettled(cleanupPromises);
    
    console.log(`🧹 Attempted cleanup of ${worktreesToClean.length} worktrees`);
  }

  /**
   * Get summary statistics
   */
  async getStats(): Promise<{
    active: number;
    total: number;
    byStatus: Record<WorktreeState['status'], number>;
    oldestActive?: Date;
    newestActive?: Date;
  }> {
    const allStates = await this.stateStore.loadState<WorktreeState[]>(
      `sessions/${this.sessionId}/worktrees`
    ) || [];

    const activeWorktrees = Array.from(this.activeWorktrees.values());
    
    const byStatus = allStates.reduce((acc, w) => {
      acc[w.status] = (acc[w.status] || 0) + 1;
      return acc;
    }, {} as Record<WorktreeState['status'], number>);

    const activeDates = activeWorktrees.map(w => w.createdAt);
    
    return {
      active: activeWorktrees.length,
      total: allStates.length,
      byStatus,
      oldestActive: activeDates.length > 0 ? new Date(Math.min(...activeDates.map(d => d.getTime()))) : undefined,
      newestActive: activeDates.length > 0 ? new Date(Math.max(...activeDates.map(d => d.getTime()))) : undefined
    };
  }

  private async saveWorktreeStates(): Promise<void> {
    // Load existing states
    const existingStates = await this.stateStore.loadState<WorktreeState[]>(
      `sessions/${this.sessionId}/worktrees`
    ) || [];

    // Update with current active states
    const activeStatesMap = new Map(this.activeWorktrees.entries());
    
    // Merge existing non-active states with current active states
    const allStates = existingStates.filter(s => !activeStatesMap.has(s.id))
      .concat(Array.from(activeStatesMap.values()));

    await this.stateStore.saveState(`sessions/${this.sessionId}/worktrees`, allStates);
  }

  private async saveOperations(): Promise<void> {
    const operations = Array.from(this.activeOperations.values());
    await this.stateStore.saveState(`sessions/${this.sessionId}/worktree-operations`, operations);
  }

  private generateWorktreeId(): string {
    return `wt_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  private generateOperationId(): string {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  private generateBranchName(taskId: string, worktreeId: string): string {
    switch (this.config.branchNamingStrategy) {
      case 'taskId':
        return `task/${taskId}`;
      case 'timestamp':
        return `task/${new Date().toISOString().replace(/[:.]/g, '-')}-${taskId}`;
      case 'custom':
        return `worktree/${worktreeId}`;
      default:
        return `task/${taskId}`;
    }
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}