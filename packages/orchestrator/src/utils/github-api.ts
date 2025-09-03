/**
 * GitHub API Utilities
 * 
 * Handles GitHub API operations including PR creation, branch management,
 * and label operations for the orchestrator.
 */

export interface GitHubConfig {
  token: string;
  repository: string; // owner/repo format
}

export interface CreatePROptions {
  title: string;
  body: string;
  head: string; // branch name
  base: string; // base branch, usually 'main'
  draft?: boolean;
}

export interface PRResult {
  id: number;
  number: number;
  state: string;
  title: string;
  body: string | null;
  html_url: string;
  head: {
    ref: string;
    sha: string;
    repo: any;
  };
  base: {
    ref: string;
    sha: string;
    repo: any;
  };
  user: {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
  };
  created_at: string;
  updated_at: string;
  merged: boolean;
  mergeable: boolean | null;
  merge_commit_sha: string | null;
}

export interface LabelConfig {
  name: string;
  color: string;
  description: string;
}

export interface BranchInfo {
  name: string;
  sha: string;
  protected: boolean;
}

/**
 * GitHub API client for orchestrator operations
 */
export class GitHubAPI {
  private baseUrl = 'https://api.github.com';
  private owner: string;
  private repo: string;

  constructor(private config: GitHubConfig) {
    const [owner, repo] = config.repository.split('/');
    if (!owner || !repo) {
      throw new Error(`Invalid repository format: ${config.repository}. Expected format: owner/repo`);
    }
    this.owner = owner;
    this.repo = repo;
  }

  /**
   * Create a pull request
   */
  async createPullRequest(options: CreatePROptions): Promise<PRResult> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        title: options.title,
        body: options.body,
        head: options.head,
        base: options.base,
        draft: options.draft || false
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to create PR: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
    }

    return await response.json();
  }

  /**
   * Add labels to a pull request or issue
   */
  async addLabels(issueNumber: number, labels: string[]): Promise<void> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/issues/${issueNumber}/labels`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(labels)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to add labels: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
    }
  }

  /**
   * Create a label if it doesn't exist
   */
  async createLabel(labelConfig: LabelConfig): Promise<void> {
    // First check if label exists
    const checkUrl = `${this.baseUrl}/repos/${this.owner}/${this.repo}/labels/${labelConfig.name}`;
    const checkResponse = await fetch(checkUrl, {
      headers: this.getHeaders()
    });

    // If label exists, return early
    if (checkResponse.ok) {
      return;
    }

    // If not 404, throw error
    if (checkResponse.status !== 404) {
      throw new Error(`Failed to check label existence: ${checkResponse.status} ${checkResponse.statusText}`);
    }

    // Create the label
    const createUrl = `${this.baseUrl}/repos/${this.owner}/${this.repo}/labels`;
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        name: labelConfig.name,
        color: labelConfig.color,
        description: labelConfig.description
      })
    });

    if (!createResponse.ok) {
      const errorData = await createResponse.json().catch(() => ({}));
      throw new Error(`Failed to create label: ${createResponse.status} ${createResponse.statusText}. ${errorData.message || ''}`);
    }
  }

  /**
   * Get information about a branch
   */
  async getBranch(branchName: string): Promise<BranchInfo> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/branches/${branchName}`;

    const response = await fetch(url, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to get branch info: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
    }

    const branchData = await response.json();
    return {
      name: branchData.name,
      sha: branchData.commit.sha,
      protected: branchData.protected
    };
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
   * Get pull request by number
   */
  async getPullRequest(prNumber: number): Promise<PRResult> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${prNumber}`;

    const response = await fetch(url, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to get PR: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
    }

    return await response.json();
  }

  /**
   * List open pull requests for a specific head branch
   */
  async getPullRequestsByBranch(branchName: string): Promise<PRResult[]> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls?state=open&head=${this.owner}:${branchName}`;

    const response = await fetch(url, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to get PRs: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
    }

    return await response.json();
  }

  /**
   * Merge a pull request
   */
  async mergePullRequest(
    prNumber: number,
    options: {
      commitTitle?: string;
      commitMessage?: string;
      mergeMethod?: 'merge' | 'squash' | 'rebase';
    } = {}
  ): Promise<{
    sha: string;
    merged: boolean;
    message: string;
  }> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${prNumber}/merge`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify({
        commit_title: options.commitTitle,
        commit_message: options.commitMessage,
        merge_method: options.mergeMethod || 'merge'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to merge PR: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
    }

    return await response.json();
  }

  /**
   * Close a pull request without merging
   */
  async closePullRequest(prNumber: number): Promise<PRResult> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}/pulls/${prNumber}`;

    const response = await fetch(url, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify({
        state: 'closed'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to close PR: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
    }

    return await response.json();
  }

  /**
   * Get repository information
   */
  async getRepository(): Promise<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    clone_url: string;
    ssh_url: string;
  }> {
    const url = `${this.baseUrl}/repos/${this.owner}/${this.repo}`;

    const response = await fetch(url, {
      headers: this.getHeaders()
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Failed to get repository: ${response.status} ${response.statusText}. ${errorData.message || ''}`);
    }

    return await response.json();
  }

  /**
   * Generate commit message suggestions based on changes
   */
  generateCommitMessage(
    changes: {
      files: string[];
      additions: number;
      deletions: number;
    },
    taskTitle?: string
  ): string {
    const { files, additions, deletions } = changes;
    
    if (taskTitle) {
      return `feat: ${taskTitle}

Modified ${files.length} file(s)
+${additions} additions, -${deletions} deletions

Files changed:
${files.slice(0, 10).map(f => `- ${f}`).join('\n')}${files.length > 10 ? `\n... and ${files.length - 10} more` : ''}`;
    }

    // Auto-generate based on files
    const fileTypes = this.categorizeFiles(files);
    const primaryType = fileTypes[0] || 'misc';
    
    return `${primaryType}: update ${files.length} file(s)

+${additions} additions, -${deletions} deletions`;
  }

  /**
   * Generate PR title and body based on changes
   */
  generatePRMetadata(
    changes: {
      files: string[];
      additions: number;
      deletions: number;
      commitShas: string[];
    },
    worktreeName: string,
    taskTitle?: string
  ): { title: string; body: string } {
    const { files, additions, deletions, commitShas } = changes;

    const title = taskTitle 
      ? `[${worktreeName}] ${taskTitle}`
      : `[${worktreeName}] Update ${files.length} file(s)`;

    const body = `## Summary
Auto-generated pull request from worktree: **${worktreeName}**

${taskTitle ? `**Task:** ${taskTitle}\n\n` : ''}

## Changes
- **Files modified:** ${files.length}
- **Lines added:** +${additions}
- **Lines deleted:** -${deletions}
- **Commits:** ${commitShas.length}

## Files Changed
${files.slice(0, 20).map(f => `- \`${f}\``).join('\n')}${files.length > 20 ? `\n... and ${files.length - 20} more files` : ''}

## Commits
${commitShas.slice(0, 10).map(sha => `- ${sha.substring(0, 7)}`).join('\n')}${commitShas.length > 10 ? `\n... and ${commitShas.length - 10} more commits` : ''}

---
*Generated by VibeKit WorktreeOrchestrator*`;

    return { title, body };
  }

  /**
   * Get HTTP headers for API requests
   */
  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `token ${this.config.token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'VibeKit-Orchestrator/1.0'
    };
  }

  /**
   * Categorize files by type for commit message generation
   */
  private categorizeFiles(files: string[]): string[] {
    const categories = new Set<string>();

    for (const file of files) {
      const ext = file.split('.').pop()?.toLowerCase();
      const path = file.toLowerCase();

      if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
        categories.add('feat');
      } else if (ext === 'test' || ext === 'spec' || path.includes('test')) {
        categories.add('test');
      } else if (ext === 'md' || path.includes('doc')) {
        categories.add('docs');
      } else if (ext === 'json' || ext === 'yml' || ext === 'yaml') {
        categories.add('config');
      } else if (ext === 'css' || ext === 'scss' || ext === 'less') {
        categories.add('style');
      } else {
        categories.add('chore');
      }
    }

    return Array.from(categories);
  }
}