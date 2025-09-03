import {
  generateCommitMessage,
  generatePRMetadata,
  ModelConfig,
} from "./utils";
import {
  Conversation,
  SandboxInstance,
  SandboxProvider,
  LabelOptions,
} from "../types";

// StreamingBuffer class to handle chunked JSON data
class StreamingBuffer {
  private buffer = "";
  private onComplete: (data: string) => void;

  constructor(onComplete: (data: string) => void) {
    this.onComplete = onComplete;
  }

  append(chunk: string): void {
    // Filter out null bytes that can corrupt JSON parsing
    const cleanChunk = chunk.replace(/\0/g, "");
    this.buffer += cleanChunk;
    this.processBuffer();
  }

  private processBuffer(): void {
    let bracketCount = 0;
    let inString = false;
    let escaped = false;
    let start = 0;

    for (let i = 0; i < this.buffer.length; i++) {
      const char = this.buffer[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === "{") {
        bracketCount++;
      } else if (char === "}") {
        bracketCount--;

        if (bracketCount === 0) {
          // Found complete JSON object
          const jsonStr = this.buffer.slice(start, i + 1);
          try {
            // Validate JSON before calling callback
            JSON.parse(jsonStr);
            this.onComplete(jsonStr);
          } catch (e) {
            // Invalid JSON, continue buffering
          }

          // Move to next potential JSON object
          start = i + 1;

          // If there's a newline after this JSON, skip it
          if (start < this.buffer.length && this.buffer[start] === "\n") {
            start++;
          }
        }
      }
    }

    // Keep only the remaining unparsed part
    this.buffer = this.buffer.slice(start);
  }

  // Handle any remaining non-JSON output (like raw text)
  flush(): void {
    if (this.buffer.trim()) {
      // If it's not JSON, pass it through as-is
      this.onComplete(this.buffer);
      this.buffer = "";
    }
  }
}

export interface BaseAgentConfig {
  githubToken?: string;
  repoUrl?: string;
  sandboxProvider?: SandboxProvider;
  secrets?: Record<string, string>;
  sandboxId?: string;
  workingDirectory?: string;
}

export interface StreamCallbacks {
  onUpdate?: (message: string) => void;
  onError?: (error: string) => void;
}

export interface ExecuteCommandOptions {
  timeoutMs?: number;
  background?: boolean;
  callbacks?: StreamCallbacks;
}

export interface AgentResponse {
  sandboxId: string;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface PullRequestResult {
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
  branchName: string;
  commitSha?: string;
}

export interface AgentCommandConfig {
  command: string;
  errorPrefix: string;
  labelName: string;
  labelColor: string;
  labelDescription: string;
}

export abstract class BaseAgent {
  protected config: BaseAgentConfig;
  protected sandboxInstance?: SandboxInstance;
  protected lastPrompt?: string;
  protected currentBranch?: string;
  protected WORKING_DIR: string;

  constructor(config: BaseAgentConfig) {
    this.config = config;
    this.WORKING_DIR = config.workingDirectory || "/vibe0";
  }

  protected abstract getCommandConfig(
    prompt: string,
    mode?: "ask" | "code"
  ): AgentCommandConfig;
  protected abstract getDefaultTemplate(): string;

  public async getSandbox(): Promise<SandboxInstance> {
    if (this.sandboxInstance) return this.sandboxInstance;

    if (!this.config.sandboxProvider) {
      throw new Error("No sandbox provider configured");
    }

    const provider = this.config.sandboxProvider;

    if (this.config.sandboxId) {
      this.sandboxInstance = await provider.resume(this.config.sandboxId);
    } else {
      // Merge agent-specific environment variables with user-defined secrets
      const envVars = {
        ...this.getEnvironmentVariables(),
        ...(this.config.secrets || {}),
      };

      this.sandboxInstance = await provider.create(
        envVars,
        this.getAgentType(),
        this.WORKING_DIR
      );
    }


    return this.sandboxInstance;
  }






  protected abstract getEnvironmentVariables(): Record<string, string>;


  private getMkdirCommand(path: string): string {
    // Use non-sudo commands for better compatibility with Docker containers
    // This works for both E2B-style environments and Docker containers
    return `mkdir -p ${path} || true`;
  }

  public async killSandbox() {

    if (this.sandboxInstance) {
      await this.sandboxInstance.kill();
      this.sandboxInstance = undefined;
    }
  }

  public async pauseSandbox() {
    if (this.sandboxInstance) {
      await this.sandboxInstance.pause();
    }
  }

  public async resumeSandbox() {
    if (this.sandboxInstance && this.config.sandboxProvider) {
      this.sandboxInstance = await this.config.sandboxProvider.resume(
        this.sandboxInstance.sandboxId
      );
    }
  }

  public async getSession() {
    if (this.sandboxInstance) {
      return this.sandboxInstance.sandboxId;
    }
    return this.config.sandboxId || null;
  }

  public async setSession(sessionId: string) {
    this.config.sandboxId = sessionId;
  }

  public setGithubToken(token: string): void {
    this.config.githubToken = token;
  }

  public setGithubRepository(repoUrl: string): void {
    this.config.repoUrl = repoUrl;
  }

  public async getHost(port: number): Promise<string> {
    const sbx = await this.getSandbox();
    return await sbx.getHost(port);
  }

  public getCurrentBranch(): string | undefined {
    return this.currentBranch;
  }

  public withWorkingDirectory(path: string): void {
    this.WORKING_DIR = path;
  }

  // Helper method to run git commands in workspace-persistent context
  private async runGitCommand(command: string): Promise<AgentResponse> {
    return await this.executeCommand(command, { timeoutMs: 3600000 });
  }

  public async executeCommand(
    command: string,
    options: ExecuteCommandOptions = {}
  ): Promise<AgentResponse> {
    const { timeoutMs = 3600000, background = false, callbacks } = options;

    try {
      const sbx = await this.getSandbox();

      if (!this.config.sandboxId && sbx.sandboxId) {
        callbacks?.onUpdate?.(
          `{"type": "start", "sandbox_id": "${sbx.sandboxId}"}`
        );
      }

      // Ensure working directory exists first
      await sbx.commands.run(this.getMkdirCommand(this.WORKING_DIR), {
        timeoutMs: 30000,
        background: false,
        onStdout: (data) => console.log(data),
      });

      // For executeCommand, always use working directory directly
      const executeCommand = `cd ${this.WORKING_DIR} && ${command}`;

      // Set up streaming buffers for stdout and stderr if callbacks are provided
      let stdoutBuffer: StreamingBuffer | undefined;
      let stderrBuffer: StreamingBuffer | undefined;

      if (callbacks?.onUpdate) {
        stdoutBuffer = new StreamingBuffer(callbacks.onUpdate);
        stderrBuffer = new StreamingBuffer(callbacks.onUpdate);
      }

      const result = await sbx.commands.run(executeCommand, {
        timeoutMs,
        background,
        onStdout: (data) => stdoutBuffer?.append(data),
        onStderr: (data) => stderrBuffer?.append(data),
      });

      // Flush any remaining buffered content
      stdoutBuffer?.flush();
      stderrBuffer?.flush();

      callbacks?.onUpdate?.(
        `{"type": "end", "sandbox_id": "${
          sbx.sandboxId
        }", "output": "${JSON.stringify(result)}"}`
      );


      return {
        sandboxId: sbx.sandboxId,
        ...result,
      };
    } catch (error) {
      console.error("Error executing command:", error);
      const errorMessage = `Failed to execute command: ${
        error instanceof Error ? error.message : String(error)
      }`;
      callbacks?.onError?.(errorMessage);
      throw new Error(errorMessage);
    }
  }

  public async generateCode(
    prompt: string,
    mode?: "ask" | "code",
    branch?: string,
    _history?: Conversation[],
    callbacks?: StreamCallbacks,
    background?: boolean
  ): Promise<AgentResponse> {
    const commandConfig = this.getCommandConfig(prompt, mode);

    try {
      const sbx = await this.getSandbox();

      if (!this.config.sandboxId && sbx.sandboxId) {
        callbacks?.onUpdate?.(
          `{"type": "start", "sandbox_id": "${sbx.sandboxId}"}`
        );

        // Create working directory
        await sbx.commands.run(this.getMkdirCommand(this.WORKING_DIR), {
          timeoutMs: 30000,
          background: background || false,
        });

        // Git clone will now happen as part of the agent command execution
        if (this.config.githubToken && this.config.repoUrl) {
          callbacks?.onUpdate?.(
            `{"type": "git", "output": "Repository will be cloned during agent execution for workspace persistence"}`
          );
        }
      } else if (this.config.sandboxId) {
        callbacks?.onUpdate?.(
          `{"type": "start", "sandbox_id": "${this.config.sandboxId}"}`
        );
      }

      // Switch to specified branch if provided and repository is available
      if (branch && this.config.repoUrl) {
        // Store the branch for later use
        this.currentBranch = branch;

        callbacks?.onUpdate?.(
          `{"type": "git", "output": "Switching to branch: ${branch}"}`
        );
        try {
          // Try to checkout existing branch first
          await sbx.commands.run(
            `cd ${this.WORKING_DIR} && git checkout ${branch}`,
            {
              timeoutMs: 60000,
              background: background || false,
            }
          );
          // Pull latest changes from the remote branch
          callbacks?.onUpdate?.(
            `{"type": "git", "output": "Pulling latest changes from ${branch}"}`
          );
          await sbx.commands.run(
            `cd ${this.WORKING_DIR} && git pull origin ${branch}`,
            {
              timeoutMs: 60000,
              background: background || false,
            }
          );
        } catch (error) {
          // If branch doesn't exist, create it
          callbacks?.onUpdate?.(
            `{"type": "git", "output": "Branch ${branch} not found, creating new branch"}`
          );
          await sbx.commands.run(
            `cd ${this.WORKING_DIR} && git checkout -b ${branch}`,
            {
              timeoutMs: 60000,
              background: background || false,
            }
          );
        }
      }

      // Include git clone as part of the command execution to ensure it persists
      let executeCommand = `cd ${this.WORKING_DIR}`;
      
      if (this.config.githubToken && this.config.repoUrl) {
        // Enhanced git worktree detection: check for .git file/directory AND git status
        // In worktrees, .git is a file pointing to main repo; in regular repos, .git is a directory
        executeCommand += ` && if ! git status >/dev/null 2>&1; then git clone https://x-access-token:${this.config.githubToken}@github.com/${this.config.repoUrl}.git . && git config user.name "github-actions[bot]" && git config user.email "github-actions[bot]@users.noreply.github.com"; fi`;
      }
      
      executeCommand += ` && ${commandConfig.command}`;

      // Set up streaming buffers for stdout and stderr if callbacks are provided
      let stdoutBuffer: StreamingBuffer | undefined;
      let stderrBuffer: StreamingBuffer | undefined;

      if (callbacks?.onUpdate) {
        stdoutBuffer = new StreamingBuffer(callbacks.onUpdate);
        stderrBuffer = new StreamingBuffer(callbacks.onUpdate);
      }

      const result = await sbx.commands.run(executeCommand, {
        timeoutMs: 3600000,
        background: background || false,
        onStdout: (data) => stdoutBuffer?.append(data),
        onStderr: (data) => stderrBuffer?.append(data),
      });

      // Flush any remaining buffered content
      stdoutBuffer?.flush();
      stderrBuffer?.flush();

      callbacks?.onUpdate?.(
        `{"type": "end", "sandbox_id": "${
          sbx.sandboxId
        }", "output": "${JSON.stringify(result)}"}`
      );

      this.lastPrompt = prompt;


      return {
        sandboxId: sbx.sandboxId,
        ...result,
      };
    } catch (error) {
      console.error(`Error calling ${commandConfig.errorPrefix}:`, error);
      const errorMessage = `Failed to generate code: ${
        error instanceof Error ? error.message : String(error)
      }`;
      callbacks?.onError?.(errorMessage);
      throw new Error(errorMessage);
    }
  }

  public async pushToBranch(branch?: string): Promise<void> {
    const targetBranch = branch || this.currentBranch;

    if (!targetBranch) {
      throw new Error(
        "No branch specified. Either pass a branch name or call generateCode with a branch first."
      );
    }

    const sbx = await this.getSandbox();

    // Check git status for changes
    const gitStatus = await this.runGitCommand("git status --porcelain");

    // Check for untracked files
    const untrackedFiles = await this.runGitCommand("git ls-files --others --exclude-standard");

    // Check if there are any changes to commit
    if (!gitStatus?.stdout && !untrackedFiles?.stdout) {
      throw new Error("No changes found to commit and push");
    }

    // Switch to the specified branch (create if it doesn't exist)
    try {
      await this.runGitCommand(`git checkout ${targetBranch}`);
    } catch (error) {
      // If branch doesn't exist, create it
      await this.runGitCommand(`git checkout -b ${targetBranch}`);
    }

    const diffHead = await this.runGitCommand("git --no-pager diff --no-color HEAD");

    const patch = await this.runGitCommand("git --no-pager diff --no-color --diff-filter=ACMR");

    let patchContent = patch?.stdout || diffHead?.stdout || "";

    // Add all changes and commit
    const { commitMessage } = await generateCommitMessage(
      patchContent,
      this.getModelConfig(),
      this.lastPrompt || ""
    );

    await this.runGitCommand(`git add -A && git commit -m "${commitMessage}"`);

    // Push the branch to GitHub
    await this.runGitCommand(`git push origin ${targetBranch}`);
  }

  public async createPullRequest(
    labelOptions?: LabelOptions,
    branchPrefix?: string
  ): Promise<PullRequestResult> {
    const { githubToken, repoUrl } = this.config;

    if (!githubToken || !repoUrl) {
      throw new Error(
        "GitHub configuration is required for creating pull requests. Please provide githubToken and repoUrl in your configuration."
      );
    }

    const commandConfig = this.getCommandConfig("", "code");
    const sbx = await this.getSandbox();
    // Get the current branch (base branch) BEFORE creating a new branch
    const baseBranch = await this.runGitCommand("git rev-parse --abbrev-ref HEAD");

    // Debug: Check git status first
    await this.runGitCommand("git status --porcelain");

    // Debug: Check for untracked files
    const untrackedFiles = await this.runGitCommand("git ls-files --others --exclude-standard");

    const diffHead = await this.runGitCommand("git --no-pager diff --no-color HEAD");

    const patch = await this.runGitCommand("git --no-pager diff --no-color --diff-filter=ACMR");

    if (
      !patch ||
      (!patch.stdout && !diffHead?.stdout && !untrackedFiles?.stdout)
    ) {
      throw new Error(
        `No changes found - check if the agent actually modified any files`
      );
    }

    // Use the diff that has content, preferring the original patch format
    let patchContent = patch?.stdout || diffHead?.stdout || "";

    // If no diff but there are untracked files, we need to add them first
    if (!patchContent && untrackedFiles?.stdout) {
      await this.runGitCommand("git add .");

      const patchAfterAdd = await this.runGitCommand("git --no-pager diff --no-color --cached");
      patchContent = patchAfterAdd?.stdout || "";
    }

    if (!patchContent) {
      throw new Error("No patch content found after checking all diff methods");
    }

    const { title, body, branchName, commitMessage } = await generatePRMetadata(
      patchContent,
      this.getModelConfig(),
      this.lastPrompt || ""
    );

    const _branchName = branchPrefix
      ? `${branchPrefix}/${branchName}`
      : branchName;

    // Escape any quotes in the commit message to prevent shell parsing issues
    const escapedCommitMessage = commitMessage.replace(/"/g, '\\"');

    const checkout = await this.runGitCommand(`git checkout -b ${_branchName} && git add -A && git commit -m "${escapedCommitMessage}"`);

    // Push the branch to GitHub
    await this.runGitCommand(`git push origin ${_branchName}`);

    // Extract commit SHA from checkout output
    const commitMatch = checkout?.stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/);
    const commitSha = commitMatch ? commitMatch[1] : undefined;

    // Create Pull Request using GitHub API
    const [owner, repo] = repoUrl?.split("/") || [];
    const prResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title,
          body,
          head: _branchName,
          base: baseBranch?.stdout.trim() || "main",
        }),
      }
    );

    if (!prResponse.ok) {
      const errorText = await prResponse.text();
      throw new Error(`Failed to create PR: ${prResponse.status} ${errorText}`);
    }

    const prData = await prResponse.json();

    // Handle label creation and assignment
    const labelConfig = labelOptions || {
      name: commandConfig.labelName,
      color: commandConfig.labelColor,
      description: commandConfig.labelDescription,
    };
    await this.handlePRLabeling(owner, repo, prData.number, labelConfig);

    return {
      id: prData.id,
      number: prData.number,
      state: prData.state,
      title: prData.title,
      body: prData.body,
      html_url: prData.html_url,
      head: prData.head,
      base: prData.base,
      user: prData.user,
      created_at: prData.created_at,
      updated_at: prData.updated_at,
      merged: prData.merged,
      mergeable: prData.mergeable,
      merge_commit_sha: prData.merge_commit_sha,
      branchName: _branchName,
      commitSha,
    };
  }

  public async runTests(
    branch?: string,
    history?: Conversation[],
    callbacks?: StreamCallbacks,
    background?: boolean
  ): Promise<AgentResponse> {
    return await this.generateCode(
      "Install dependencies and run tests",
      "code",
      branch,
      history,
      callbacks,
      background
    );
  }

  protected abstract getApiKey(): string;
  protected abstract getAgentType(): "codex" | "claude" | "opencode" | "gemini" | "grok";
  protected abstract getModelConfig(): ModelConfig;

  private async handlePRLabeling(
    owner: string,
    repo: string,
    prNumber: number,
    labelConfig: LabelOptions
  ) {
    const { githubToken } = this.config;
    const {
      name: labelName,
      color: labelColor,
      description: labelDescription,
    } = labelConfig;

    // Check if label exists first
    const labelCheckResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/labels/${labelName}`,
      {
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      }
    );

    // Only create label if it doesn't exist (404 status)
    if (!labelCheckResponse.ok && labelCheckResponse.status === 404) {
      const labelResponse = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/labels`,
        {
          method: "POST",
          headers: {
            Authorization: `token ${githubToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: labelName,
            color: labelColor,
            description: labelDescription,
          }),
        }
      );

      if (!labelResponse.ok) {
        const errorText = await labelResponse.text();
        console.error(
          `Failed to create label '${labelName}': ${labelResponse.status} ${errorText}`
        );
      }
    } else if (!labelCheckResponse.ok) {
      // Handle other errors (not 404)
      const errorText = await labelCheckResponse.text();
      console.error(
        `Failed to check if label '${labelName}' exists: ${labelCheckResponse.status} ${errorText}`
      );
    }

    // Add label to PR
    const addLabelResponse = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${prNumber}/labels`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify([labelName]),
      }
    );

    if (!addLabelResponse.ok) {
      const errorText = await addLabelResponse.text();
      console.error(
        `Failed to add label '${labelName}' to PR #${prNumber}: ${addLabelResponse.status} ${errorText}`
      );
    }
  }
}
