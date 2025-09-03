/**
 * GitHub Configuration Management
 * 
 * Manages GitHub integration settings and configuration for
 * the VibeKit orchestrator.
 */

import { JSONStateStore } from '../storage/json-state-store';
import type { GitHubConfig } from './github-integration-manager';

export interface GitHubConfigOptions {
  repository: string;
  token?: string;
  defaultBranch?: string;
  issueTemplates?: {
    task?: string;
    bug?: string;
    feature?: string;
  };
  labels?: {
    taskPending?: string;
    taskInProgress?: string;
    taskCompleted?: string;
    taskFailed?: string;
    priority?: {
      high?: string;
      medium?: string;
      low?: string;
    };
  };
  autoAssign?: string[];
  milestoneMapping?: Record<string, string>;
  autoMerge?: {
    enabled: boolean;
    strategy: 'squash' | 'merge' | 'rebase';
    requireChecks: string[];
    requireApprovals: number;
    deleteAfterMerge: boolean;
  };
}

export class GitHubConfigManager {
  private stateStore = new JSONStateStore();
  private config: GitHubConfig | null = null;

  /**
   * Load GitHub configuration from storage or environment
   */
  async loadConfig(options?: Partial<GitHubConfigOptions>): Promise<GitHubConfig> {
    // Try to load from storage first
    let storedConfig = await this.stateStore.loadState<GitHubConfig>('config/github');
    
    // Apply defaults and merge with options
    this.config = this.mergeWithDefaults(storedConfig, options);
    
    // Validate required fields
    this.validateConfig(this.config);
    
    return this.config;
  }

  /**
   * Save GitHub configuration to storage
   */
  async saveConfig(config: GitHubConfig): Promise<void> {
    this.validateConfig(config);
    this.config = config;
    await this.stateStore.saveState('config/github', config);
  }

  /**
   * Update specific configuration fields
   */
  async updateConfig(updates: Partial<GitHubConfig>): Promise<GitHubConfig> {
    if (!this.config) {
      throw new Error('No GitHub configuration loaded. Call loadConfig() first.');
    }

    const updatedConfig = {
      ...this.config,
      ...updates,
      labels: {
        ...this.config.labels,
        ...updates.labels,
        priority: {
          ...this.config.labels.priority,
          ...updates.labels?.priority
        }
      }
    };

    await this.saveConfig(updatedConfig);
    return updatedConfig;
  }

  /**
   * Get current configuration
   */
  getCurrentConfig(): GitHubConfig | null {
    return this.config;
  }

  /**
   * Check if GitHub is properly configured
   */
  isConfigured(): boolean {
    return !!(this.config?.repository && this.config?.token);
  }

  /**
   * Create default configuration for a repository
   */
  static createDefaultConfig(repository: string, token?: string): GitHubConfig {
    return {
      repository,
      token: token || process.env.GITHUB_TOKEN || '',
      defaultBranch: 'main',
      issueTemplates: {
        task: '.github/ISSUE_TEMPLATE/task.md',
        bug: '.github/ISSUE_TEMPLATE/bug.md',
        feature: '.github/ISSUE_TEMPLATE/feature.md'
      },
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
      autoAssign: [],
      milestoneMapping: {}
    };
  }

  /**
   * Get configuration from environment variables
   */
  static getConfigFromEnv(): Partial<GitHubConfig> {
    const repository = process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    const defaultBranch = process.env.GITHUB_DEFAULT_BRANCH;

    const config: Partial<GitHubConfig> = {};

    if (repository) config.repository = repository;
    if (token) config.token = token;
    if (defaultBranch) config.defaultBranch = defaultBranch;

    return config;
  }

  /**
   * Auto-detect configuration from git repository
   */
  static async autoDetectConfig(): Promise<Partial<GitHubConfig>> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Get git remote URL
      const { stdout } = await execAsync('git config --get remote.origin.url');
      const remoteUrl = stdout.trim();

      // Parse GitHub repository from URL
      const githubMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (githubMatch) {
        const owner = githubMatch[1];
        const repo = githubMatch[2];
        const repository = `${owner}/${repo}`;

        return {
          repository,
          token: process.env.GITHUB_TOKEN
        };
      }
    } catch (error) {
      // Git not available or not a git repository
    }

    return {};
  }

  private mergeWithDefaults(
    stored: GitHubConfig | null, 
    options?: Partial<GitHubConfigOptions>
  ): GitHubConfig {
    // Get environment config
    const envConfig = GitHubConfigManager.getConfigFromEnv();
    
    // Start with stored config or defaults
    const base = stored || (options?.repository ? 
      GitHubConfigManager.createDefaultConfig(options.repository) :
      { repository: '', token: '', defaultBranch: 'main', labels: { taskPending: '', taskInProgress: '', taskCompleted: '', taskFailed: '', priority: { high: '', medium: '', low: '' } } } as GitHubConfig
    );

    // Merge in order: base → env → options
    return {
      ...base,
      ...envConfig,
      ...options,
      labels: {
        ...base.labels,
        ...envConfig.labels,
        ...options?.labels,
        priority: {
          ...base.labels?.priority,
          ...envConfig.labels?.priority,
          ...options?.labels?.priority
        }
      }
    };
  }

  private validateConfig(config: GitHubConfig): void {
    if (!config.repository) {
      throw new Error('GitHub repository is required. Format: "owner/repo"');
    }

    if (!config.token) {
      throw new Error('GitHub token is required. Set GITHUB_TOKEN environment variable or provide in configuration.');
    }

    // Validate repository format
    if (!config.repository.includes('/') || config.repository.split('/').length !== 2) {
      throw new Error('Invalid repository format. Expected "owner/repo"');
    }

    // Validate labels exist
    if (!config.labels || !config.labels.taskPending) {
      throw new Error('GitHub labels configuration is required');
    }
  }
}

// Configuration presets for common setups
export const GitHubConfigPresets = {
  /**
   * Standard VibeKit orchestrator setup
   */
  standard: (repository: string): GitHubConfigOptions => ({
    repository,
    defaultBranch: 'main',
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
    },
    autoMerge: {
      enabled: true,
      strategy: 'squash',
      requireChecks: ['ci', 'tests'],
      requireApprovals: 1,
      deleteAfterMerge: true
    }
  }),

  /**
   * Enterprise setup with strict requirements
   */
  enterprise: (repository: string): GitHubConfigOptions => ({
    repository,
    defaultBranch: 'main',
    labels: {
      taskPending: 'status/pending',
      taskInProgress: 'status/in-progress',
      taskCompleted: 'status/completed',
      taskFailed: 'status/failed',
      priority: {
        high: 'priority/critical',
        medium: 'priority/normal',
        low: 'priority/low'
      }
    },
    autoMerge: {
      enabled: false, // Manual approval required
      strategy: 'merge',
      requireChecks: ['ci', 'tests', 'security-scan', 'code-quality'],
      requireApprovals: 2,
      deleteAfterMerge: true
    }
  }),

  /**
   * Simple setup for personal projects
   */
  simple: (repository: string): GitHubConfigOptions => ({
    repository,
    defaultBranch: 'main',
    labels: {
      taskPending: 'todo',
      taskInProgress: 'doing',
      taskCompleted: 'done',
      taskFailed: 'blocked',
      priority: {
        high: 'urgent',
        medium: 'normal',
        low: 'low'
      }
    },
    autoMerge: {
      enabled: true,
      strategy: 'squash',
      requireChecks: ['ci'],
      requireApprovals: 0,
      deleteAfterMerge: true
    }
  })
};