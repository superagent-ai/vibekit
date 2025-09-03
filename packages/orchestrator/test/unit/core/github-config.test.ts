/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { GitHubConfigManager, GitHubConfigOptions, GitHubConfigPresets } from '../../../src/core/github-config';
import { GitHubConfig } from '../../../src/core/github-integration-manager';
import { JSONStateStore } from '../../../src/storage/json-state-store';

// Mock the storage classes
vi.mock('../../../src/storage/json-state-store');

// Mock child_process for git commands
vi.mock('child_process', () => ({
  exec: vi.fn()
}));

describe('GitHubConfigManager', () => {
  let manager: GitHubConfigManager;
  let mockStateStore: vi.Mocked<JSONStateStore>;
  
  beforeEach(() => {
    vi.clearAllMocks();
    mockStateStore = new JSONStateStore() as any;
    manager = new GitHubConfigManager();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clear environment variables
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_DEFAULT_BRANCH;
  });

  describe('loadConfig', () => {
    it('should load configuration from storage when available', async () => {
      const storedConfig: GitHubConfig = {
        repository: 'stored-owner/stored-repo',
        token: 'stored-token',
        defaultBranch: 'develop',
        labels: {
          taskPending: 'stored: pending',
          taskInProgress: 'stored: in-progress',
          taskCompleted: 'stored: completed',
          taskFailed: 'stored: failed',
          priority: {
            high: 'stored: high',
            medium: 'stored: medium',
            low: 'stored: low'
          }
        },
        autoAssign: ['stored-user'],
        milestoneMapping: { 'epic-1': 'milestone-1' }
      };

      mockStateStore.loadState.mockResolvedValue(storedConfig);

      const result = await manager.loadConfig();

      expect(result).toEqual(storedConfig);
      expect(mockStateStore.loadState).toHaveBeenCalledWith('config/github');
    });

    it('should create default config when no stored config and repository provided', async () => {
      mockStateStore.loadState.mockResolvedValue(null);

      const options: Partial<GitHubConfigOptions> = {
        repository: 'test-owner/test-repo',
        token: 'test-token'
      };

      const result = await manager.loadConfig(options);

      expect(result.repository).toBe('test-owner/test-repo');
      expect(result.token).toBe('test-token');
      expect(result.defaultBranch).toBe('main');
      expect(result.labels.taskPending).toBe('status: pending');
    });

    it('should merge environment variables with config', async () => {
      process.env.GITHUB_REPOSITORY = 'env-owner/env-repo';
      process.env.GITHUB_TOKEN = 'env-token';
      process.env.GITHUB_DEFAULT_BRANCH = 'env-main';

      mockStateStore.loadState.mockResolvedValue(null);

      const options: Partial<GitHubConfigOptions> = {
        repository: 'options-owner/options-repo'
      };

      const result = await manager.loadConfig(options);

      // Environment should override stored, options should override environment
      expect(result.repository).toBe('options-owner/options-repo');
      expect(result.token).toBe('env-token');
      expect(result.defaultBranch).toBe('env-main');
    });

    it('should throw error for invalid repository format', async () => {
      mockStateStore.loadState.mockResolvedValue(null);

      const options: Partial<GitHubConfigOptions> = {
        repository: 'invalid-repo-format'
      };

      await expect(manager.loadConfig(options)).rejects.toThrow(
        'Invalid repository format. Expected "owner/repo"'
      );
    });

    it('should throw error when no repository is provided', async () => {
      mockStateStore.loadState.mockResolvedValue(null);

      await expect(manager.loadConfig()).rejects.toThrow(
        'GitHub repository is required. Format: "owner/repo"'
      );
    });

    it('should throw error when no token is provided', async () => {
      mockStateStore.loadState.mockResolvedValue(null);

      const options: Partial<GitHubConfigOptions> = {
        repository: 'test-owner/test-repo'
        // No token provided and no environment variable
      };

      await expect(manager.loadConfig(options)).rejects.toThrow(
        'GitHub token is required'
      );
    });
  });

  describe('saveConfig', () => {
    it('should save valid configuration to storage', async () => {
      const config: GitHubConfig = {
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

      mockStateStore.saveState.mockResolvedValue();

      await manager.saveConfig(config);

      expect(mockStateStore.saveState).toHaveBeenCalledWith('config/github', config);
    });

    it('should throw error for invalid configuration', async () => {
      const invalidConfig = {
        repository: '', // Invalid: empty repository
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
        }
      } as GitHubConfig;

      await expect(manager.saveConfig(invalidConfig)).rejects.toThrow(
        'GitHub repository is required'
      );
    });
  });

  describe('updateConfig', () => {
    beforeEach(async () => {
      const initialConfig: GitHubConfig = {
        repository: 'initial-owner/initial-repo',
        token: 'initial-token',
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
        autoAssign: [],
        milestoneMapping: {}
      };

      mockStateStore.loadState.mockResolvedValue(initialConfig);
      mockStateStore.saveState.mockResolvedValue();
      
      await manager.loadConfig();
    });

    it('should update specific configuration fields', async () => {
      const updates = {
        token: 'updated-token',
        autoAssign: ['new-user']
      };

      const result = await manager.updateConfig(updates);

      expect(result.token).toBe('updated-token');
      expect(result.autoAssign).toEqual(['new-user']);
      expect(result.repository).toBe('initial-owner/initial-repo'); // Unchanged
      expect(mockStateStore.saveState).toHaveBeenCalledWith('config/github', result);
    });

    it('should merge label updates correctly', async () => {
      const updates = {
        labels: {
          taskPending: 'updated: pending',
          priority: {
            high: 'updated: high'
            // medium and low should be preserved
          }
        }
      };

      const result = await manager.updateConfig(updates);

      expect(result.labels.taskPending).toBe('updated: pending');
      expect(result.labels.taskInProgress).toBe('status: in-progress'); // Unchanged
      expect(result.labels.priority.high).toBe('updated: high');
      expect(result.labels.priority.medium).toBe('priority: medium'); // Preserved
      expect(result.labels.priority.low).toBe('priority: low'); // Preserved
    });

    it('should throw error when no config is loaded', async () => {
      const freshManager = new GitHubConfigManager();

      await expect(freshManager.updateConfig({ token: 'new-token' })).rejects.toThrow(
        'No GitHub configuration loaded. Call loadConfig() first.'
      );
    });
  });

  describe('getCurrentConfig', () => {
    it('should return null when no config is loaded', () => {
      const result = manager.getCurrentConfig();
      expect(result).toBeNull();
    });

    it('should return current config after loading', async () => {
      const config: GitHubConfig = {
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
        autoAssign: [],
        milestoneMapping: {}
      };

      mockStateStore.loadState.mockResolvedValue(config);
      await manager.loadConfig();

      const result = manager.getCurrentConfig();
      expect(result).toEqual(config);
    });
  });

  describe('isConfigured', () => {
    it('should return false when no config is loaded', () => {
      expect(manager.isConfigured()).toBe(false);
    });

    it('should return false when repository is missing', async () => {
      const config = {
        repository: '', // Missing
        token: 'test-token',
        defaultBranch: 'main',
        labels: {
          taskPending: 'status: pending',
          taskInProgress: 'status: in-progress',
          taskCompleted: 'status: completed',
          taskFailed: 'status: failed',
          priority: { high: '', medium: '', low: '' }
        }
      } as GitHubConfig;

      mockStateStore.loadState.mockResolvedValue(config);
      
      try {
        await manager.loadConfig();
      } catch (error) {
        // Expected to throw during validation
      }

      expect(manager.isConfigured()).toBe(false);
    });

    it('should return false when token is missing', async () => {
      const config = {
        repository: 'test-owner/test-repo',
        token: '', // Missing
        defaultBranch: 'main',
        labels: {
          taskPending: 'status: pending',
          taskInProgress: 'status: in-progress',
          taskCompleted: 'status: completed',
          taskFailed: 'status: failed',
          priority: { high: '', medium: '', low: '' }
        }
      } as GitHubConfig;

      mockStateStore.loadState.mockResolvedValue(config);
      
      try {
        await manager.loadConfig();
      } catch (error) {
        // Expected to throw during validation
      }

      expect(manager.isConfigured()).toBe(false);
    });

    it('should return true when properly configured', async () => {
      const config: GitHubConfig = {
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
        autoAssign: [],
        milestoneMapping: {}
      };

      mockStateStore.loadState.mockResolvedValue(config);
      await manager.loadConfig();

      expect(manager.isConfigured()).toBe(true);
    });
  });

  describe('static methods', () => {
    describe('createDefaultConfig', () => {
      it('should create default configuration with repository', () => {
        const result = GitHubConfigManager.createDefaultConfig('test-owner/test-repo');

        expect(result.repository).toBe('test-owner/test-repo');
        expect(result.defaultBranch).toBe('main');
        expect(result.labels.taskPending).toBe('status: pending');
        expect(result.autoAssign).toEqual([]);
      });

      it('should use provided token over environment', () => {
        process.env.GITHUB_TOKEN = 'env-token';
        
        const result = GitHubConfigManager.createDefaultConfig('test-owner/test-repo', 'provided-token');

        expect(result.token).toBe('provided-token');
      });

      it('should use environment token when none provided', () => {
        process.env.GITHUB_TOKEN = 'env-token';
        
        const result = GitHubConfigManager.createDefaultConfig('test-owner/test-repo');

        expect(result.token).toBe('env-token');
      });
    });

    describe('getConfigFromEnv', () => {
      it('should extract configuration from environment variables', () => {
        process.env.GITHUB_REPOSITORY = 'env-owner/env-repo';
        process.env.GITHUB_TOKEN = 'env-token';
        process.env.GITHUB_DEFAULT_BRANCH = 'develop';

        const result = GitHubConfigManager.getConfigFromEnv();

        expect(result.repository).toBe('env-owner/env-repo');
        expect(result.token).toBe('env-token');
        expect(result.defaultBranch).toBe('develop');
      });

      it('should return empty object when no environment variables set', () => {
        const result = GitHubConfigManager.getConfigFromEnv();

        expect(result).toEqual({});
      });
    });

    describe('autoDetectConfig', () => {
      it('should auto-detect GitHub repository from git remote', async () => {
        const mockExec = vi.fn().mockResolvedValue({
          stdout: 'git@github.com:test-owner/test-repo.git\n'
        });

        vi.doMock('child_process', () => ({
          exec: mockExec
        }));

        const { promisify } = await import('util');
        vi.mocked(promisify).mockReturnValue(mockExec);

        process.env.GITHUB_TOKEN = 'auto-token';

        const result = await GitHubConfigManager.autoDetectConfig();

        expect(result.repository).toBe('test-owner/test-repo');
        expect(result.token).toBe('auto-token');
      });

      it('should handle HTTPS GitHub URLs', async () => {
        const mockExec = vi.fn().mockResolvedValue({
          stdout: 'https://github.com/test-owner/test-repo.git\n'
        });

        vi.doMock('child_process', () => ({
          exec: mockExec
        }));

        const { promisify } = await import('util');
        vi.mocked(promisify).mockReturnValue(mockExec);

        const result = await GitHubConfigManager.autoDetectConfig();

        expect(result.repository).toBe('test-owner/test-repo');
      });

      it('should return empty config when git command fails', async () => {
        const mockExec = vi.fn().mockRejectedValue(new Error('Git not found'));

        vi.doMock('child_process', () => ({
          exec: mockExec
        }));

        const { promisify } = await import('util');
        vi.mocked(promisify).mockReturnValue(mockExec);

        const result = await GitHubConfigManager.autoDetectConfig();

        expect(result).toEqual({});
      });

      it('should return empty config for non-GitHub remotes', async () => {
        const mockExec = vi.fn().mockResolvedValue({
          stdout: 'git@gitlab.com:test-owner/test-repo.git\n'
        });

        vi.doMock('child_process', () => ({
          exec: mockExec
        }));

        const { promisify } = await import('util');
        vi.mocked(promisify).mockReturnValue(mockExec);

        const result = await GitHubConfigManager.autoDetectConfig();

        expect(result).toEqual({});
      });
    });
  });

  describe('GitHubConfigPresets', () => {
    it('should provide standard preset configuration', () => {
      const config = GitHubConfigPresets.standard('test-owner/test-repo');

      expect(config.repository).toBe('test-owner/test-repo');
      expect(config.defaultBranch).toBe('main');
      expect(config.labels?.taskPending).toBe('🔄 pending');
      expect(config.autoMerge?.enabled).toBe(true);
      expect(config.autoMerge?.strategy).toBe('squash');
    });

    it('should provide enterprise preset configuration', () => {
      const config = GitHubConfigPresets.enterprise('enterprise-owner/enterprise-repo');

      expect(config.repository).toBe('enterprise-owner/enterprise-repo');
      expect(config.labels?.taskPending).toBe('status/pending');
      expect(config.autoMerge?.enabled).toBe(false); // Manual approval required
      expect(config.autoMerge?.requireApprovals).toBe(2);
      expect(config.autoMerge?.requireChecks).toContain('security-scan');
    });

    it('should provide simple preset configuration', () => {
      const config = GitHubConfigPresets.simple('simple-owner/simple-repo');

      expect(config.repository).toBe('simple-owner/simple-repo');
      expect(config.labels?.taskPending).toBe('todo');
      expect(config.labels?.taskCompleted).toBe('done');
      expect(config.autoMerge?.requireApprovals).toBe(0);
      expect(config.autoMerge?.requireChecks).toEqual(['ci']);
    });
  });
});