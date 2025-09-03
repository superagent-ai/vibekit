/**
 * Octokit Service - Real GitHub API Integration
 * 
 * This service provides a clean interface for GitHub API operations
 * using the Octokit REST client. It handles authentication, error handling,
 * and provides typed responses for all GitHub operations.
 */

import { Octokit } from '@octokit/rest';
import { createTokenAuth } from '@octokit/auth-token';
import type { 
  GitHubAPIConfig, 
  PRResult, 
  CreatePROptions, 
  LabelConfig, 
  BranchInfo 
} from '../utils/github-api';

export interface OctokitServiceConfig {
  token: string;
  repository: string; // owner/repo format
  userAgent?: string;
  baseUrl?: string;
  requestTimeout?: number;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name?: string | null;
  email?: string | null;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  default_branch: string;
  clone_url: string;
  ssh_url: string;
  html_url: string;
  permissions?: {
    admin: boolean;
    maintain: boolean;
    push: boolean;
    triage: boolean;
    pull: boolean;
  };
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{
    id: number;
    name: string;
    color: string;
    description: string | null;
  }>;
  assignee?: GitHubUser | null;
  assignees: GitHubUser[];
  milestone?: {
    id: number;
    number: number;
    title: string;
    description: string | null;
    state: 'open' | 'closed';
  } | null;
  user: GitHubUser;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
}

export interface GitHubLabel {
  id: number;
  name: string;
  color: string;
  description: string | null;
  default: boolean;
}

export interface MergeResult {
  sha: string;
  merged: boolean;
  message: string;
}

export interface StatusCheck {
  id: number;
  state: 'error' | 'failure' | 'pending' | 'success';
  description: string | null;
  target_url: string | null;
  context: string;
  created_at: string;
  updated_at: string;
}

export interface PullRequestReview {
  id: number;
  user: GitHubUser;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  body: string | null;
  submitted_at: string | null;
}

/**
 * Service for interacting with GitHub API via Octokit
 */
export class OctokitService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;

  constructor(config: OctokitServiceConfig) {
    if (!config.token) {
      throw new Error('GitHub token is required. Set GITHUB_TOKEN environment variable.');
    }

    const [owner, repo] = config.repository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format: ${config.repository}. Expected format: owner/repo`);
    }

    this.owner = owner;
    this.repo = repo;

    // Create authenticated Octokit instance
    this.octokit = new Octokit({
      auth: config.token,
      userAgent: config.userAgent || 'VibeKit-Orchestrator/1.0',
      baseUrl: config.baseUrl || 'https://api.github.com',
      request: {
        timeout: config.requestTimeout || 30000
      }
    });
  }

  /**
   * Test the GitHub connection and authentication
   */
  async checkConnection(): Promise<{ connected: boolean; user?: GitHubUser; error?: string }> {
    try {
      const { data: user } = await this.octokit.rest.users.getAuthenticated();
      return {
        connected: true,
        user: {
          login: user.login,
          id: user.id,
          avatar_url: user.avatar_url,
          html_url: user.html_url,
          name: user.name,
          email: user.email
        }
      };
    } catch (error: any) {
      return {
        connected: false,
        error: error.message || 'Unknown connection error'
      };
    }
  }

  /**
   * Get repository information
   */
  async getRepository(): Promise<GitHubRepository> {
    try {
      const { data: repo } = await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo
      });

      return {
        id: repo.id,
        name: repo.name,
        full_name: repo.full_name,
        private: repo.private,
        default_branch: repo.default_branch,
        clone_url: repo.clone_url,
        ssh_url: repo.ssh_url,
        html_url: repo.html_url,
        permissions: repo.permissions ? {
          admin: repo.permissions.admin || false,
          maintain: repo.permissions.maintain || false,
          push: repo.permissions.push || false,
          triage: repo.permissions.triage || false,
          pull: repo.permissions.pull || false
        } : undefined
      };
    } catch (error: any) {
      throw new Error(`Failed to get repository ${this.owner}/${this.repo}: ${error.message}`);
    }
  }

  /**
   * Create a GitHub issue
   */
  async createIssue(options: {
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
  }): Promise<GitHubIssue> {
    try {
      const { data: issue } = await this.octokit.rest.issues.create({
        owner: this.owner,
        repo: this.repo,
        title: options.title,
        body: options.body,
        labels: options.labels,
        assignees: options.assignees,
        milestone: options.milestone
      });

      return this.formatIssue(issue as any);
    } catch (error: any) {
      throw new Error(`Failed to create issue: ${error.message}`);
    }
  }

  /**
   * Update a GitHub issue
   */
  async updateIssue(issueNumber: number, options: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
    assignees?: string[];
  }): Promise<GitHubIssue> {
    try {
      const { data: issue } = await this.octokit.rest.issues.update({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        title: options.title,
        body: options.body,
        state: options.state,
        labels: options.labels,
        assignees: options.assignees
      });

      return this.formatIssue(issue as any);
    } catch (error: any) {
      throw new Error(`Failed to update issue #${issueNumber}: ${error.message}`);
    }
  }

  /**
   * Get a GitHub issue by number
   */
  async getIssue(issueNumber: number): Promise<GitHubIssue> {
    try {
      const { data: issue } = await this.octokit.rest.issues.get({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber
      });

      return this.formatIssue(issue as any);
    } catch (error: any) {
      throw new Error(`Failed to get issue #${issueNumber}: ${error.message}`);
    }
  }

  /**
   * List issues with filters
   */
  async listIssues(options: {
    state?: 'open' | 'closed' | 'all';
    labels?: string;
    assignee?: string;
    creator?: string;
    milestone?: string;
    since?: string;
    per_page?: number;
    page?: number;
  } = {}): Promise<GitHubIssue[]> {
    try {
      const { data: issues } = await this.octokit.rest.issues.listForRepo({
        owner: this.owner,
        repo: this.repo,
        ...options
      });

      return issues.map(issue => this.formatIssue(issue as any));
    } catch (error: any) {
      throw new Error(`Failed to list issues: ${error.message}`);
    }
  }

  /**
   * Create a pull request
   */
  async createPullRequest(options: CreatePROptions): Promise<PRResult> {
    try {
      const { data: pr } = await this.octokit.rest.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
        draft: options.draft
      });

      return this.formatPullRequest(pr as any);
    } catch (error: any) {
      throw new Error(`Failed to create pull request: ${error.message}`);
    }
  }

  /**
   * Get a pull request by number
   */
  async getPullRequest(prNumber: number): Promise<PRResult> {
    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      return this.formatPullRequest(pr as any);
    } catch (error: any) {
      throw new Error(`Failed to get pull request #${prNumber}: ${error.message}`);
    }
  }

  /**
   * List pull requests
   */
  async listPullRequests(options: {
    state?: 'open' | 'closed' | 'all';
    head?: string;
    base?: string;
    sort?: 'created' | 'updated' | 'popularity';
    direction?: 'asc' | 'desc';
  } = {}): Promise<PRResult[]> {
    try {
      const { data: prs } = await this.octokit.rest.pulls.list({
        owner: this.owner,
        repo: this.repo,
        ...options
      });

      return prs.map(pr => this.formatPullRequest(pr as any));
    } catch (error: any) {
      throw new Error(`Failed to list pull requests: ${error.message}`);
    }
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(prNumber: number, options: {
    commitTitle?: string;
    commitMessage?: string;
    mergeMethod?: 'merge' | 'squash' | 'rebase';
  } = {}): Promise<MergeResult> {
    try {
      const { data: result } = await this.octokit.rest.pulls.merge({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber,
        commit_title: options.commitTitle,
        commit_message: options.commitMessage,
        merge_method: options.mergeMethod || 'merge'
      });

      return {
        sha: result.sha,
        merged: result.merged,
        message: result.message
      };
    } catch (error: any) {
      throw new Error(`Failed to merge pull request #${prNumber}: ${error.message}`);
    }
  }

  /**
   * Check if a pull request is mergeable
   */
  async checkMergeability(prNumber: number): Promise<{
    mergeable: boolean | null;
    mergeable_state: string;
    status_checks: StatusCheck[];
    reviews: PullRequestReview[];
  }> {
    try {
      const { data: pr } = await this.octokit.rest.pulls.get({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      // Get status checks
      const { data: statusChecks } = await this.octokit.rest.repos.listCommitStatusesForRef({
        owner: this.owner,
        repo: this.repo,
        ref: pr.head.sha
      });

      // Get reviews
      const { data: reviews } = await this.octokit.rest.pulls.listReviews({
        owner: this.owner,
        repo: this.repo,
        pull_number: prNumber
      });

      return {
        mergeable: pr.mergeable,
        mergeable_state: pr.mergeable_state,
        status_checks: statusChecks.map(check => ({
          id: check.id,
          state: check.state as any,
          description: check.description,
          target_url: check.target_url,
          context: check.context,
          created_at: check.created_at,
          updated_at: check.updated_at
        })),
        reviews: reviews.map(review => ({
          id: review.id,
          user: {
            login: review.user?.login || '',
            id: review.user?.id || 0,
            avatar_url: review.user?.avatar_url || '',
            html_url: review.user?.html_url || ''
          },
          state: review.state as any,
          body: review.body,
          submitted_at: review.submitted_at || null
        }))
      };
    } catch (error: any) {
      throw new Error(`Failed to check mergeability for PR #${prNumber}: ${error.message}`);
    }
  }

  /**
   * Create or update a label
   */
  async createOrUpdateLabel(labelConfig: LabelConfig): Promise<GitHubLabel> {
    try {
      // Try to update existing label first
      try {
        const { data: label } = await this.octokit.rest.issues.updateLabel({
          owner: this.owner,
          repo: this.repo,
          name: labelConfig.name,
          color: labelConfig.color,
          description: labelConfig.description
        });

        return this.formatLabel(label);
      } catch (updateError: any) {
        // If label doesn't exist, create it
        if (updateError.status === 404) {
          const { data: label } = await this.octokit.rest.issues.createLabel({
            owner: this.owner,
            repo: this.repo,
            name: labelConfig.name,
            color: labelConfig.color,
            description: labelConfig.description
          });

          return this.formatLabel(label);
        }
        throw updateError;
      }
    } catch (error: any) {
      throw new Error(`Failed to create or update label '${labelConfig.name}': ${error.message}`);
    }
  }

  /**
   * Add labels to an issue
   */
  async addLabelsToIssue(issueNumber: number, labels: string[]): Promise<GitHubLabel[]> {
    try {
      const { data: updatedLabels } = await this.octokit.rest.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: issueNumber,
        labels
      });

      return updatedLabels.map(label => this.formatLabel(label));
    } catch (error: any) {
      throw new Error(`Failed to add labels to issue #${issueNumber}: ${error.message}`);
    }
  }

  /**
   * Remove labels from an issue
   */
  async removeLabelsFromIssue(issueNumber: number, labels: string[]): Promise<void> {
    try {
      for (const label of labels) {
        await this.octokit.rest.issues.removeLabel({
          owner: this.owner,
          repo: this.repo,
          issue_number: issueNumber,
          name: label
        });
      }
    } catch (error: any) {
      throw new Error(`Failed to remove labels from issue #${issueNumber}: ${error.message}`);
    }
  }

  /**
   * Get branch information
   */
  async getBranch(branchName: string): Promise<BranchInfo> {
    try {
      const { data: branch } = await this.octokit.rest.repos.getBranch({
        owner: this.owner,
        repo: this.repo,
        branch: branchName
      });

      return {
        name: branch.name,
        sha: branch.commit.sha,
        protected: branch.protected
      };
    } catch (error: any) {
      throw new Error(`Failed to get branch '${branchName}': ${error.message}`);
    }
  }

  /**
   * Check if a branch exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    try {
      await this.getBranch(branchName);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchName: string): Promise<void> {
    try {
      await this.octokit.rest.git.deleteRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${branchName}`
      });
    } catch (error: any) {
      throw new Error(`Failed to delete branch '${branchName}': ${error.message}`);
    }
  }

  /**
   * Get rate limit status
   */
  async getRateLimit(): Promise<{
    limit: number;
    remaining: number;
    reset: Date;
    used: number;
  }> {
    try {
      const { data: rateLimit } = await this.octokit.rest.rateLimit.get();
      
      return {
        limit: rateLimit.rate.limit,
        remaining: rateLimit.rate.remaining,
        reset: new Date(rateLimit.rate.reset * 1000),
        used: rateLimit.rate.used
      };
    } catch (error: any) {
      throw new Error(`Failed to get rate limit: ${error.message}`);
    }
  }

  /**
   * Format GitHub issue for consistent typing
   */
  private formatIssue(issue: any): GitHubIssue {
    return {
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels.map((label: any) => this.formatLabel(label)),
      assignee: issue.assignee ? this.formatUser(issue.assignee) : null,
      assignees: issue.assignees.map((assignee: any) => this.formatUser(assignee)),
      milestone: issue.milestone ? {
        id: issue.milestone.id,
        number: issue.milestone.number,
        title: issue.milestone.title,
        description: issue.milestone.description,
        state: issue.milestone.state
      } : null,
      user: this.formatUser(issue.user),
      html_url: issue.html_url,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      closed_at: issue.closed_at
    };
  }

  /**
   * Format GitHub pull request for consistent typing
   */
  private formatPullRequest(pr: any): PRResult {
    return {
      id: pr.id,
      number: pr.number,
      state: pr.state,
      title: pr.title,
      body: pr.body,
      html_url: pr.html_url,
      head: {
        ref: pr.head.ref,
        sha: pr.head.sha,
        repo: pr.head.repo
      },
      base: {
        ref: pr.base.ref,
        sha: pr.base.sha,
        repo: pr.base.repo
      },
      user: this.formatUser(pr.user),
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      merged: pr.merged,
      mergeable: pr.mergeable,
      merge_commit_sha: pr.merge_commit_sha
    };
  }

  /**
   * Format GitHub user for consistent typing
   */
  private formatUser(user: any): GitHubUser {
    return {
      login: user.login,
      id: user.id,
      avatar_url: user.avatar_url,
      html_url: user.html_url,
      name: user.name,
      email: user.email
    };
  }

  /**
   * Format GitHub label for consistent typing
   */
  private formatLabel(label: any): GitHubLabel {
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description,
      default: label.default
    };
  }
}