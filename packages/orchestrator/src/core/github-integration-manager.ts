/**
 * GitHub Integration Manager
 * 
 * Manages task-to-GitHub issue mapping, creation, and synchronization
 * for VibeKit orchestrator workflows.
 */

import { JSONStateStore } from '../storage/json-state-store';
import { JSONLEventStore } from '../storage/jsonl-event-store';
import { Task } from '../providers/base';
import { OctokitService, type OctokitServiceConfig } from '../services/octokit-service';
import type { GitHubIssue as OctokitIssue } from '../services/octokit-service';

// GitHub API types (simplified)
export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string }>;
  milestone?: { title: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at?: string;
}

export interface GitHubLabel {
  name: string;
  color: string;
  description?: string;
}

export interface TaskIssueMapping {
  taskId: string;
  issueNumber: number;
  issueId: number;
  repository: string;
  createdAt: string;
  updatedAt: string;
  syncStatus: 'synced' | 'pending' | 'failed';
  lastSyncAt?: string;
}

export interface GitHubConfig {
  repository: string;
  token: string;
  defaultBranch: string;
  issueTemplates?: {
    task?: string;
    bug?: string;
    feature?: string;
  };
  labels: {
    taskPending: string;
    taskInProgress: string;
    taskCompleted: string;
    taskFailed: string;
    priority: {
      high: string;
      medium: string;
      low: string;
    };
  };
  autoAssign?: string[];
  milestoneMapping?: Record<string, string>; // epicId -> milestone name
}

export class GitHubIntegrationManager {
  private stateStore = new JSONStateStore();
  private eventStore = new JSONLEventStore();
  private config: GitHubConfig;
  private mappings: Map<string, TaskIssueMapping> = new Map();
  private octokitService: OctokitService;

  constructor(config: GitHubConfig) {
    this.config = config;
    
    // Initialize Octokit service with fail-fast behavior
    if (!config.token) {
      throw new Error('GitHub token is required. Set GITHUB_TOKEN environment variable.');
    }
    
    this.octokitService = new OctokitService({
      token: config.token,
      repository: config.repository,
      userAgent: 'VibeKit-Orchestrator/1.0'
    });
  }

  async initialize(): Promise<void> {
    // Test GitHub connection first
    const connectionCheck = await this.octokitService.checkConnection();
    if (!connectionCheck.connected) {
      throw new Error(`Failed to connect to GitHub: ${connectionCheck.error}`);
    }

    // Load existing task-issue mappings
    await this.loadMappings();

    // Log initialization
    await this.eventStore.appendEvent('github-integration', {
      id: this.generateEventId(),
      type: 'github.integration.initialized',
      timestamp: new Date().toISOString(),
      data: { 
        repository: this.config.repository,
        githubUser: connectionCheck.user?.login
      }
    });
  }

  /**
   * Create a GitHub issue from a task
   */
  async createIssueFromTask(task: Task, sessionId?: string): Promise<GitHubIssue> {
    // Check if we already have an issue for this task
    const existingMapping = await this.getMappingForTask(task.id);
    if (existingMapping) {
      const existingIssue = await this.getIssue(existingMapping.issueNumber);
      if (existingIssue) {
        await this.logEvent('github.issue.existing_found', {
          taskId: task.id,
          issueNumber: existingMapping.issueNumber
        });
        return existingIssue;
      }
    }

    // Create new GitHub issue
    const issueData = await this.buildIssueFromTask(task);
    const issue = await this.createGitHubIssue(issueData);

    // Store mapping
    const mapping: TaskIssueMapping = {
      taskId: task.id,
      issueNumber: issue.number,
      issueId: issue.id,
      repository: this.config.repository,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
      lastSyncAt: new Date().toISOString()
    };

    await this.storeMapping(mapping);

    // Log creation
    await this.logEvent('github.issue.created', {
      taskId: task.id,
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      sessionId
    });

    return issue;
  }

  /**
   * Update a GitHub issue from a task
   */
  async updateIssueFromTask(task: Task): Promise<GitHubIssue | null> {
    const mapping = await this.getMappingForTask(task.id);
    if (!mapping) {
      throw new Error(`No GitHub issue found for task ${task.id}`);
    }

    const updateData = await this.buildIssueUpdateFromTask(task);
    const updatedIssue = await this.updateGitHubIssue(mapping.issueNumber, updateData);

    // Update mapping
    mapping.updatedAt = new Date().toISOString();
    mapping.lastSyncAt = new Date().toISOString();
    mapping.syncStatus = 'synced';
    await this.storeMapping(mapping);

    // Log update
    await this.logEvent('github.issue.updated', {
      taskId: task.id,
      issueNumber: mapping.issueNumber,
      changes: updateData
    });

    return updatedIssue;
  }

  /**
   * Get GitHub issue for a task
   */
  async getIssueForTask(taskId: string): Promise<GitHubIssue | null> {
    const mapping = await this.getMappingForTask(taskId);
    if (!mapping) return null;

    return await this.getIssue(mapping.issueNumber);
  }

  /**
   * Link an existing GitHub issue to a task
   */
  async linkTaskToIssue(taskId: string, issueNumber: number): Promise<void> {
    const issue = await this.getIssue(issueNumber);
    if (!issue) {
      throw new Error(`GitHub issue #${issueNumber} not found`);
    }

    const mapping: TaskIssueMapping = {
      taskId,
      issueNumber: issue.number,
      issueId: issue.id,
      repository: this.config.repository,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'synced',
      lastSyncAt: new Date().toISOString()
    };

    await this.storeMapping(mapping);

    await this.logEvent('github.issue.linked', {
      taskId,
      issueNumber,
      issueUrl: issue.html_url
    });
  }

  /**
   * Sync task status to GitHub issue
   */
  async syncTaskStatusToIssue(task: Task): Promise<void> {
    const mapping = await this.getMappingForTask(task.id);
    if (!mapping) return;

    const labels = await this.getLabelsForTaskStatus(task);
    const state = this.getIssueStateForTask(task);

    const updateData = {
      labels: labels.map(l => l.name),
      state
    };

    try {
      await this.updateGitHubIssue(mapping.issueNumber, updateData);
      
      mapping.lastSyncAt = new Date().toISOString();
      mapping.syncStatus = 'synced';
      await this.storeMapping(mapping);

      await this.logEvent('github.sync.task_to_issue', {
        taskId: task.id,
        issueNumber: mapping.issueNumber,
        newStatus: task.status,
        newState: state
      });
    } catch (error) {
      mapping.syncStatus = 'failed';
      await this.storeMapping(mapping);

      await this.logEvent('github.sync.failed', {
        taskId: task.id,
        issueNumber: mapping.issueNumber,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get all task-issue mappings
   */
  async getAllMappings(): Promise<TaskIssueMapping[]> {
    return Array.from(this.mappings.values());
  }

  /**
   * Generate issue reference for PR descriptions
   */
  getIssueReference(taskId: string): string | null {
    const mapping = this.mappings.get(taskId);
    return mapping ? `#${mapping.issueNumber}` : null;
  }

  /**
   * Generate issue closing syntax for PR descriptions
   */
  getIssueClosingSyntax(taskId: string): string | null {
    const mapping = this.mappings.get(taskId);
    return mapping ? `Closes #${mapping.issueNumber}` : null;
  }

  // Private helper methods

  private async buildIssueFromTask(task: Task): Promise<any> {
    const labels = await this.getLabelsForTaskStatus(task);
    
    return {
      title: task.title,
      body: this.generateIssueBody(task),
      labels: labels.map(l => l.name),
      assignees: this.config.autoAssign || [],
      milestone: await this.getMilestoneForTask(task)
    };
  }

  private async buildIssueUpdateFromTask(task: Task): Promise<any> {
    const labels = await this.getLabelsForTaskStatus(task);
    
    return {
      title: task.title,
      body: this.generateIssueBody(task),
      labels: labels.map(l => l.name),
      state: this.getIssueStateForTask(task)
    };
  }

  private generateIssueBody(task: Task): string {
    const sections = [];

    // Description
    sections.push('## Description');
    sections.push(task.description || 'No description provided.');

    // Details
    if (task.details) {
      sections.push('## Details');
      sections.push(task.details);
    }

    // Test Strategy
    if (task.testStrategy) {
      sections.push('## Test Strategy');
      sections.push(task.testStrategy);
    }

    // File Scope
    if (task.fileScope && task.fileScope.length > 0) {
      sections.push('## File Scope');
      sections.push(task.fileScope.map((scope: string) => `- ${scope}`).join('\n'));
    }

    // Dependencies
    if (task.dependencies && task.dependencies.length > 0) {
      sections.push('## Dependencies');
      sections.push(task.dependencies.map((dep: string) => `- Task ${dep}`).join('\n'));
    }

    // Subtasks
    if (task.subtasks && task.subtasks.length > 0) {
      sections.push('## Subtasks');
      sections.push(task.subtasks.map((subtask: any) => 
        `- [ ] ${subtask.title} (${subtask.status})`
      ).join('\n'));
    }

    // Estimated Hours
    if (task.estimatedHours) {
      sections.push('## Estimated Hours');
      sections.push(`${task.estimatedHours} hours`);
    }

    // Footer
    sections.push('---');
    sections.push('*Generated by VibeKit Orchestrator*');

    return sections.join('\n\n');
  }

  private async getLabelsForTaskStatus(task: Task): Promise<GitHubLabel[]> {
    const labels: GitHubLabel[] = [];

    // Status label
    const statusLabel = this.getStatusLabel(task.status);
    if (statusLabel) labels.push(statusLabel);

    // Priority label
    const priorityLabel = this.getPriorityLabel(task.priority);
    if (priorityLabel) labels.push(priorityLabel);

    return labels;
  }

  private getStatusLabel(status: Task['status']): GitHubLabel | null {
    const statusMap: Record<string, string> = {
      'pending': this.config.labels.taskPending,
      'in_progress': this.config.labels.taskInProgress,
      'completed': this.config.labels.taskCompleted,
      'failed': this.config.labels.taskFailed
    };

    const labelName = statusMap[status];
    if (!labelName) return null;

    return {
      name: labelName,
      color: this.getColorForStatus(status),
      description: `Task is ${status.replace('_', ' ')}`
    };
  }

  private getPriorityLabel(priority: Task['priority']): GitHubLabel | null {
    const priorityMap: Record<string, string> = this.config.labels.priority;
    const labelName = priorityMap[priority];
    if (!labelName) return null;

    return {
      name: labelName,
      color: this.getColorForPriority(priority),
      description: `${priority} priority task`
    };
  }

  private getColorForStatus(status: Task['status']): string {
    const colorMap: Record<string, string> = {
      'pending': 'fbca04',     // yellow
      'in_progress': '0052cc',  // blue
      'completed': '0e8a16',    // green
      'failed': 'd73a49'        // red
    };
    return colorMap[status] || 'bfd4f2';
  }

  private getColorForPriority(priority: Task['priority']): string {
    const colorMap: Record<string, string> = {
      'high': 'd73a49',      // red
      'medium': 'fbca04',    // yellow
      'low': '0e8a16'        // green
    };
    return colorMap[priority] || 'bfd4f2';
  }

  private getIssueStateForTask(task: Task): 'open' | 'closed' {
    return task.status === 'completed' ? 'closed' : 'open';
  }

  private async getMilestoneForTask(task: Task): Promise<string | undefined> {
    // If task has epic/parent context, try to map to milestone
    // This would be enhanced based on specific PM tool integration
    return undefined;
  }

  async getMappingForTask(taskId: string): Promise<TaskIssueMapping | null> {
    return this.mappings.get(taskId) || null;
  }

  private async storeMapping(mapping: TaskIssueMapping): Promise<void> {
    this.mappings.set(mapping.taskId, mapping);
    await this.stateStore.saveState(`github-mappings/${mapping.taskId}`, mapping);
    
    // Update index
    const index = await this.getAllMappings();
    await this.stateStore.saveState('github-mappings/index', { mappings: index });
  }

  private async loadMappings(): Promise<void> {
    try {
      const index = await this.stateStore.loadState<{ mappings: TaskIssueMapping[] }>('github-mappings/index');
      if (index?.mappings) {
        for (const mapping of index.mappings) {
          this.mappings.set(mapping.taskId, mapping);
        }
      }
    } catch (error) {
      // Index doesn't exist yet - that's ok
    }
  }

  // Real GitHub API methods using Octokit
  private async createGitHubIssue(issueData: any): Promise<GitHubIssue> {
    try {
      // Create labels if they don't exist
      if (issueData.labels && Array.isArray(issueData.labels)) {
        for (const labelName of issueData.labels) {
          const label = this.getStatusLabel('pending') || this.getPriorityLabel('medium');
          if (label && label.name === labelName) {
            try {
              await this.octokitService.createOrUpdateLabel({
                name: labelName,
                color: label.color,
                description: label.description || ''
              });
            } catch (error) {
              // Label might already exist, continue
              console.warn(`Could not create label '${labelName}':`, error);
            }
          }
        }
      }

      // Create the issue
      const octokitIssue = await this.octokitService.createIssue({
        title: issueData.title,
        body: issueData.body,
        labels: issueData.labels,
        assignees: issueData.assignees
      });

      // Convert OctokitIssue to GitHubIssue format
      return this.convertOctokitIssueToGitHubIssue(octokitIssue);
    } catch (error: any) {
      throw new Error(`Failed to create GitHub issue: ${error.message}`);
    }
  }

  private async updateGitHubIssue(issueNumber: number, updateData: any): Promise<GitHubIssue> {
    try {
      // Create labels if they don't exist
      if (updateData.labels && Array.isArray(updateData.labels)) {
        for (const labelName of updateData.labels) {
          const label = this.getStatusLabel('pending') || this.getPriorityLabel('medium');
          if (label && label.name === labelName) {
            try {
              await this.octokitService.createOrUpdateLabel({
                name: labelName,
                color: label.color,
                description: label.description || ''
              });
            } catch (error) {
              // Label might already exist, continue
              console.warn(`Could not create label '${labelName}':`, error);
            }
          }
        }
      }

      // Update the issue
      const octokitIssue = await this.octokitService.updateIssue(issueNumber, {
        title: updateData.title,
        body: updateData.body,
        state: updateData.state,
        labels: updateData.labels,
        assignees: updateData.assignees
      });

      // Convert OctokitIssue to GitHubIssue format
      return this.convertOctokitIssueToGitHubIssue(octokitIssue);
    } catch (error: any) {
      throw new Error(`Failed to update GitHub issue #${issueNumber}: ${error.message}`);
    }
  }

  private async getIssue(issueNumber: number): Promise<GitHubIssue | null> {
    try {
      const octokitIssue = await this.octokitService.getIssue(issueNumber);
      return this.convertOctokitIssueToGitHubIssue(octokitIssue);
    } catch (error: any) {
      // Issue not found or access denied
      if (error.message.includes('404') || error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  private async logEvent(type: string, data: any): Promise<void> {
    await this.eventStore.appendEvent('github-integration', {
      id: this.generateEventId(),
      type,
      timestamp: new Date().toISOString(),
      data
    });
  }

  private generateEventId(): string {
    return `github_evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Convert OctokitIssue to GitHubIssue format for backward compatibility
   */
  private convertOctokitIssueToGitHubIssue(octokitIssue: OctokitIssue): GitHubIssue {
    return {
      id: octokitIssue.id,
      number: octokitIssue.number,
      title: octokitIssue.title,
      body: octokitIssue.body || '',
      state: octokitIssue.state,
      labels: octokitIssue.labels.map(label => ({
        name: label.name,
        color: label.color
      })),
      assignees: octokitIssue.assignees.map(assignee => ({
        login: assignee.login
      })),
      milestone: octokitIssue.milestone ? {
        title: octokitIssue.milestone.title
      } : undefined,
      html_url: octokitIssue.html_url,
      created_at: octokitIssue.created_at,
      updated_at: octokitIssue.updated_at,
      closed_at: octokitIssue.closed_at
    };
  }

  /**
   * Get GitHub connection status
   */
  async getConnectionStatus(): Promise<{ connected: boolean; user?: string; error?: string }> {
    const status = await this.octokitService.checkConnection();
    return {
      connected: status.connected,
      user: status.user?.login,
      error: status.error
    };
  }

  /**
   * Get GitHub rate limit status
   */
  async getRateLimit(): Promise<{ limit: number; remaining: number; reset: Date }> {
    return await this.octokitService.getRateLimit();
  }
}