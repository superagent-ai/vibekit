import { Sandbox } from "@e2b/code-interpreter";

import { generatePRMetadata } from "./utils";
import {
  CodexConfig,
  CodexResponse,
  CodexStreamCallbacks,
  Conversation,
} from "../types";
import { trace } from "@opentelemetry/api";

export class CodexAgent {
  private config: CodexConfig;
  private sbx?: Sandbox;
  private lastPrompt?: string;

  constructor(config: CodexConfig) {
    this.config = config;
  }

  private async getSandbox(): Promise<Sandbox> {
    if (this.sbx) return this.sbx;
    if (this.config.sandboxId) {
      this.sbx = await Sandbox.resume(this.config.sandboxId, {
        apiKey: this.config.e2bApiKey,
      });
    } else {
      this.sbx = await Sandbox.create(
        this.config.e2bTemplateId || "super-codex",
        {
          envs: {
            OPENAI_API_KEY: this.config.openaiApiKey,
          },
          apiKey: this.config.e2bApiKey,
        }
      );
    }
    return this.sbx;
  }

  public async killSandbox() {
    if (this.sbx) {
      await this.sbx.kill();
      this.sbx = undefined;
    }
  }

  public async pauseSandbox() {
    if (this.sbx) {
      await this.sbx.pause();
    }
  }

  public async resumeSandbox() {
    if (this.sbx) {
      this.sbx = await Sandbox.resume(this.sbx.sandboxId, {
        apiKey: this.config.e2bApiKey,
      });
    }
  }

  /**
   * Call Codex to generate/apply code, return patch and helper script.
   */
  public async generateCode(
    prompt: string,
    mode?: "ask" | "code",
    history?: Conversation[],
    callbacks?: CodexStreamCallbacks
  ): Promise<CodexResponse> {
    const config = this.config;
    const tracer = trace.getTracer("vibekit");
    const instrumentedUpdate = (message: string) => {
      if (callbacks?.onUpdate) {
        tracer.startActiveSpan("codex.stream.update", (span) => {
          span.setAttribute("message.length", message.length);
          callbacks.onUpdate!(message);
          span.end();
        });
      }
    };
    const instrumentedError = (err: string) => {
      if (callbacks?.onError) {
        tracer.startActiveSpan("codex.stream.error", (span) => {
          span.setAttribute("error.message", err);
          callbacks.onError!(err);
          span.end();
        });
      }
    };
    let instruction: string;
    if (mode === "ask") {
      instruction =
        "Research the repository and answer the user's questions. " +
        "Do NOT make any changes to any files in the repository.";
    } else {
      instruction =
        "Do the necessary changes to the codebase based on the users input.\n" +
        "Don't ask any follow up questions.";
    }

    let _prompt = `${instruction}\n\nUser: ${prompt}`;

    if (history) {
      _prompt += `\n\Conversation history: ${history
        .map((h) => `${h.role}\n ${h.content}`)
        .join("\n\n")}`;
    }

    try {
      const sbx = await this.getSandbox();
      const repoDir = config.repoUrl.split("/")[1];
      if (!config.sandboxId && sbx.sandboxId) {
        instrumentedUpdate(`{"type": "start", "sandbox_id": "${sbx.sandboxId}"}`);
        instrumentedUpdate(
          `{"type": "git", "output": "Cloning repository: ${config.repoUrl}"}`
        );
        await sbx.commands.run(
          `git clone https://x-access-token:${config.githubToken}@github.com/${config.repoUrl}.git`,
          { timeoutMs: 3600000 }
        );
        // Set generic bot identity for git
        await sbx.commands.run(
          `cd ${repoDir} && git config user.name "github-actions[bot]" && git config user.email "github-actions[bot]@users.noreply.github.com"`,
          { timeoutMs: 60000 }
        );
      } else if (config.sandboxId) {
        instrumentedUpdate(
          `{"type": "start", "sandbox_id": "${config.sandboxId}"}`
        );
      }

      const result = await sbx.commands.run(
        `cd ${repoDir} && codex --approval-mode auto-edit${
          config.model ? ` -m ${config.model}` : ""
        } --quiet "${_prompt}"`,
        {
          timeoutMs: 3600000,
          onStdout: (data) => instrumentedUpdate(data),
          onStderr: (data) => instrumentedUpdate(data),
        }
      );

      instrumentedUpdate(
        `{"type": "end", "sandbox_id": "${sbx.sandboxId}", "output": "${
          JSON.stringify(result)
        }"}`
      );

      this.lastPrompt = prompt;

      return {
        sandboxId: sbx.sandboxId,
        ...result,
      };
    } catch (error) {
      console.error("Error calling Codex:", error);
      const errorMessage = `Failed to generate code: ${
        error instanceof Error ? error.message : String(error)
      }`;
      instrumentedError(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Create a Pull Request using the GitHub REST API.
   * This method handles the complete workflow:
   * 1. Creates a new branch
   * 2. Applies the patch via GitHub API
   * 3. Creates the PR
   */
  public async createPullRequest(): Promise<{
    html_url: string;
    number: number;
    branchName: string;
    commitSha?: string;
  }> {
    const { githubToken, repoUrl } = this.config;
    const repoDir = repoUrl.split("/")[1];

    // Get the current branch (base branch) BEFORE creating a new branch
    const baseBranch = await this.sbx?.commands.run(
      `cd ${repoDir} && git rev-parse --abbrev-ref HEAD`,
      { timeoutMs: 3600000 }
    );

    // Debug: Check git status first
    const gitStatus = await this.sbx?.commands.run(
      `cd ${repoDir} && git status --porcelain`,
      { timeoutMs: 3600000 }
    );
    console.log("Git status:", gitStatus);

    // Debug: Check for untracked files
    const untrackedFiles = await this.sbx?.commands.run(
      `cd ${repoDir} && git ls-files --others --exclude-standard`,
      { timeoutMs: 3600000 }
    );
    console.log("Untracked files:", untrackedFiles);

    // Debug: Try different diff commands
    const diffWorking = await this.sbx?.commands.run(
      `cd ${repoDir} && git diff`,
      { timeoutMs: 3600000 }
    );
    console.log("Git diff (working vs index):", diffWorking);

    const diffHead = await this.sbx?.commands.run(
      `cd ${repoDir} && git diff HEAD`,
      { timeoutMs: 3600000 }
    );
    console.log("Git diff HEAD (working vs last commit):", diffHead);

    const patch = await this.sbx?.commands.run(
      `cd ${repoDir} && git diff --diff-filter=ACMR`,
      { timeoutMs: 3600000 }
    );

    console.log("patch", patch);

    if (
      !patch ||
      (!patch.stdout && !diffHead?.stdout && !untrackedFiles?.stdout)
    ) {
      throw new Error(
        "No changes found - check if codex actually modified any files"
      );
    }

    // Use the diff that has content, preferring the original patch format
    let patchContent = patch?.stdout || diffHead?.stdout || "";

    // If no diff but there are untracked files, we need to add them first
    if (!patchContent && untrackedFiles?.stdout) {
      await this.sbx?.commands.run(`cd ${repoDir} && git add .`, {
        timeoutMs: 3600000,
      });

      const patchAfterAdd = await this.sbx?.commands.run(
        `cd ${repoDir} && git diff --cached`,
        { timeoutMs: 3600000 }
      );
      patchContent = patchAfterAdd?.stdout || "";
    }

    if (!patchContent) {
      throw new Error("No patch content found after checking all diff methods");
    }

    const { title, body, branchName, commitMessage } = await generatePRMetadata(
      patchContent,
      "codex",
      this.config.openaiApiKey,
      this.lastPrompt || ""
    );

    const checkout = await this.sbx?.commands.run(
      `cd ${repoDir} && git checkout -b ${branchName} && git add -A && git commit -m "${commitMessage}"`,
      { timeoutMs: 3600000 }
    );

    // Push the branch to GitHub
    await this.sbx?.commands.run(
      `cd ${repoDir} && git push origin ${branchName}`,
      {
        timeoutMs: 3600000,
      }
    );

    // Extract commit SHA from checkout output
    const commitMatch = checkout?.stdout.match(/\[[\w-]+ ([a-f0-9]+)\]/);
    const commitSha = commitMatch ? commitMatch[1] : undefined;

    // Create Pull Request using GitHub API
    const [owner, repo] = repoUrl.split("/");
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
          head: branchName,
          base: baseBranch?.stdout.trim() || "main",
        }),
      }
    );

    if (!prResponse.ok) {
      const errorText = await prResponse.text();
      throw new Error(`Failed to create PR: ${prResponse.status} ${errorText}`);
    }

    const prData = await prResponse.json();

    const labelName = "codex";

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
            color: "ededed",
            description: "Pull requests generated by Codex agent",
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
      `https://api.github.com/repos/${owner}/${repo}/issues/${prData.number}/labels`,
      {
        method: "POST",
        headers: {
          Authorization: `token ${githubToken}`,
          Accept: "application/vnd.github.v3+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ labels: [labelName] }),
      }
    );
    if (!addLabelResponse.ok) {
      const errorText = await addLabelResponse.text();
      console.error(
        `Failed to add label '${labelName}' to PR #${prData.number}: ${addLabelResponse.status} ${errorText}`
      );
    }

    await this.sbx?.pause();

    return {
      html_url: prData.html_url,
      number: prData.number,
      branchName,
      commitSha,
    };
  }
}
