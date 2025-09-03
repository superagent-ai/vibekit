/**
 * WorktreeOrchestrator - Worker Pool Architecture for Parallel Git Worktrees
 * 
 * This class manages a pool of WorktreeWorker instances to enable true parallel
 * execution without the limitations of shared VibeKit SDK instances.
 */

import { EventEmitter } from 'events';
import { WorktreeWorker, WorktreeConfig, WorkerTask, WorkerResult } from './worktree-worker';
import { AgentExecutor, AgentCredentials, SandboxProvider, AgentExecutorConfig } from './agent-executor';
import { GitHubAPI, GitHubAPIConfig } from '../utils/github-api';
import { GitHubIntegrationManager, GitHubConfig as GitHubIntegrationConfig } from '../core/github-integration-manager';
import { Task } from '../providers/base';

export interface ParallelTask {
  worktreeName: string;
  taskId?: string;
  title?: string;
  description?: string;
  details?: string;
  testStrategy?: string;
  prompt: string;
  mode?: 'code' | 'ask';
  agentType?: 'claude' | 'codex' | 'opencode' | 'gemini' | 'grok';
  priority?: 'high' | 'medium' | 'low';
  estimatedDuration?: string;
  fileScope?: string[];
  dependencies?: string[];
  subtasks?: Task[];
  estimatedHours?: number;
  createGitHubIssue?: boolean; // Whether to create GitHub issue for this task
  onProgress?: (update: string) => void;
  onComplete?: (result: WorkerResult) => void;
  onError?: (error: Error) => void;
}

export interface WorktreeStatus {
  name: string;
  path: string;
  branch: string;
  status: 'active' | 'idle' | 'working' | 'completed' | 'error';
  lastUpdate: Date;
  activeTask?: string;
  worker?: WorktreeWorker;
  hasChanges: boolean;
  lastCommitSha?: string;
}

export interface OrchestratorConfig {
  sessionId: string;
  baseRepoUrl: string;
  baseBranch?: string;
  baseWorkspaceDir?: string;
  worktreeBaseDir?: string;
  maxConcurrentWorkers?: number;
  useSharedSandbox?: boolean;
}

/**
 * Orchestrates parallel git worktrees using worker pool architecture
 */
export class WorktreeOrchestrator extends EventEmitter {
  private workers = new Map<string, WorktreeWorker>();
  private worktreeStatuses = new Map<string, WorktreeStatus>();
  private activeTasks = new Map<string, Promise<WorkerResult>>();
  private agentExecutor: AgentExecutor;
  private githubAPI: GitHubAPI;
  private githubIntegration: GitHubIntegrationManager;
  private isInitialized = false;

  private baseWorkspaceDir: string;
  private worktreeBaseDir: string;
  private baseRepoUrl: string;
  private baseBranch: string;
  private sessionId: string;
  private maxConcurrentWorkers: number;

  constructor(
    private config: OrchestratorConfig,
    private githubConfig: GitHubAPIConfig,
    private agentCredentials: AgentCredentials,
    private sandboxProvider: SandboxProvider
  ) {
    super();
    
    this.sessionId = config.sessionId;
    this.baseRepoUrl = config.baseRepoUrl;
    this.baseBranch = config.baseBranch || 'main';
    this.baseWorkspaceDir = config.baseWorkspaceDir || '/workspace';
    this.worktreeBaseDir = config.worktreeBaseDir || '/workspace/worktrees';
    this.maxConcurrentWorkers = config.maxConcurrentWorkers || 5;

    // Initialize agent executor with shared sandbox configuration
    const agentExecutorConfig: AgentExecutorConfig = {
      useSharedSandbox: config.useSharedSandbox ?? true // Default to shared sandbox
    };
    this.agentExecutor = new AgentExecutor(sandboxProvider, agentCredentials, agentExecutorConfig);
    
    // Initialize GitHub API
    this.githubAPI = new GitHubAPI(githubConfig);

    // Initialize GitHub Integration Manager
    const githubIntegrationConfig: GitHubIntegrationConfig = {
      repository: this.baseRepoUrl,
      token: githubConfig.token,
      defaultBranch: this.baseBranch,
      labels: {
        taskPending: '🔄 pending',
        taskInProgress: '⚡ in-progress', 
        taskCompleted: '✅ completed',
        taskFailed: '❌ failed',
        priority: {
          high: '🔥 high-priority',
          medium: '📋 medium-priority', 
          low: '📝 low-priority'
        }
      }
    };
    this.githubIntegration = new GitHubIntegrationManager(githubIntegrationConfig);

    // Set up event forwarding from agent executor
    this.agentExecutor.on('executionStarted', (data) => this.emit('agentExecutionStarted', data));
    this.agentExecutor.on('executionCompleted', (data) => this.emit('agentExecutionCompleted', data));
    this.agentExecutor.on('executionFailed', (data) => this.emit('agentExecutionFailed', data));
  }

  /**
   * Initialize the orchestrator
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.emit('log', 'Initializing WorktreeOrchestrator with worker pool architecture');
      this.emit('log', `Base workspace dir: ${this.baseWorkspaceDir}`);
      this.emit('log', `Worktree base dir: ${this.worktreeBaseDir}`);

      // Initialize GitHub Integration Manager
      this.emit('log', 'Initializing GitHub integration...');
      await this.githubIntegration.initialize();

      // Create base directories
      this.emit('log', 'Creating base directories...');
      const dirResult = await this.agentExecutor.executeRawCommand(
        `mkdir -p ${this.baseWorkspaceDir} ${this.worktreeBaseDir}`,
        '/tmp' // Execute from tmp to avoid issues
      );
      this.emit('log', `Directory creation result: exit code ${dirResult.exitCode}`);

      // Clone main repository if it doesn't exist
      this.emit('log', 'Starting repository setup...');
      await this.ensureMainRepository();
      this.emit('log', 'Repository setup completed');

      this.isInitialized = true;
      this.emit('initialized');
      this.emit('log', 'WorktreeOrchestrator initialized successfully');

    } catch (error) {
      this.emit('log', `Initialization error: ${error}`);
      throw new Error(`Failed to initialize WorktreeOrchestrator: ${error}`);
    }
  }

  /**
   * Ensure main repository exists for worktree operations
   */
  private async ensureMainRepository(): Promise<void> {
    this.emit('log', `Checking for existing repository in: ${this.baseWorkspaceDir}`);
    
    try {
      // Check if repository already exists
      const gitStatusResult = await this.agentExecutor.executeRawCommand(
        'git status',
        this.baseWorkspaceDir,
        {},
        30000
      );

      this.emit('log', `Git status check result: exit code ${gitStatusResult.exitCode}`);

      if (gitStatusResult.exitCode === 0) {
        this.emit('log', 'Main repository already exists');
        
        // Fetch latest changes
        try {
          await this.agentExecutor.executeRawCommand(
            'git fetch origin',
            this.baseWorkspaceDir,
            {},
            60000
          );
          this.emit('log', 'Fetched latest changes from remote');
        } catch (fetchError) {
          this.emit('log', `Fetch failed (may be normal for new repos): ${fetchError}`);
        }
        return;
      }
    } catch (error) {
      // Repository doesn't exist, continue to clone
      this.emit('log', `No existing repository found, will clone fresh: ${error}`);
    }

    // Clear and clone the repository into workspace
    this.emit('log', `Cloning main repository: ${this.baseRepoUrl}`);
    
    const cloneUrl = `https://x-access-token:${this.githubConfig.token}@github.com/${this.baseRepoUrl}.git`;
    
    try {
      // Clear the workspace directory first to avoid clone conflicts
      this.emit('log', 'Clearing workspace directory...');
      const clearResult = await this.agentExecutor.executeRawCommand(
        `find . -mindepth 1 -delete`,
        this.baseWorkspaceDir,
        {},
        30000
      );
      this.emit('log', `Clear result: exit code ${clearResult.exitCode}, stderr: ${clearResult.stderr}`);
      
      // Clone directly into workspace directory (no temp directory needed)
      this.emit('log', `Starting git clone with URL: ${cloneUrl.replace(this.githubConfig.token, 'TOKEN')}`);
      const cloneResult = await this.agentExecutor.executeRawCommand(
        `git clone ${cloneUrl} .`,
        this.baseWorkspaceDir,
        {},
        300000 // 5 minutes timeout for clone
      );
      
      this.emit('log', `Clone result: exit code ${cloneResult.exitCode}`);
      this.emit('log', `Clone stdout: ${cloneResult.stdout}`);
      this.emit('log', `Clone stderr: ${cloneResult.stderr}`);

      if (cloneResult.exitCode !== 0) {
        throw new Error(`Git clone failed (exit code ${cloneResult.exitCode}): ${cloneResult.stderr}`);
      }

      // Configure git user
      await this.agentExecutor.executeRawCommand(
        `git config user.name "VibeKit Orchestrator"`,
        this.baseWorkspaceDir
      );
      
      await this.agentExecutor.executeRawCommand(
        `git config user.email "orchestrator@vibekit.sh"`,
        this.baseWorkspaceDir
      );

      this.emit('log', `Successfully cloned main repository: ${this.baseRepoUrl}`);
      
      // Verify the repository is properly set up
      const verifyResult = await this.agentExecutor.executeRawCommand(
        'git branch',
        this.baseWorkspaceDir
      );
      
      this.emit('log', `Repository verification: ${verifyResult.stdout}`);
      
    } catch (error) {
      this.emit('log', `Failed to clone repository: ${error}`);
      throw new Error(`Failed to set up main repository: ${error}`);
    }
  }

  /**
   * Create a new worktree
   */
  async createWorktree(config: WorktreeConfig): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized. Call initialize() first.');
    }

    if (this.workers.has(config.name)) {
      throw new Error(`Worktree '${config.name}' already exists`);
    }

    if (this.workers.size >= this.maxConcurrentWorkers) {
      throw new Error(`Maximum number of concurrent workers reached (${this.maxConcurrentWorkers})`);
    }

    try {
      // Create worker instance
      const worker = new WorktreeWorker(
        config,
        this.githubConfig,
        this.baseWorkspaceDir,
        this.sessionId,
        { useSharedSandbox: this.config.useSharedSandbox }
      );

      // Set agent executor
      worker.setAgentExecutor(this.agentExecutor);

      // Set up event forwarding
      worker.on('initialized', (data) => this.emit('worktreeCreated', data));
      worker.on('taskStarted', (data) => this.emit('taskStarted', data));
      worker.on('taskCompleted', (data) => this.emit('taskCompleted', data));
      worker.on('taskError', (data) => this.emit('taskError', data));
      worker.on('commitCreated', (data) => this.emit('commitCreated', data));
      worker.on('prCreated', (data) => this.emit('prCreated', data));
      worker.on('worktreeRemoved', (data) => this.emit('worktreeRemoved', data));

      // Initialize the worker
      await worker.initialize();

      // Store worker and status
      this.workers.set(config.name, worker);
      
      const status = await worker.getStatus();
      this.worktreeStatuses.set(config.name, {
        ...status,
        status: 'idle',
        lastUpdate: new Date(),
        worker
      });

      this.emit('worktreeCreated', {
        name: config.name,
        path: status.path,
        branch: status.branch
      });

    } catch (error) {
      throw new Error(`Failed to create worktree '${config.name}': ${error}`);
    }
  }

  /**
   * Execute a task in a specific worktree
   */
  async executeInWorktree(worktreeName: string, task: Omit<ParallelTask, 'worktreeName'>): Promise<WorkerResult> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }

    const worker = this.workers.get(worktreeName);
    if (!worker) {
      throw new Error(`Worktree '${worktreeName}' not found`);
    }

    // Create GitHub issue for the task if requested
    let githubIssue = null;
    if (task.createGitHubIssue && task.taskId) {
      try {
        const taskForIssue: Task = {
          id: task.taskId,
          title: task.title || task.prompt.substring(0, 50),
          description: task.description || task.prompt,
          details: task.details,
          testStrategy: task.testStrategy,
          priority: task.priority || 'medium',
          status: 'in_progress',
          subtasks: task.subtasks,
          dependencies: task.dependencies,
          fileScope: task.fileScope,
          estimatedHours: task.estimatedHours
        };

        githubIssue = await this.githubIntegration.createIssueFromTask(taskForIssue, this.sessionId);
        this.emit('issueCreated', {
          taskId: task.taskId,
          issueNumber: githubIssue.number,
          issueUrl: githubIssue.html_url,
          worktreeName
        });
      } catch (error) {
        this.emit('log', `Failed to create GitHub issue for task ${task.taskId}: ${error}`);
      }
    }

    // Update status to working
    const status = this.worktreeStatuses.get(worktreeName);
    if (status) {
      status.status = 'working';
      status.activeTask = task.prompt;
      status.lastUpdate = new Date();
      this.worktreeStatuses.set(worktreeName, status);
    }

    try {
      const workerTask: WorkerTask = {
        prompt: task.prompt,
        mode: task.mode,
        agentType: task.agentType || 'claude',
        onProgress: task.onProgress,
        onComplete: task.onComplete,
        onError: task.onError
      };

      const result = await worker.executeTask(workerTask);

      // Update GitHub issue status if task completed
      if (githubIssue && task.taskId) {
        try {
          const updatedTask: Task = {
            id: task.taskId,
            title: task.title || task.prompt.substring(0, 50),
            description: task.description || task.prompt,
            details: task.details,
            testStrategy: task.testStrategy,
            priority: task.priority || 'medium',
            status: result.exitCode === 0 ? 'completed' : 'failed',
            subtasks: task.subtasks,
            dependencies: task.dependencies,
            fileScope: task.fileScope,
            estimatedHours: task.estimatedHours
          };

          await this.githubIntegration.syncTaskStatusToIssue(updatedTask);
          
          this.emit('issueSynced', {
            taskId: task.taskId,
            issueNumber: githubIssue.number,
            status: updatedTask.status
          });
        } catch (error) {
          this.emit('log', `Failed to sync GitHub issue status for task ${task.taskId}: ${error}`);
        }
      }

      // Update status
      if (status) {
        status.status = result.exitCode === 0 ? 'completed' : 'error';
        status.activeTask = undefined;
        status.lastUpdate = new Date();
        status.hasChanges = result.files.length > 0;
        status.lastCommitSha = result.commitSha;
        this.worktreeStatuses.set(worktreeName, status);
      }

      return result;

    } catch (error) {
      // Update GitHub issue status on error
      if (githubIssue && task.taskId) {
        try {
          const failedTask: Task = {
            id: task.taskId,
            title: task.title || task.prompt.substring(0, 50),
            description: task.description || task.prompt,
            details: task.details,
            testStrategy: task.testStrategy,
            priority: task.priority || 'medium',
            status: 'failed',
            subtasks: task.subtasks,
            dependencies: task.dependencies,
            fileScope: task.fileScope,
            estimatedHours: task.estimatedHours
          };

          await this.githubIntegration.syncTaskStatusToIssue(failedTask);
        } catch (syncError) {
          this.emit('log', `Failed to sync GitHub issue status for failed task ${task.taskId}: ${syncError}`);
        }
      }

      // Update status on error
      if (status) {
        status.status = 'error';
        status.activeTask = undefined;
        status.lastUpdate = new Date();
        this.worktreeStatuses.set(worktreeName, status);
      }

      throw error;
    }
  }

  /**
   * Execute multiple tasks in parallel across different worktrees
   * TRUE parallel execution using Promise.all()
   */
  async executeParallelTasks(tasks: ParallelTask[]): Promise<WorkerResult[]> {
    this.emit('log', `Executing ${tasks.length} tasks in TRUE parallel across worktrees`);

    // Validate all worktrees exist
    for (const task of tasks) {
      if (!this.workers.has(task.worktreeName)) {
        throw new Error(`Worktree '${task.worktreeName}' not found. Create it first with createWorktree().`);
      }
    }

    // Log task overview
    this.emit('log', 'Task Overview:');
    tasks.forEach((task, index) => {
      this.emit('log', `  ${index + 1}. [${task.taskId || 'N/A'}] ${task.title || task.prompt.substring(0, 50)} (${task.priority || 'medium'} priority)`);
      if (task.description) {
        this.emit('log', `     ${task.description}`);
      }
    });

    // Create promises for all tasks
    const taskPromises = tasks.map(async (task) => {
      try {
        this.emit('log', `Starting task in ${task.worktreeName}: ${task.title || task.prompt.substring(0, 50)}`);
        
        const { worktreeName, ...taskParams } = task;
        const promise = this.executeInWorktree(worktreeName, taskParams);
        this.activeTasks.set(worktreeName, promise);

        const result = await promise;
        this.activeTasks.delete(worktreeName);
        
        this.emit('log', `Completed task in ${task.worktreeName}: ${result.exitCode === 0 ? 'SUCCESS' : 'FAILED'}`);
        return result;

      } catch (error) {
        this.activeTasks.delete(task.worktreeName);
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.emit('log', `Failed task in ${task.worktreeName}: ${errorMessage}`);
        
        // Return error result to maintain array consistency
        return {
          sandboxId: '',
          exitCode: 1,
          stdout: '',
          stderr: errorMessage,
          duration: 0,
          files: []
        };
      }
    });

    // Execute all tasks in parallel
    const results = await Promise.all(taskPromises);

    this.emit('log', `Parallel execution completed: ${results.filter(r => r.exitCode === 0).length}/${results.length} successful`);
    return results;
  }

  /**
   * Create pull requests from multiple worktrees with enhanced GitHub issue linking
   */
  async createPullRequests(
    worktreeNames: string[],
    options: {
      branchPrefix?: string;
      labels?: string[];
      generateTitleFromTask?: boolean;
      taskIds?: string[]; // Task IDs to link to issues
    } = {}
  ): Promise<Array<{ worktreeName: string; pr: any }>> {
    this.emit('log', `Creating enhanced PRs with GitHub issue linking for ${worktreeNames.length} worktrees`);

    const prResults = [];

    for (let i = 0; i < worktreeNames.length; i++) {
      const worktreeName = worktreeNames[i];
      const taskId = options.taskIds?.[i];
      
      const worker = this.workers.get(worktreeName);
      if (!worker) {
        this.emit('log', `Worktree '${worktreeName}' not found, skipping PR creation`);
        continue;
      }

      try {
        // Get issue reference for this task
        let issueReference = null;
        let issueClosingSyntax = null;
        if (taskId) {
          issueReference = this.githubIntegration.getIssueReference(taskId);
          issueClosingSyntax = this.githubIntegration.getIssueClosingSyntax(taskId);
        }

        // Create enhanced PR description
        const status = this.worktreeStatuses.get(worktreeName);
        let prDescription = `## Summary\n\nImplemented changes for worktree: ${worktreeName}`;
        
        if (issueReference) {
          prDescription += `\n\nRelated Issue: ${issueReference}`;
        }
        
        if (status?.hasChanges && status.lastCommitSha) {
          prDescription += `\n\n## Changes\n\n- Latest commit: ${status.lastCommitSha}`;
          prDescription += `\n- Files modified: ${status.hasChanges ? 'Yes' : 'No'}`;
        }

        if (issueClosingSyntax) {
          prDescription += `\n\n${issueClosingSyntax}`;
        }

        prDescription += `\n\n---\n*Generated by VibeKit Orchestrator*`;

        // Create PR with enhanced description
        const prTitle = options.generateTitleFromTask && taskId 
          ? `${taskId}: ${worktreeName}${issueReference ? ` (${issueReference})` : ''}`
          : `${options.branchPrefix || 'orchestrator'}-${worktreeName}${issueReference ? ` (${issueReference})` : ''}`;

        // Use worker to create PR with enhanced metadata
        const prResult = await worker.createPullRequest({
          title: prTitle,
          description: prDescription,
          labels: options.labels
        });

        prResults.push({
          worktreeName,
          pr: {
            ...prResult,
            linkedIssue: issueReference,
            taskId: taskId
          }
        });

        this.emit('enhancedPrCreated', {
          worktreeName,
          taskId,
          issueReference,
          prUrl: prResult?.url || prResult?.html_url,
          prNumber: prResult?.number
        });

      } catch (error) {
        this.emit('log', `Failed to create PR for worktree ${worktreeName}: ${error}`);
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        prResults.push({
          worktreeName,
          pr: {
            error: errorMessage,
            success: false
          }
        });
      }
    }

    return prResults;
  }

  /**
   * Get status of all worktrees
   */
  getWorktreeStatuses(): WorktreeStatus[] {
    return Array.from(this.worktreeStatuses.values()).map(status => ({
      ...status,
      worker: undefined // Don't expose worker in status
    }));
  }

  /**
   * Get status of a specific worktree
   */
  getWorktreeStatus(name: string): WorktreeStatus | undefined {
    const status = this.worktreeStatuses.get(name);
    if (!status) return undefined;

    return {
      ...status,
      worker: undefined // Don't expose worker in status
    };
  }

  /**
   * Clean up a specific worktree
   */
  async cleanupWorktree(name: string): Promise<void> {
    const worker = this.workers.get(name);
    if (!worker) {
      throw new Error(`Worktree '${name}' not found`);
    }

    try {
      await worker.cleanup();
      this.workers.delete(name);
      this.worktreeStatuses.delete(name);
      this.activeTasks.delete(name);

      this.emit('worktreeRemoved', { name });

    } catch (error) {
      throw new Error(`Failed to cleanup worktree '${name}': ${error}`);
    }
  }

  /**
   * Clean up all worktrees and shut down orchestrator
   */
  async cleanup(): Promise<void> {
    this.emit('log', 'Cleaning up WorktreeOrchestrator');

    // Clean up all workers
    const cleanupPromises = Array.from(this.workers.keys()).map(async (name) => {
      try {
        await this.cleanupWorktree(name);
      } catch (error) {
        console.warn(`Failed to cleanup worktree '${name}':`, error);
      }
    });

    await Promise.allSettled(cleanupPromises);

    // Kill all sandboxes
    try {
      await this.agentExecutor.killAllSandboxes();
    } catch (error) {
      console.warn('Failed to kill agent executor sandboxes:', error);
    }

    this.emit('cleanupComplete');
    this.emit('log', 'WorktreeOrchestrator cleanup completed');
  }

  /**
   * Get orchestrator statistics
   */
  getStatistics() {
    const statuses = this.getWorktreeStatuses();
    const activeTasks = Array.from(this.activeTasks.keys());
    const sandboxes = this.agentExecutor.getActiveSandboxes();

    return {
      totalWorktrees: statuses.length,
      activeWorktrees: statuses.filter(s => s.status === 'working').length,
      completedWorktrees: statuses.filter(s => s.status === 'completed').length,
      errorWorktrees: statuses.filter(s => s.status === 'error').length,
      idleWorktrees: statuses.filter(s => s.status === 'idle').length,
      activeTasks: activeTasks.length,
      activeSandboxes: sandboxes.length,
      maxConcurrentWorkers: this.maxConcurrentWorkers,
      isReady: this.isInitialized
    };
  }

  /**
   * Check if orchestrator is ready
   */
  get isReady(): boolean {
    return this.isInitialized;
  }

  // GitHub Integration Methods

  /**
   * Create a GitHub issue from a task
   */
  async createGitHubIssue(task: Task): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }

    const issue = await this.githubIntegration.createIssueFromTask(task, this.sessionId);
    
    this.emit('issueCreated', {
      taskId: task.id,
      issueNumber: issue.number,
      issueUrl: issue.html_url
    });

    return issue;
  }

  /**
   * Link an existing GitHub issue to a task
   */
  async linkTaskToGitHubIssue(taskId: string, issueNumber: number): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }

    await this.githubIntegration.linkTaskToIssue(taskId, issueNumber);
    
    this.emit('taskLinkedToIssue', {
      taskId,
      issueNumber
    });
  }

  /**
   * Get GitHub issue for a task
   */
  async getGitHubIssueForTask(taskId: string): Promise<any> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }

    return await this.githubIntegration.getIssueForTask(taskId);
  }

  /**
   * Sync task status to GitHub issue
   */
  async syncTaskStatusToGitHub(task: Task): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }

    await this.githubIntegration.syncTaskStatusToIssue(task);
    
    this.emit('taskStatusSyncedToGitHub', {
      taskId: task.id,
      status: task.status
    });
  }

  /**
   * Get all task-issue mappings
   */
  async getTaskIssueMappings(): Promise<any[]> {
    if (!this.isInitialized) {
      throw new Error('Orchestrator not initialized');
    }

    return await this.githubIntegration.getAllMappings();
  }

  /**
   * Get GitHub integration statistics
   */
  getGitHubIntegrationStats() {
    return {
      repository: this.baseRepoUrl,
      hasIntegration: true,
      mappingsCount: this.githubIntegration ? 'Available' : 'Not initialized'
    };
  }
}

export default WorktreeOrchestrator;

// Re-export interfaces for backward compatibility
export type { WorktreeConfig } from './worktree-worker';