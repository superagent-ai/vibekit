/**
 * PR Merge Manager
 * 
 * Handles automated pull request merging based on configurable rules
 * including CI checks, approvals, and merge strategies.
 */

import { EventEmitter } from 'events';
import { JSONStateStore } from '../storage/json-state-store';
import { JSONLEventStore } from '../storage/jsonl-event-store';
import { OctokitService, type OctokitServiceConfig } from '../services/octokit-service';
import type { PRResult } from '../utils/github-api';

// GitHub PR types (simplified)
export interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  base: {
    ref: string;
  };
  head: {
    ref: string;
    sha: string;
  };
  mergeable?: boolean;
  mergeable_state?: string;
  merged: boolean;
  merged_at?: string;
  html_url: string;
  statuses_url: string;
  user: {
    login: string;
  };
}

export interface CheckStatus {
  state: 'pending' | 'success' | 'failure' | 'error';
  statuses: Array<{
    state: 'pending' | 'success' | 'failure' | 'error';
    context: string;
    description: string;
    target_url?: string;
  }>;
}

export interface ReviewStatus {
  totalReviews: number;
  approvedReviews: number;
  requestedChanges: number;
  dismissedReviews: number;
  reviews: Array<{
    user: { login: string };
    state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
    submitted_at: string;
  }>;
}

export type MergeStrategy = 'merge' | 'squash' | 'rebase';

export interface MergeRules {
  enabled: boolean;
  strategy: MergeStrategy;
  requireChecks: string[]; // List of required check contexts
  requireApprovals: number; // Minimum number of approvals
  requireUpToDate: boolean; // Require branch to be up to date
  deleteAfterMerge: boolean; // Delete branch after merge
  autoMergeLabels?: string[]; // Only auto-merge PRs with these labels
  skipAutoMergeLabels?: string[]; // Never auto-merge PRs with these labels
  allowedUsers?: string[]; // Only auto-merge PRs from these users
  requiredStatusChecks?: string[]; // Required status check contexts
}

export interface MergeAttempt {
  prNumber: number;
  taskId?: string;
  attemptedAt: Date;
  status: 'pending' | 'success' | 'failed' | 'skipped';
  reason?: string;
  mergeCommitSha?: string;
  strategy: MergeStrategy;
  deletedBranch?: boolean;
}

export class PRMergeManager extends EventEmitter {
  private stateStore = new JSONStateStore();
  private eventStore = new JSONLEventStore();
  private mergeRules: MergeRules;
  private pendingMerges = new Map<number, MergeAttempt>();
  private repository: string;
  private token: string;
  private octokitService: OctokitService;

  constructor(repository: string, token: string, mergeRules: Partial<MergeRules> = {}) {
    super();
    this.repository = repository;
    this.token = token;
    
    // Initialize Octokit service with fail-fast behavior
    if (!token) {
      throw new Error('GitHub token is required. Set GITHUB_TOKEN environment variable.');
    }
    
    this.octokitService = new OctokitService({
      token,
      repository,
      userAgent: 'VibeKit-PRMergeManager/1.0'
    });
    
    // Apply default merge rules
    this.mergeRules = {
      enabled: true,
      strategy: 'squash',
      requireChecks: ['ci', 'tests'],
      requireApprovals: 1,
      requireUpToDate: false,
      deleteAfterMerge: true,
      ...mergeRules
    };
  }

  /**
   * Attempt to auto-merge a pull request
   */
  async attemptAutoMerge(prNumber: number, taskId?: string): Promise<MergeAttempt> {
    this.emit('mergeAttemptStarted', { prNumber, taskId });

    const attempt: MergeAttempt = {
      prNumber,
      taskId,
      attemptedAt: new Date(),
      status: 'pending',
      strategy: this.mergeRules.strategy
    };

    this.pendingMerges.set(prNumber, attempt);

    try {
      // Get PR details
      const pr = await this.getPullRequest(prNumber);
      if (!pr) {
        attempt.status = 'failed';
        attempt.reason = 'Pull request not found';
        return attempt;
      }

      // Check if auto-merge is enabled
      if (!this.mergeRules.enabled) {
        attempt.status = 'skipped';
        attempt.reason = 'Auto-merge is disabled';
        return attempt;
      }

      // Check PR state
      if (pr.state !== 'open') {
        attempt.status = 'skipped';
        attempt.reason = `PR is ${pr.state}`;
        return attempt;
      }

      if (pr.merged) {
        attempt.status = 'skipped';
        attempt.reason = 'PR is already merged';
        return attempt;
      }

      // Check mergeability
      const mergeabilityCheck = await this.checkMergeability(pr);
      if (!mergeabilityCheck.canMerge) {
        attempt.status = 'failed';
        attempt.reason = mergeabilityCheck.reason;
        return attempt;
      }

      // Check labels (skip if has skip labels, require auto-merge labels if configured)
      const labelCheck = await this.checkLabels(pr);
      if (!labelCheck.allowed) {
        attempt.status = 'skipped';
        attempt.reason = labelCheck.reason;
        return attempt;
      }

      // Check user permissions
      const userCheck = await this.checkUserPermissions(pr);
      if (!userCheck.allowed) {
        attempt.status = 'skipped';
        attempt.reason = userCheck.reason;
        return attempt;
      }

      // Check CI status
      const checkStatus = await this.getCheckStatus(pr);
      if (!this.areChecksSuccessful(checkStatus)) {
        attempt.status = 'failed';
        attempt.reason = 'Required checks are not passing';
        return attempt;
      }

      // Check reviews
      const reviewStatus = await this.getReviewStatus(pr);
      if (!this.hasRequiredApprovals(reviewStatus)) {
        attempt.status = 'failed';
        attempt.reason = `Insufficient approvals (${reviewStatus.approvedReviews}/${this.mergeRules.requireApprovals} required)`;
        return attempt;
      }

      if (this.hasRequestedChanges(reviewStatus)) {
        attempt.status = 'failed';
        attempt.reason = 'PR has requested changes';
        return attempt;
      }

      // Check if branch is up to date (if required)
      if (this.mergeRules.requireUpToDate) {
        const upToDateCheck = await this.isBranchUpToDate(pr);
        if (!upToDateCheck) {
          attempt.status = 'failed';
          attempt.reason = 'Branch is not up to date with base';
          return attempt;
        }
      }

      // All checks passed - proceed with merge
      const mergeResult = await this.mergePullRequest(pr, this.mergeRules.strategy);
      
      attempt.status = 'success';
      attempt.mergeCommitSha = mergeResult.sha;
      
      // Delete branch if configured
      if (this.mergeRules.deleteAfterMerge && mergeResult.merged) {
        try {
          await this.deleteBranch(pr.head.ref);
          attempt.deletedBranch = true;
        } catch (error) {
          // Log but don't fail the merge attempt
          this.emit('branchDeleteFailed', { 
            prNumber, 
            branch: pr.head.ref, 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      await this.logEvent('pr.auto_merge_success', {
        prNumber,
        taskId,
        strategy: this.mergeRules.strategy,
        mergeCommitSha: attempt.mergeCommitSha,
        deletedBranch: attempt.deletedBranch
      });

      this.emit('autoMergeSuccess', attempt);

    } catch (error) {
      attempt.status = 'failed';
      attempt.reason = error instanceof Error ? error.message : String(error);

      await this.logEvent('pr.auto_merge_failed', {
        prNumber,
        taskId,
        error: attempt.reason
      });

      this.emit('autoMergeFailed', attempt);
    } finally {
      // Store attempt result
      await this.storeAttempt(attempt);
      this.pendingMerges.delete(prNumber);
    }

    return attempt;
  }

  /**
   * Check if PR can be merged
   */
  async checkMergeability(pr: PullRequest): Promise<{ canMerge: boolean; reason?: string }> {
    if (pr.mergeable === false) {
      return { canMerge: false, reason: 'PR has merge conflicts' };
    }

    if (pr.mergeable_state === 'dirty') {
      return { canMerge: false, reason: 'PR has merge conflicts' };
    }

    if (pr.mergeable_state === 'blocked') {
      return { canMerge: false, reason: 'PR is blocked by branch protection rules' };
    }

    return { canMerge: true };
  }

  /**
   * Check PR labels against merge rules
   */
  async checkLabels(pr: PullRequest): Promise<{ allowed: boolean; reason?: string }> {
    // Get PR labels (mock implementation)
    const labels = await this.getPRLabels(pr.number);
    const labelNames = labels.map(l => l.name);

    // Check skip labels
    if (this.mergeRules.skipAutoMergeLabels) {
      for (const skipLabel of this.mergeRules.skipAutoMergeLabels) {
        if (labelNames.includes(skipLabel)) {
          return { allowed: false, reason: `PR has skip label: ${skipLabel}` };
        }
      }
    }

    // Check required labels
    if (this.mergeRules.autoMergeLabels && this.mergeRules.autoMergeLabels.length > 0) {
      const hasRequiredLabel = this.mergeRules.autoMergeLabels.some(label => 
        labelNames.includes(label)
      );
      
      if (!hasRequiredLabel) {
        return { 
          allowed: false, 
          reason: `PR missing required auto-merge label: ${this.mergeRules.autoMergeLabels.join(' or ')}` 
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check user permissions
   */
  async checkUserPermissions(pr: PullRequest): Promise<{ allowed: boolean; reason?: string }> {
    if (this.mergeRules.allowedUsers && this.mergeRules.allowedUsers.length > 0) {
      if (!this.mergeRules.allowedUsers.includes(pr.user.login)) {
        return { 
          allowed: false, 
          reason: `User ${pr.user.login} is not in allowed users list` 
        };
      }
    }

    return { allowed: true };
  }

  /**
   * Check if all required CI checks are successful
   */
  areChecksSuccessful(checkStatus: CheckStatus): boolean {
    if (checkStatus.state !== 'success') {
      return false;
    }

    // Check specific required checks
    for (const requiredCheck of this.mergeRules.requireChecks) {
      const check = checkStatus.statuses.find(s => s.context === requiredCheck);
      if (!check || check.state !== 'success') {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if PR has required approvals
   */
  hasRequiredApprovals(reviewStatus: ReviewStatus): boolean {
    return reviewStatus.approvedReviews >= this.mergeRules.requireApprovals;
  }

  /**
   * Check if PR has any requested changes
   */
  hasRequestedChanges(reviewStatus: ReviewStatus): boolean {
    return reviewStatus.requestedChanges > 0;
  }

  /**
   * Get merge attempts for a PR
   */
  async getMergeAttempts(prNumber: number): Promise<MergeAttempt[]> {
    const attempts = await this.stateStore.loadState<MergeAttempt[]>(`pr-merge-attempts/${prNumber}`);
    return attempts || [];
  }

  /**
   * Update merge rules
   */
  async updateMergeRules(rules: Partial<MergeRules>): Promise<void> {
    this.mergeRules = { ...this.mergeRules, ...rules };
    await this.stateStore.saveState('pr-merge-rules', this.mergeRules);
  }

  /**
   * Get current merge rules
   */
  getMergeRules(): MergeRules {
    return { ...this.mergeRules };
  }

  // Real GitHub API methods using Octokit

  private async getPullRequest(prNumber: number): Promise<PullRequest | null> {
    try {
      const prResult = await this.octokitService.getPullRequest(prNumber);
      
      // Convert PRResult to PullRequest format
      return {
        id: prResult.id,
        number: prResult.number,
        title: prResult.title,
        body: prResult.body || '',
        state: prResult.state as 'open' | 'closed' | 'merged',
        base: {
          ref: prResult.base.ref
        },
        head: {
          ref: prResult.head.ref,
          sha: prResult.head.sha
        },
        mergeable: prResult.mergeable ?? undefined,
        mergeable_state: 'unknown', // Will be updated by mergeability check
        merged: prResult.merged,
        merged_at: prResult.created_at, // This should be merged_at from API
        html_url: prResult.html_url,
        statuses_url: `https://api.github.com/repos/${this.repository}/statuses/${prResult.head.sha}`,
        user: {
          login: prResult.user.login
        }
      };
    } catch (error: any) {
      if (error.message.includes('404') || error.message.includes('not found')) {
        return null;
      }
      throw new Error(`Failed to get pull request #${prNumber}: ${error.message}`);
    }
  }

  private async getCheckStatus(pr: PullRequest): Promise<CheckStatus> {
    try {
      const mergeabilityCheck = await this.octokitService.checkMergeability(pr.number);
      
      // Convert status checks to our format
      const statuses = mergeabilityCheck.status_checks.map(check => ({
        state: check.state,
        context: check.context,
        description: check.description || '',
        target_url: check.target_url || undefined
      }));
      
      // Determine overall state
      let overallState: 'pending' | 'success' | 'failure' | 'error' = 'success';
      
      if (statuses.some(s => s.state === 'pending')) {
        overallState = 'pending';
      } else if (statuses.some(s => s.state === 'failure' || s.state === 'error')) {
        overallState = 'failure';
      }
      
      return {
        state: overallState,
        statuses
      };
    } catch (error: any) {
      throw new Error(`Failed to get check status for PR #${pr.number}: ${error.message}`);
    }
  }

  private async getReviewStatus(pr: PullRequest): Promise<ReviewStatus> {
    try {
      const mergeabilityCheck = await this.octokitService.checkMergeability(pr.number);
      
      const reviews = mergeabilityCheck.reviews.map(review => ({
        user: { login: review.user.login },
        state: review.state,
        submitted_at: review.submitted_at || new Date().toISOString()
      }));
      
      // Count review types
      let approvedReviews = 0;
      let requestedChanges = 0;
      let dismissedReviews = 0;
      
      for (const review of reviews) {
        switch (review.state) {
          case 'APPROVED':
            approvedReviews++;
            break;
          case 'CHANGES_REQUESTED':
            requestedChanges++;
            break;
          case 'DISMISSED':
            dismissedReviews++;
            break;
        }
      }
      
      return {
        totalReviews: reviews.length,
        approvedReviews,
        requestedChanges,
        dismissedReviews,
        reviews
      };
    } catch (error: any) {
      throw new Error(`Failed to get review status for PR #${pr.number}: ${error.message}`);
    }
  }

  private async getPRLabels(prNumber: number): Promise<Array<{ name: string; color: string }>> {
    try {
      const prResult = await this.octokitService.getPullRequest(prNumber);
      
      // Extract labels from the PR (PRs use issues endpoint for labels)
      const issueResult = await this.octokitService.getIssue(prNumber);
      
      return issueResult.labels.map(label => ({
        name: label.name,
        color: label.color
      }));
    } catch (error: any) {
      // If we can't get labels, return empty array (non-blocking)
      console.warn(`Could not get labels for PR #${prNumber}:`, error.message);
      return [];
    }
  }

  private async isBranchUpToDate(pr: PullRequest): Promise<boolean> {
    try {
      const mergeabilityCheck = await this.octokitService.checkMergeability(pr.number);
      
      // Check mergeable state - 'behind' means not up to date
      return mergeabilityCheck.mergeable_state !== 'behind';
    } catch (error: any) {
      // If we can't determine, assume not up to date for safety
      console.warn(`Could not check if PR #${pr.number} branch is up to date:`, error.message);
      return false;
    }
  }

  private async mergePullRequest(pr: PullRequest, strategy: MergeStrategy): Promise<{ merged: boolean; sha: string; message: string }> {
    try {
      const result = await this.octokitService.mergePullRequest(pr.number, {
        commitTitle: `${pr.title} (#${pr.number})`,
        commitMessage: `Automatically merged by VibeKit PR Merge Manager using ${strategy} strategy`,
        mergeMethod: strategy
      });
      
      return {
        merged: result.merged,
        sha: result.sha,
        message: result.message
      };
    } catch (error: any) {
      throw new Error(`Failed to merge PR #${pr.number}: ${error.message}`);
    }
  }

  private async deleteBranch(branchName: string): Promise<void> {
    try {
      // Check if branch exists first
      const branchExists = await this.octokitService.branchExists(branchName);
      if (!branchExists) {
        console.warn(`Branch ${branchName} does not exist, skipping deletion`);
        return;
      }
      
      // Delete the branch using GitHub API
      await this.octokitService.deleteBranch(branchName);
      this.emit('branchDeleted', { branch: branchName });
    } catch (error: any) {
      throw new Error(`Failed to delete branch ${branchName}: ${error.message}`);
    }
  }

  private async storeAttempt(attempt: MergeAttempt): Promise<void> {
    const attempts = await this.getMergeAttempts(attempt.prNumber);
    attempts.push(attempt);
    await this.stateStore.saveState(`pr-merge-attempts/${attempt.prNumber}`, attempts);
  }

  private async logEvent(type: string, data: any): Promise<void> {
    await this.eventStore.appendEvent('pr-merge', {
      id: this.generateEventId(),
      type,
      timestamp: new Date().toISOString(),
      data
    });
  }

  private generateEventId(): string {
    return `merge_evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Preset merge rule configurations
export const MergeRulePresets = {
  /**
   * Conservative merge rules for production
   */
  production: (): MergeRules => ({
    enabled: true,
    strategy: 'squash',
    requireChecks: ['ci', 'tests', 'security', 'code-quality'],
    requireApprovals: 2,
    requireUpToDate: true,
    deleteAfterMerge: true,
    autoMergeLabels: ['auto-merge', 'ready-to-merge'],
    skipAutoMergeLabels: ['do-not-merge', 'work-in-progress', 'blocked'],
    requiredStatusChecks: ['ci', 'tests']
  }),

  /**
   * Relaxed merge rules for development
   */
  development: (): MergeRules => ({
    enabled: true,
    strategy: 'squash',
    requireChecks: ['ci', 'tests'],
    requireApprovals: 1,
    requireUpToDate: false,
    deleteAfterMerge: true,
    skipAutoMergeLabels: ['do-not-merge', 'work-in-progress']
  }),

  /**
   * Permissive merge rules for personal projects
   */
  personal: (): MergeRules => ({
    enabled: true,
    strategy: 'squash',
    requireChecks: ['ci'],
    requireApprovals: 0,
    requireUpToDate: false,
    deleteAfterMerge: true,
    skipAutoMergeLabels: ['do-not-merge']
  }),

  /**
   * Strict merge rules for open source projects
   */
  opensource: (): MergeRules => ({
    enabled: true,
    strategy: 'merge',
    requireChecks: ['ci', 'tests', 'license-check', 'security-scan'],
    requireApprovals: 2,
    requireUpToDate: true,
    deleteAfterMerge: false, // Keep branches for history
    autoMergeLabels: ['maintainer-approved'],
    skipAutoMergeLabels: ['do-not-merge', 'work-in-progress', 'needs-discussion']
  })
};