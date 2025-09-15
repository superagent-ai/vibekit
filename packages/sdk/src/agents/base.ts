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
  StreamingMessage,
  StreamCallbacks,
  AgentResponse,
  ExecuteCommandResponse,
  StreamJsonExecuteCommandResponse,
  ExecuteCommandOptions,
} from "../types";

// StreamingBuffer class to handle chunked JSON data
class StreamingBuffer {
  private buffer = "";
  private onComplete: (data: StreamingMessage | string) => void;

  constructor(onComplete: (data: StreamingMessage | string) => void) {
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
            // Parse and validate JSON, then pass as typed object
            const parsed = JSON.parse(jsonStr) as StreamingMessage;
            this.onComplete(parsed);
          } catch (e) {
            // If not valid JSON, pass as raw string
            this.onComplete(jsonStr);
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
  sandboxProvider?: SandboxProvider;
  secrets?: Record<string, string>;
  sandboxId?: string;
  workingDirectory?: string;
  worktrees?: {
    enabled?: boolean;
    root?: string;
    cleanup?: boolean;
  };
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
  protected readonly WORKING_DIR: string;
  protected currentWorktreeDir?: string;

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

  public async getHost(port: number): Promise<string> {
    const sbx = await this.getSandbox();
    return await sbx.getHost(port);
  }

  public getCurrentBranch(): string | undefined {
    return this.currentBranch;
  }

  // Utility function to detect stream-JSON format in command
  private detectStreamJsonFormat(command: string, options: ExecuteCommandOptions): boolean {
    // Check if explicitly set in options
    if (options.outputFormat === 'stream-json') {
      return true;
    }
    if (options.outputFormat === 'text') {
      return false;
    }
    
    // Auto-detect from command string - look for Claude CLI with stream-json output
    return command.includes('--output-format stream-json') || 
           command.includes('--output-format=stream-json');
  }

  // Parse stream-JSON output into structured messages
  private parseStreamJsonOutput(stdout: string): StreamingMessage[] {
    const messages: StreamingMessage[] = [];
    const lines = stdout.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as StreamingMessage;
        // Validate that it's a proper StreamingMessage
        if (parsed && typeof parsed === 'object' && 'type' in parsed) {
          messages.push(parsed);
        }
      } catch (error) {
        // Ignore non-JSON lines
      }
    }
    
    return messages;
  }

  public async executeCommand(
    command: string,
    options: ExecuteCommandOptions = {}
  ): Promise<ExecuteCommandResponse | StreamJsonExecuteCommandResponse> {
    const {
      timeoutMs = 3600000,
      background = false,
      callbacks,
      branch,
    } = options;

    const isStreamJson = this.detectStreamJsonFormat(command, options);

    try {
      const sbx = await this.getSandbox();

      if (!this.config.sandboxId && sbx.sandboxId) {
        callbacks?.onUpdate?.({
          type: "start",
          sandbox_id: sbx.sandboxId
        });
      }

      // Ensure working directory exists first
      await sbx.commands.run(this.getMkdirCommand(this.WORKING_DIR), {
        timeoutMs: 30000,
        background: false,
        onStdout: (data) => console.log(data),
      });

      // Handle branch/worktree if specified
      let activeDir = this.WORKING_DIR;
      if (branch) {
        // Store the branch for later use
        this.currentBranch = branch;

        // Check if we're in a git repository first
        try {
          await sbx.commands.run(
            `cd ${this.WORKING_DIR} && git rev-parse --git-dir`,
            {
              timeoutMs: 10000,
              background: false,
            }
          );

          const useWorktree = !!this.config.worktrees?.enabled;
          if (useWorktree) {
            const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "-");
            const baseRoot =
              this.config.worktrees?.root || `${this.WORKING_DIR}-wt`;
            const wtPath = `${baseRoot}/${sanitize(branch)}`;

            // Ensure root exists
            await sbx.commands.run(this.getMkdirCommand(baseRoot), {
              timeoutMs: 30000,
              background: false,
            });

            callbacks?.onUpdate?.({
              type: "git",
              output: `Preparing worktree at: ${wtPath}`
            });

            // Fetch and add worktree, prefer creating/updating branch off origin/main
            await sbx.commands.run(
              `cd ${this.WORKING_DIR} && git fetch --all --prune && (git worktree add -B ${branch} ${wtPath} origin/main || git worktree add ${wtPath} ${branch})`,
              { timeoutMs: 120000, background: false }
            );

            this.currentWorktreeDir = wtPath;
            activeDir = wtPath;
          } else {
            callbacks?.onUpdate?.({
              type: "git",
              output: `Switching to branch: ${branch}`
            });
            try {
              // Try to switch to existing branch
              await sbx.commands.run(
                `cd ${this.WORKING_DIR} && git checkout ${branch}`,
                { timeoutMs: 30000, background: false }
              );
              callbacks?.onUpdate?.({
                type: "git",
                output: `Switched to existing branch: ${branch}`
              });
            } catch (checkoutError) {
              // If switching fails, create and checkout new branch
              callbacks?.onUpdate?.({
                type: "git",
                output: `Creating new branch: ${branch}`
              });
              await sbx.commands.run(
                `cd ${this.WORKING_DIR} && git checkout -b ${branch}`,
                { timeoutMs: 30000, background: false }
              );
              callbacks?.onUpdate?.({
                type: "git",
                output: `Created and switched to new branch: ${branch}`
              });
            }
          }
        } catch (error) {
          // Not in a git repository, skip branch/worktree operations
          callbacks?.onUpdate?.({
            type: "git",
            output: "Not in a git repository, skipping branch/worktree operations"
          });
        }
      }

      // For executeCommand, always use working directory directly
      const executeCommand = `cd ${activeDir} && ${command}`;

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

      callbacks?.onUpdate?.({
        type: "end",
        sandbox_id: sbx.sandboxId,
        output: JSON.stringify(result)
      });

      const baseResponse = {
        sandboxId: sbx.sandboxId,
        ...result,
      };

      // If stream-JSON format is detected, parse the output and return enhanced response
      if (isStreamJson) {
        const messages = this.parseStreamJsonOutput(result.stdout);
        return {
          ...baseResponse,
          messages,
          rawStdout: result.stdout,
        } as StreamJsonExecuteCommandResponse;
      }

      // Return standard response for non-stream-JSON commands
      return baseResponse as ExecuteCommandResponse;
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
        callbacks?.onUpdate?.({
          type: "start",
          sandbox_id: sbx.sandboxId
        });

        // Create working directory
        await sbx.commands.run(this.getMkdirCommand(this.WORKING_DIR), {
          timeoutMs: 30000,
          background: background || false,
        });
      } else if (this.config.sandboxId) {
        callbacks?.onUpdate?.({
          type: "start",
          sandbox_id: this.config.sandboxId
        });
      }

      // Switch to specified branch if provided and we're in a git repository
      if (branch) {
        // Store the branch for later use
        this.currentBranch = branch;

        // Check if we're in a git repository first
        try {
          await sbx.commands.run(
            `cd ${this.WORKING_DIR} && git rev-parse --git-dir`,
            {
              timeoutMs: 10000,
              background: background || false,
            }
          );

          callbacks?.onUpdate?.({
            type: "git",
            output: `Switching to branch: ${branch}`
          });
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
            callbacks?.onUpdate?.({
              type: "git",
              output: `Pulling latest changes from ${branch}`
            });
            await sbx.commands.run(
              `cd ${this.WORKING_DIR} && git pull origin ${branch}`,
              {
                timeoutMs: 60000,
                background: background || false,
              }
            );
          } catch (error) {
            // If branch doesn't exist, create it
            callbacks?.onUpdate?.({
              type: "git",
              output: `Branch ${branch} not found, creating new branch`
            });
            await sbx.commands.run(
              `cd ${this.WORKING_DIR} && git checkout -b ${branch}`,
              {
                timeoutMs: 60000,
                background: background || false,
              }
            );
          }
        } catch (error) {
          // Not in a git repository, skip branch switching
          callbacks?.onUpdate?.({
            type: "git",
            output: "Not in a git repository, skipping branch operations"
          });
        }
      }

      // Always use working directory for all commands (repo is cloned directly into working directory)
      const executeCommand = `cd ${this.WORKING_DIR} && ${commandConfig.command}`;

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

      callbacks?.onUpdate?.({
        type: "end",
        sandbox_id: sbx.sandboxId,
        output: JSON.stringify(result)
      });

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
    const useWorktree = !!this.config.worktrees?.enabled;
    const sanitize = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "-");
    const baseRoot = this.config.worktrees?.root || `${this.WORKING_DIR}-wt`;
    const wtPath = targetBranch
      ? `${baseRoot}/${sanitize(targetBranch)}`
      : undefined;

    // Determine active directory
    const activeDir = useWorktree && wtPath ? wtPath : this.WORKING_DIR;

    // Check git status for changes
    const gitStatus = await sbx.commands.run(
      `cd ${activeDir} && git status --porcelain`,
      { timeoutMs: 3600000 }
    );

    // Check for untracked files
    const untrackedFiles = await sbx.commands.run(
      `cd ${activeDir} && git ls-files --others --exclude-standard`,
      { timeoutMs: 3600000 }
    );

    // Check if there are any changes to commit
    if (!gitStatus?.stdout && !untrackedFiles?.stdout) {
      throw new Error("No changes found to commit and push");
    }

    // Ensure branch context when not using worktree
    if (!useWorktree) {
      try {
        await sbx.commands.run(
          `cd ${activeDir} && git checkout ${targetBranch}`,
          { timeoutMs: 60000 }
        );
      } catch (error) {
        await sbx.commands.run(
          `cd ${activeDir} && git checkout -b ${targetBranch}`,
          { timeoutMs: 60000 }
        );
      }
    }

    const diffHead = await sbx.commands.run(
      `cd ${activeDir} && git --no-pager diff --no-color HEAD`,
      {
        timeoutMs: 3600000,
      }
    );

    const patch = await sbx.commands.run(
      `cd ${activeDir} && git --no-pager diff --no-color --diff-filter=ACMR`,
      { timeoutMs: 3600000 }
    );

    let patchContent = patch?.stdout || diffHead?.stdout || "";

    // Add all changes and commit
    const { commitMessage } = await generateCommitMessage(
      patchContent,
      this.getModelConfig(),
      this.lastPrompt || ""
    );

    await sbx.commands.run(
      `cd ${activeDir} && git add -A && git commit -m "${commitMessage}"`,
      { timeoutMs: 3600000 }
    );

    // Push the branch to GitHub
    await sbx.commands.run(
      `cd ${activeDir} && git push -u origin ${targetBranch}`,
      {
        timeoutMs: 3600000,
      }
    );

    // Auto cleanup worktree after push if enabled
    if (useWorktree && wtPath && this.config.worktrees?.cleanup !== false) {
      await sbx.commands.run(`git worktree remove --force ${wtPath}`, {
        timeoutMs: 60000,
      });
    }
  }

  public async createPullRequest(
    repository: string,
    labelOptions?: LabelOptions,
    branchPrefix?: string
  ): Promise<PullRequestResult> {
    const githubToken = this.config.secrets?.GH_TOKEN;

    if (!githubToken || !repository) {
      throw new Error(
        "GitHub token and repository are required for creating pull requests. Please provide GH_TOKEN in secrets and repository parameter."
      );
    }

    const commandConfig = this.getCommandConfig("", "code");
    const sbx = await this.getSandbox();
    const useWorktree = !!this.config.worktrees?.enabled;
    // Get the current branch (base branch) BEFORE creating a new branch
    const baseDir =
      useWorktree && this.currentBranch && this.currentWorktreeDir
        ? this.currentWorktreeDir
        : this.WORKING_DIR;
    const baseBranch = await sbx.commands.run(
      `cd ${baseDir} && git rev-parse --abbrev-ref HEAD`,
      { timeoutMs: 3600000 }
    );

    // Debug: Check git status first
    await sbx.commands.run(`cd ${baseDir} && git status --porcelain`, {
      timeoutMs: 3600000,
    });

    // Debug: Check for untracked files
    const untrackedFiles = await sbx.commands.run(
      `cd ${baseDir} && git ls-files --others --exclude-standard`,
      { timeoutMs: 3600000 }
    );

    const diffHead = await sbx.commands.run(
      `cd ${baseDir} && git --no-pager diff --no-color HEAD`,
      {
        timeoutMs: 3600000,
      }
    );

    const patch = await sbx.commands.run(
      `cd ${baseDir} && git --no-pager diff --no-color --diff-filter=ACMR`,
      { timeoutMs: 3600000 }
    );

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
      await sbx.commands.run(`cd ${this.WORKING_DIR} && git add .`, {
        timeoutMs: 3600000,
      });

      const patchAfterAdd = await sbx.commands.run(
        `cd ${this.WORKING_DIR} && git --no-pager diff --no-color --cached`,
        { timeoutMs: 3600000 }
      );
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

    const checkout = await sbx.commands.run(
      `cd ${baseDir} && git checkout -b ${_branchName} && git add -A && git commit -m "${escapedCommitMessage}"`,
      {
        timeoutMs: 3600000,
      }
    );

    // Push the branch to GitHub
    await sbx.commands.run(
      `cd ${baseDir} && git push -u origin ${_branchName}`,
      {
        timeoutMs: 3600000,
      }
    );

    // Extract commit SHA from checkout output
    const commitMatch = checkout?.stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/);
    const commitSha = commitMatch ? commitMatch[1] : undefined;

    // Create Pull Request using GitHub API
    const [owner, repo] = repository?.split("/") || [];
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
  protected abstract getAgentType():
    | "codex"
    | "claude"
    | "opencode"
    | "gemini"
    | "grok";
  protected abstract getModelConfig(): ModelConfig;

  private async handlePRLabeling(
    owner: string,
    repo: string,
    prNumber: number,
    labelConfig: LabelOptions
  ) {
    const githubToken = this.config.secrets?.GH_TOKEN;
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
