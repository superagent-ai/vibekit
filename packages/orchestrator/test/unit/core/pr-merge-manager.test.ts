/**
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PRMergeManager, MergeRules, MergeAttempt, PullRequest, CheckStatus, ReviewStatus, MergeRulePresets } from '../../../src/core/pr-merge-manager';
import { JSONStateStore } from '../../../src/storage/json-state-store';
import { JSONLEventStore } from '../../../src/storage/jsonl-event-store';

// Mock the storage classes
vi.mock('../../../src/storage/json-state-store');
vi.mock('../../../src/storage/jsonl-event-store');

describe('PRMergeManager', () => {
  let manager: PRMergeManager;
  let mockStateStore: vi.Mocked<JSONStateStore>;
  let mockEventStore: vi.Mocked<JSONLEventStore>;
  let mockMergeRules: MergeRules;
  let mockPR: PullRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockStateStore = new JSONStateStore() as any;
    mockEventStore = new JSONLEventStore() as any;

    mockMergeRules = {
      enabled: true,
      strategy: 'squash',
      requireChecks: ['ci', 'tests'],
      requireApprovals: 1,
      requireUpToDate: false,
      deleteAfterMerge: true,
      autoMergeLabels: ['auto-merge'],
      skipAutoMergeLabels: ['do-not-merge'],
      allowedUsers: ['trusted-user']
    };

    mockPR = {
      id: 123456,
      number: 42,
      title: 'Test PR',
      body: 'Test PR body',
      state: 'open',
      base: { ref: 'main' },
      head: { 
        ref: 'feature-branch',
        sha: 'abc123def'
      },
      mergeable: true,
      mergeable_state: 'clean',
      merged: false,
      html_url: 'https://github.com/test-owner/test-repo/pull/42',
      statuses_url: 'https://github.com/test-owner/test-repo/statuses/abc123def',
      user: { login: 'trusted-user' }
    };

    manager = new PRMergeManager('test-owner/test-repo', 'test-token', mockMergeRules);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default merge rules', () => {
      const defaultManager = new PRMergeManager('test-owner/test-repo', 'test-token');
      const rules = defaultManager.getMergeRules();

      expect(rules.enabled).toBe(true);
      expect(rules.strategy).toBe('squash');
      expect(rules.requireChecks).toEqual(['ci', 'tests']);
      expect(rules.requireApprovals).toBe(1);
      expect(rules.deleteAfterMerge).toBe(true);
    });

    it('should merge provided rules with defaults', () => {
      const customRules: Partial<MergeRules> = {
        strategy: 'rebase',
        requireApprovals: 2,
        deleteAfterMerge: false
      };

      const customManager = new PRMergeManager('test-owner/test-repo', 'test-token', customRules);
      const rules = customManager.getMergeRules();

      expect(rules.strategy).toBe('rebase');
      expect(rules.requireApprovals).toBe(2);
      expect(rules.deleteAfterMerge).toBe(false);
      expect(rules.enabled).toBe(true); // Default preserved
    });
  });

  describe('attemptAutoMerge', () => {
    beforeEach(() => {
      // Mock the private methods
      vi.spyOn(manager as any, 'getPullRequest').mockResolvedValue(mockPR);
      vi.spyOn(manager as any, 'getPRLabels').mockResolvedValue([
        { name: 'auto-merge', color: '0052cc' }
      ]);
      vi.spyOn(manager as any, 'getCheckStatus').mockResolvedValue({
        state: 'success',
        statuses: [
          { state: 'success', context: 'ci', description: 'CI passed' },
          { state: 'success', context: 'tests', description: 'Tests passed' }
        ]
      } as CheckStatus);
      vi.spyOn(manager as any, 'getReviewStatus').mockResolvedValue({
        totalReviews: 1,
        approvedReviews: 1,
        requestedChanges: 0,
        dismissedReviews: 0,
        reviews: [{
          user: { login: 'reviewer1' },
          state: 'APPROVED',
          submitted_at: new Date().toISOString()
        }]
      } as ReviewStatus);
      vi.spyOn(manager as any, 'isBranchUpToDate').mockResolvedValue(true);
      vi.spyOn(manager as any, 'mergePullRequest').mockResolvedValue({
        merged: true,
        sha: 'merged123',
        message: 'Merged successfully'
      });
      vi.spyOn(manager as any, 'deleteBranch').mockResolvedValue(undefined);
      vi.spyOn(manager as any, 'storeAttempt').mockResolvedValue(undefined);
      mockEventStore.appendEvent.mockResolvedValue();
    });

    it('should successfully auto-merge a qualifying PR', async () => {
      const result = await manager.attemptAutoMerge(42, 'task-123');

      expect(result.status).toBe('success');
      expect(result.prNumber).toBe(42);
      expect(result.taskId).toBe('task-123');
      expect(result.mergeCommitSha).toBe('merged123');
      expect(result.deletedBranch).toBe(true);

      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('pr-merge',
        expect.objectContaining({
          type: 'pr.auto_merge_success'
        })
      );
    });

    it('should skip merge when auto-merge is disabled', async () => {
      const disabledManager = new PRMergeManager('test-owner/test-repo', 'test-token', {
        ...mockMergeRules,
        enabled: false
      });

      vi.spyOn(disabledManager as any, 'getPullRequest').mockResolvedValue(mockPR);
      vi.spyOn(disabledManager as any, 'storeAttempt').mockResolvedValue(undefined);

      const result = await disabledManager.attemptAutoMerge(42);

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('Auto-merge is disabled');
    });

    it('should skip merge for closed PR', async () => {
      const closedPR = { ...mockPR, state: 'closed' as const };
      vi.spyOn(manager as any, 'getPullRequest').mockResolvedValue(closedPR);

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('PR is closed');
    });

    it('should skip merge for already merged PR', async () => {
      const mergedPR = { ...mockPR, merged: true };
      vi.spyOn(manager as any, 'getPullRequest').mockResolvedValue(mergedPR);

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('PR is already merged');
    });

    it('should fail merge when PR is not mergeable', async () => {
      const unmergeablePR = { 
        ...mockPR, 
        mergeable: false,
        mergeable_state: 'dirty'
      };
      vi.spyOn(manager as any, 'getPullRequest').mockResolvedValue(unmergeablePR);

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('PR has merge conflicts');
    });

    it('should skip merge when required labels are missing', async () => {
      vi.spyOn(manager as any, 'getPRLabels').mockResolvedValue([
        { name: 'bug', color: 'd73a49' }
      ]); // Missing 'auto-merge' label

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('skipped');
      expect(result.reason).toContain('missing required auto-merge label');
    });

    it('should skip merge when skip labels are present', async () => {
      vi.spyOn(manager as any, 'getPRLabels').mockResolvedValue([
        { name: 'auto-merge', color: '0052cc' },
        { name: 'do-not-merge', color: 'd73a49' }
      ]);

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('PR has skip label: do-not-merge');
    });

    it('should skip merge when user is not allowed', async () => {
      const unauthorizedPR = {
        ...mockPR,
        user: { login: 'untrusted-user' }
      };
      vi.spyOn(manager as any, 'getPullRequest').mockResolvedValue(unauthorizedPR);

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('skipped');
      expect(result.reason).toBe('User untrusted-user is not in allowed users list');
    });

    it('should fail merge when required checks are not passing', async () => {
      vi.spyOn(manager as any, 'getCheckStatus').mockResolvedValue({
        state: 'failure',
        statuses: [
          { state: 'success', context: 'ci', description: 'CI passed' },
          { state: 'failure', context: 'tests', description: 'Tests failed' }
        ]
      } as CheckStatus);

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('Required checks are not passing');
    });

    it('should fail merge when insufficient approvals', async () => {
      vi.spyOn(manager as any, 'getReviewStatus').mockResolvedValue({
        totalReviews: 1,
        approvedReviews: 0,
        requestedChanges: 0,
        dismissedReviews: 1,
        reviews: []
      } as ReviewStatus);

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('Insufficient approvals (0/1 required)');
    });

    it('should fail merge when there are requested changes', async () => {
      vi.spyOn(manager as any, 'getReviewStatus').mockResolvedValue({
        totalReviews: 2,
        approvedReviews: 1,
        requestedChanges: 1,
        dismissedReviews: 0,
        reviews: []
      } as ReviewStatus);

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('PR has requested changes');
    });

    it('should fail merge when branch is not up to date', async () => {
      const strictManager = new PRMergeManager('test-owner/test-repo', 'test-token', {
        ...mockMergeRules,
        requireUpToDate: true
      });

      vi.spyOn(strictManager as any, 'getPullRequest').mockResolvedValue(mockPR);
      vi.spyOn(strictManager as any, 'getPRLabels').mockResolvedValue([{ name: 'auto-merge', color: '0052cc' }]);
      vi.spyOn(strictManager as any, 'getCheckStatus').mockResolvedValue({
        state: 'success',
        statuses: [
          { state: 'success', context: 'ci', description: 'CI passed' },
          { state: 'success', context: 'tests', description: 'Tests passed' }
        ]
      } as CheckStatus);
      vi.spyOn(strictManager as any, 'getReviewStatus').mockResolvedValue({
        approvedReviews: 1,
        requestedChanges: 0
      } as ReviewStatus);
      vi.spyOn(strictManager as any, 'isBranchUpToDate').mockResolvedValue(false);
      vi.spyOn(strictManager as any, 'storeAttempt').mockResolvedValue(undefined);

      const result = await strictManager.attemptAutoMerge(42);

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('Branch is not up to date with base');
    });

    it('should handle merge errors gracefully', async () => {
      vi.spyOn(manager as any, 'mergePullRequest').mockRejectedValue(new Error('GitHub API error'));

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('GitHub API error');
      expect(mockEventStore.appendEvent).toHaveBeenCalledWith('pr-merge',
        expect.objectContaining({
          type: 'pr.auto_merge_failed'
        })
      );
    });

    it('should handle branch deletion failures without failing merge', async () => {
      vi.spyOn(manager as any, 'deleteBranch').mockRejectedValue(new Error('Branch deletion failed'));

      const result = await manager.attemptAutoMerge(42);

      expect(result.status).toBe('success'); // Merge should still succeed
      expect(result.deletedBranch).toBeUndefined(); // Branch wasn't deleted
    });

    it('should return null when PR is not found', async () => {
      vi.spyOn(manager as any, 'getPullRequest').mockResolvedValue(null);

      const result = await manager.attemptAutoMerge(999);

      expect(result.status).toBe('failed');
      expect(result.reason).toBe('Pull request not found');
    });
  });

  describe('checkMergeability', () => {
    it('should return true for mergeable PR', async () => {
      const result = await manager.checkMergeability(mockPR);

      expect(result.canMerge).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should return false for PR with merge conflicts', async () => {
      const conflictedPR = { 
        ...mockPR, 
        mergeable: false,
        mergeable_state: 'dirty'
      };

      const result = await manager.checkMergeability(conflictedPR);

      expect(result.canMerge).toBe(false);
      expect(result.reason).toBe('PR has merge conflicts');
    });

    it('should return false for blocked PR', async () => {
      const blockedPR = { 
        ...mockPR, 
        mergeable_state: 'blocked'
      };

      const result = await manager.checkMergeability(blockedPR);

      expect(result.canMerge).toBe(false);
      expect(result.reason).toBe('PR is blocked by branch protection rules');
    });
  });

  describe('areChecksSuccessful', () => {
    it('should return true when all required checks pass', () => {
      const checkStatus: CheckStatus = {
        state: 'success',
        statuses: [
          { state: 'success', context: 'ci', description: 'CI passed' },
          { state: 'success', context: 'tests', description: 'Tests passed' },
          { state: 'success', context: 'lint', description: 'Linting passed' }
        ]
      };

      const result = manager.areChecksSuccessful(checkStatus);
      expect(result).toBe(true);
    });

    it('should return false when overall state is not success', () => {
      const checkStatus: CheckStatus = {
        state: 'failure',
        statuses: [
          { state: 'success', context: 'ci', description: 'CI passed' },
          { state: 'failure', context: 'tests', description: 'Tests failed' }
        ]
      };

      const result = manager.areChecksSuccessful(checkStatus);
      expect(result).toBe(false);
    });

    it('should return false when required check is missing', () => {
      const checkStatus: CheckStatus = {
        state: 'success',
        statuses: [
          { state: 'success', context: 'ci', description: 'CI passed' }
          // Missing 'tests' check
        ]
      };

      const result = manager.areChecksSuccessful(checkStatus);
      expect(result).toBe(false);
    });

    it('should return false when required check fails', () => {
      const checkStatus: CheckStatus = {
        state: 'success',
        statuses: [
          { state: 'success', context: 'ci', description: 'CI passed' },
          { state: 'failure', context: 'tests', description: 'Tests failed' }
        ]
      };

      const result = manager.areChecksSuccessful(checkStatus);
      expect(result).toBe(false);
    });
  });

  describe('hasRequiredApprovals', () => {
    it('should return true when sufficient approvals', () => {
      const reviewStatus: ReviewStatus = {
        totalReviews: 2,
        approvedReviews: 2,
        requestedChanges: 0,
        dismissedReviews: 0,
        reviews: []
      };

      const result = manager.hasRequiredApprovals(reviewStatus);
      expect(result).toBe(true);
    });

    it('should return false when insufficient approvals', () => {
      const reviewStatus: ReviewStatus = {
        totalReviews: 1,
        approvedReviews: 0,
        requestedChanges: 0,
        dismissedReviews: 1,
        reviews: []
      };

      const result = manager.hasRequiredApprovals(reviewStatus);
      expect(result).toBe(false);
    });
  });

  describe('hasRequestedChanges', () => {
    it('should return false when no requested changes', () => {
      const reviewStatus: ReviewStatus = {
        totalReviews: 1,
        approvedReviews: 1,
        requestedChanges: 0,
        dismissedReviews: 0,
        reviews: []
      };

      const result = manager.hasRequestedChanges(reviewStatus);
      expect(result).toBe(false);
    });

    it('should return true when there are requested changes', () => {
      const reviewStatus: ReviewStatus = {
        totalReviews: 2,
        approvedReviews: 1,
        requestedChanges: 1,
        dismissedReviews: 0,
        reviews: []
      };

      const result = manager.hasRequestedChanges(reviewStatus);
      expect(result).toBe(true);
    });
  });

  describe('updateMergeRules', () => {
    it('should update merge rules and persist to storage', async () => {
      mockStateStore.saveState.mockResolvedValue();

      const updates: Partial<MergeRules> = {
        strategy: 'rebase',
        requireApprovals: 2,
        deleteAfterMerge: false
      };

      await manager.updateMergeRules(updates);

      const updatedRules = manager.getMergeRules();
      expect(updatedRules.strategy).toBe('rebase');
      expect(updatedRules.requireApprovals).toBe(2);
      expect(updatedRules.deleteAfterMerge).toBe(false);
      expect(updatedRules.enabled).toBe(true); // Unchanged

      expect(mockStateStore.saveState).toHaveBeenCalledWith('pr-merge-rules', updatedRules);
    });
  });

  describe('getMergeAttempts', () => {
    it('should retrieve merge attempts for a PR', async () => {
      const mockAttempts: MergeAttempt[] = [
        {
          prNumber: 42,
          taskId: 'task-123',
          attemptedAt: new Date(),
          status: 'success',
          strategy: 'squash',
          mergeCommitSha: 'merged123'
        }
      ];

      mockStateStore.loadState.mockResolvedValue(mockAttempts);

      const result = await manager.getMergeAttempts(42);

      expect(result).toEqual(mockAttempts);
      expect(mockStateStore.loadState).toHaveBeenCalledWith('pr-merge-attempts/42');
    });

    it('should return empty array when no attempts exist', async () => {
      mockStateStore.loadState.mockResolvedValue(null);

      const result = await manager.getMergeAttempts(42);

      expect(result).toEqual([]);
    });
  });

  describe('MergeRulePresets', () => {
    it('should provide production preset', () => {
      const rules = MergeRulePresets.production();

      expect(rules.enabled).toBe(true);
      expect(rules.strategy).toBe('squash');
      expect(rules.requireChecks).toContain('security');
      expect(rules.requireApprovals).toBe(2);
      expect(rules.requireUpToDate).toBe(true);
      expect(rules.autoMergeLabels).toContain('auto-merge');
      expect(rules.skipAutoMergeLabels).toContain('do-not-merge');
    });

    it('should provide development preset', () => {
      const rules = MergeRulePresets.development();

      expect(rules.enabled).toBe(true);
      expect(rules.strategy).toBe('squash');
      expect(rules.requireApprovals).toBe(1);
      expect(rules.requireUpToDate).toBe(false);
      expect(rules.requireChecks).not.toContain('security');
    });

    it('should provide personal preset', () => {
      const rules = MergeRulePresets.personal();

      expect(rules.enabled).toBe(true);
      expect(rules.strategy).toBe('squash');
      expect(rules.requireApprovals).toBe(0);
      expect(rules.requireChecks).toEqual(['ci']);
    });

    it('should provide opensource preset', () => {
      const rules = MergeRulePresets.opensource();

      expect(rules.enabled).toBe(true);
      expect(rules.strategy).toBe('merge');
      expect(rules.requireApprovals).toBe(2);
      expect(rules.deleteAfterMerge).toBe(false);
      expect(rules.requireChecks).toContain('license-check');
    });
  });
});