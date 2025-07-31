/**
 * VibeKit Local CLI Commands
 *
 * Complete implementation of local sandbox management commands
 * with persistent storage, real environment tracking, and VibeKit integration.
 */

import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import enquirer from "enquirer";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import {
  LocalSandboxProvider,
  createLocalProvider,
  type LocalConfig,
  type AgentType,
} from "@vibe-kit/dagger";

const { prompt } = enquirer;

// Environment management interfaces (duplicated to avoid import issues)
interface EnvironmentRecord {
  id: string;
  name: string;
  status: "running" | "stopped" | "paused" | "error";
  agentType?: AgentType;
  branch?: string;
  created: Date;
  lastUsed: Date;
  sandboxId: string;
  workingDirectory: string;
  envVars: Record<string, string>;
  dockerImage?: string;
  pid?: number;
  githubToken?: string;
  model?: string;
  apiKey?: string;
}

// Configuration helpers
function loadDotEnv(): void {
  const envPath = ".env";
  if (existsSync(envPath)) {
    try {
      const content = require("fs").readFileSync(envPath, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#")) {
          const [key, ...valueParts] = trimmed.split("=");
          if (key && valueParts.length > 0) {
            const value = valueParts.join("=").replace(/^["'](.*)["']$/, "$1");
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    } catch (error) {
      // Ignore .env file parsing errors
    }
  }
}

function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

function parseEnvVars(envString: string): Record<string, string> {
  const envVars: Record<string, string> = {};

  if (!envString) {
    return envVars;
  }

  const pairs = envString.split(",");
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split("=");
    if (key && valueParts.length > 0) {
      const value = valueParts.join("=").trim();
      envVars[key.trim()] = value;
    }
  }

  return envVars;
}

function generateEnvironmentName(agentType?: string): string {
  const timestamp = Date.now().toString(36);
  const prefix = agentType || "env";
  return `${prefix}-${timestamp}`;
}

function validateEnvironmentName(name: string): boolean | string {
  if (!name.trim()) {
    return "Environment name cannot be empty";
  }

  if (name.length > 50) {
    return "Environment name must be 50 characters or less";
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    return "Environment name can only contain letters, numbers, hyphens, and underscores";
  }

  return true;
}

function getStatusColor(status: EnvironmentRecord["status"]) {
  switch (status) {
    case "running":
      return chalk.green;
    case "stopped":
      return chalk.gray;
    case "paused":
      return chalk.yellow;
    case "error":
      return chalk.red;
    default:
      return chalk.gray;
  }
}

// Simple file-based storage for environments
class SimpleEnvironmentStore {
  private storePath = join(homedir(), ".vibekit", "environments.json");

  async ensureDir(): Promise<void> {
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  async load(): Promise<EnvironmentRecord[]> {
    await this.ensureDir();

    if (!existsSync(this.storePath)) {
      return [];
    }

    try {
      const content = await readFile(this.storePath, "utf-8");
      const data = JSON.parse(content);
      return data.map((env: any) => ({
        ...env,
        created: new Date(env.created),
        lastUsed: new Date(env.lastUsed),
      }));
    } catch (error) {
      return [];
    }
  }

  async save(environments: EnvironmentRecord[]): Promise<void> {
    await this.ensureDir();
    await writeFile(this.storePath, JSON.stringify(environments, null, 2));
  }

  async add(env: EnvironmentRecord): Promise<void> {
    const environments = await this.load();

    // Check for duplicate names
    const existing = environments.find((e) => e.name === env.name);
    if (existing) {
      throw new Error(`Environment with name '${env.name}' already exists`);
    }

    environments.push(env);
    await this.save(environments);
  }

  async update(id: string, updates: Partial<EnvironmentRecord>): Promise<void> {
    const environments = await this.load();
    const index = environments.findIndex((env) => env.id === id);

    if (index === -1) {
      throw new Error(`Environment with id '${id}' not found`);
    }

    environments[index] = { ...environments[index], ...updates };
    await this.save(environments);
  }

  async delete(id: string): Promise<void> {
    const environments = await this.load();
    const filteredEnvironments = environments.filter((env) => env.id !== id);

    if (filteredEnvironments.length === environments.length) {
      throw new Error(`Environment with id '${id}' not found`);
    }

    await this.save(filteredEnvironments);
  }

  async findByName(name: string): Promise<EnvironmentRecord | null> {
    const environments = await this.load();
    return environments.find((env) => env.name === name) || null;
  }

  async findById(id: string): Promise<EnvironmentRecord | null> {
    const environments = await this.load();
    return environments.find((env) => env.id === id) || null;
  }
}

const store = new SimpleEnvironmentStore();

let localProvider: LocalSandboxProvider | null = null;

function getLocalProvider(): LocalSandboxProvider {
  if (!localProvider) {
    loadDotEnv();

    const config: LocalConfig = {
      preferRegistryImages: getEnv("VIBEKIT_PREFER_REGISTRY_IMAGES") === "true",
      dockerHubUser: getEnv("DOCKER_USERNAME"),
    };

    localProvider = createLocalProvider(config);
  }
  return localProvider;
}

/**
 * Enhanced create command with full configuration
 */
export async function createCommand(options: {
  name?: string;
  agent?: string;
  workingDirectory?: string;
  env?: string;
  githubToken?: string;
  model?: string;
  apiKey?: string;
  timeout?: string;
}) {
  try {
    const spinner = ora("Creating sandbox environment...").start();

    // Load environment variables
    loadDotEnv();

    // Get or generate environment name
    let envName = options.name;
    if (!envName) {
      envName = generateEnvironmentName(options.agent);
    } else {
      const validation = validateEnvironmentName(envName);
      if (validation !== true) {
        spinner.fail(validation as string);
        return;
      }
    }

    // Check if name already exists
    const existing = await store.findByName(envName);
    if (existing) {
      spinner.fail(`Environment '${envName}' already exists`);
      return;
    }

    const provider = getLocalProvider();

    // Parse environment variables
    const envVars = parseEnvVars(options.env || "");

    // Add API key to environment variables if provided
    if (options.apiKey) {
      const agentType = (options.agent as AgentType) || "claude";
      switch (agentType) {
        case "claude":
          envVars.ANTHROPIC_API_KEY = options.apiKey;
          break;
        case "codex":
          envVars.OPENAI_API_KEY = options.apiKey;
          break;
        case "gemini":
          envVars.GOOGLE_API_KEY = options.apiKey;
          break;
        case "opencode":
          envVars.GROQ_API_KEY = options.apiKey;
          break;
      }
    }

    const agentType = (options.agent as AgentType) || undefined;
    const workingDirectory = options.workingDirectory || "/vibe0";

    spinner.text = "Creating sandbox instance...";
    const sandbox = await provider.create(envVars, agentType, workingDirectory);

    // Create environment record
    const envRecord: EnvironmentRecord = {
      id: sandbox.sandboxId,
      name: envName,
      status: "running",
      agentType,
      created: new Date(),
      lastUsed: new Date(),
      sandboxId: sandbox.sandboxId,
      workingDirectory,
      envVars,
      githubToken: options.githubToken || getEnv("GITHUB_TOKEN"),
      model: options.model,
      apiKey: options.apiKey,
    };

    await store.add(envRecord);

    spinner.succeed(`Environment '${envName}' created successfully!`);

    console.log(chalk.green("\n✅ Environment created!"));
    console.log(chalk.cyan(`📦 Name: ${envName}`));
    console.log(chalk.cyan(`🆔 ID: ${sandbox.sandboxId}`));
    if (agentType) {
      console.log(chalk.cyan(`🤖 Agent: ${agentType}`));
    }
    if (options.model) {
      console.log(chalk.cyan(`🧠 Model: ${options.model}`));
    }
    console.log(chalk.cyan(`📁 Working Directory: ${workingDirectory}`));

    if (Object.keys(envVars).length > 0) {
      console.log(
        chalk.cyan(
          `🔧 Environment Variables: ${Object.keys(envVars).join(", ")}`
        )
      );
    }

    console.log(chalk.yellow("\n💡 Next steps:"));
    console.log(
      chalk.gray(
        `  • Run commands: vibekit local exec -e ${envName} -c "your-command"`
      )
    );
    console.log(
      chalk.gray(
        `  • Generate code: vibekit local generate -e ${envName} -p "your-prompt"`
      )
    );
    console.log(chalk.gray(`  • List environments: vibekit local list`));
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to create environment: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Enhanced list command with real data
 */
export async function listCommand(options: {
  status?: string;
  agent?: string;
  branch?: string;
  json?: boolean;
  all?: boolean;
}) {
  try {
    let environments = await store.load();

    // Apply filters
    if (options.status) {
      environments = environments.filter(
        (env) => env.status === options.status
      );
    }
    if (options.agent) {
      environments = environments.filter(
        (env) => env.agentType === options.agent
      );
    }
    if (options.branch) {
      environments = environments.filter(
        (env) => env.branch === options.branch
      );
    }
    if (!options.all) {
      // By default, only show running and paused environments
      environments = environments.filter(
        (env) => env.status === "running" || env.status === "paused"
      );
    }

    if (options.json) {
      console.log(JSON.stringify(environments, null, 2));
      return;
    }

    if (environments.length === 0) {
      console.log(chalk.yellow("📭 No environments found"));
      return;
    }

    console.log(chalk.blue("\n📦 VibeKit Local Environments\n"));

    // Calculate column widths
    const nameWidth = Math.max(4, ...environments.map((e) => e.name.length));
    const agentWidth = Math.max(
      5,
      ...environments.map((e) => (e.agentType || "").length)
    );
    const statusWidth = Math.max(
      6,
      ...environments.map((e) => e.status.length)
    );

    // Header
    console.log(
      chalk.cyan("NAME".padEnd(nameWidth)) +
        "  " +
        chalk.cyan("AGENT".padEnd(agentWidth)) +
        "  " +
        chalk.cyan("STATUS".padEnd(statusWidth)) +
        "  " +
        chalk.cyan("CREATED") +
        "  " +
        chalk.cyan("LAST USED")
    );

    console.log("─".repeat(nameWidth + agentWidth + statusWidth + 30));

    // Rows
    for (const env of environments) {
      const statusColor = getStatusColor(env.status);
      console.log(
        env.name.padEnd(nameWidth) +
          "  " +
          (env.agentType || "").padEnd(agentWidth) +
          "  " +
          statusColor(env.status.padEnd(statusWidth)) +
          "  " +
          env.created.toLocaleDateString().padEnd(10) +
          "  " +
          env.lastUsed.toLocaleDateString()
      );
    }

    console.log();
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to list environments: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Generate code using AI agent in environment
 */
export async function generateCommand(options: {
  env?: string;
  prompt?: string;
  mode?: "ask" | "code";
  branch?: string;
  history?: string;
  stream?: boolean;
  saveTo?: string;
}) {
  try {
    const spinner = ora("Preparing to generate code...").start();

    // Get environment
    let env: EnvironmentRecord;
    if (options.env) {
      const foundEnv =
        (await store.findByName(options.env)) ||
        (await store.findById(options.env));
      if (!foundEnv) {
        spinner.fail(`Environment '${options.env}' not found`);
        return;
      }
      env = foundEnv;
    } else {
      // Interactive selection
      const environments = await store.load();
      if (environments.length === 0) {
        spinner.fail(
          'No environments found. Create one first with "vibekit local create"'
        );
        return;
      }

      spinner.stop();

      const { selectedEnv } = await prompt<{ selectedEnv: string }>({
        type: "select",
        name: "selectedEnv",
        message: "Select environment:",
        choices: environments.map((env) => ({
          name: env.name,
          message: `${env.name} (${env.agentType || "default"}, ${env.status})`,
          value: env.name,
        })),
      });

      const foundSelectedEnv = await store.findByName(selectedEnv);
      if (!foundSelectedEnv) {
        console.error(chalk.red(`Environment '${selectedEnv}' not found`));
        return;
      }
      env = foundSelectedEnv;

      spinner.start("Preparing to generate code...");
    }

    // Get prompt
    let promptText = options.prompt;
    if (!promptText) {
      spinner.stop();
      const result = await prompt<{ text: string }>({
        type: "input",
        name: "text",
        message: "Enter your prompt:",
      });
      promptText = result.text;
    }

    // Load conversation history if provided
    let history: any[] = [];
    if (options.history && existsSync(options.history)) {
      try {
        const historyContent = await readFile(options.history, "utf-8");
        history = JSON.parse(historyContent);
      } catch (error) {
        console.warn(
          chalk.yellow(
            `⚠️ Could not load history file: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    }

    // Create VibeKit instance from environment
    spinner.text = "Setting up AI agent...";

    // Load environment variables for API keys
    loadDotEnv();

    // Check if agent has required API key
    const agentType = env.agentType || "claude";
    let apiKey = env.apiKey;

    if (!apiKey) {
      // Try to get from environment variables
      switch (agentType) {
        case "claude":
          apiKey = getEnv("ANTHROPIC_API_KEY");
          break;
        case "codex":
          apiKey = getEnv("OPENAI_API_KEY");
          break;
        case "gemini":
          apiKey = getEnv("GOOGLE_API_KEY");
          break;
        case "opencode":
          apiKey = getEnv("GROQ_API_KEY") || getEnv("OPENAI_API_KEY");
          break;
      }
    }

    if (!apiKey) {
      spinner.fail(
        `No API key found for ${agentType} agent. Set the appropriate environment variable or use --api-key when creating the environment.`
      );
      return;
    }

    // Import VibeKit dynamically and create with builder pattern
    spinner.text = "Initializing VibeKit...";
    const { VibeKit } = await import("@vibe-kit/sdk");
    const { createLocalProvider } = await import("@vibe-kit/dagger");

    // Get the correct model provider for the agent type
    const getModelProvider = (agentType: string): string => {
      switch (agentType) {
        case "claude":
          return "anthropic";
        case "codex":
          return "openai";
        case "gemini":
          return "google";
        case "opencode":
          return "groq";
        default:
          return "openai";
      }
    };

    // Get default model for agent type
    const getDefaultModel = (agentType: string): string => {
      switch (agentType) {
        case "claude":
          return "claude-3-5-sonnet-20241022";
        case "codex":
          return "gpt-4o";
        case "gemini":
          return "gemini-1.5-pro";
        case "opencode":
          return "llama-3.1-70b-versatile";
        default:
          return "gpt-4o";
      }
    };

    // Create local sandbox provider
    const sandboxProvider = createLocalProvider();

    // Create VibeKit instance using builder pattern
    const vibekit = new VibeKit()
      .withAgent({
        type: agentType as any,
        provider: getModelProvider(agentType) as any,
        apiKey,
        model: env.model || getDefaultModel(agentType),
      })
      .withSandbox(sandboxProvider)
      .withWorkingDirectory(env.workingDirectory);

    // Add GitHub config if available
    if (env.githubToken && getEnv("GITHUB_REPOSITORY")) {
      vibekit.withGithub({
        token: env.githubToken,
        repository: getEnv("GITHUB_REPOSITORY")!,
      });
    }

    // Add session if we have a sandbox ID
    if (env.sandboxId) {
      vibekit.withSession(env.sandboxId);
    }

    // Add telemetry if enabled
    const telemetryEnabled = getEnv("VIBEKIT_TELEMETRY_ENABLED") === "true";
    if (telemetryEnabled) {
      vibekit.withTelemetry({
        enabled: true,
        sessionId: getEnv("VIBEKIT_TELEMETRY_SESSION_ID"),
      });
    }

    spinner.text = "Generating code...";

    // Generate code - note: callbacks and some features may not be available in current VibeKit version
    const response = await vibekit.generateCode({
      prompt: promptText,
      mode: options.mode || "code",
      branch: options.branch,
      history,
    });

    // Update environment last used time
    await store.update(env.id, { lastUsed: new Date() });

    if (spinner.isSpinning) {
      spinner.succeed("Code generation completed!");
    }

    // Save response if requested
    if (options.saveTo) {
      await writeFile(options.saveTo, JSON.stringify(response, null, 2));
      console.log(chalk.green(`💾 Response saved to ${options.saveTo}`));
    }

    // Display results
    console.log(chalk.green("\n✅ Code Generation Complete!"));

    if (response.stdout) {
      console.log(chalk.blue("\n📤 Generated Output:"));
      console.log(response.stdout);
    }

    if (response.stderr) {
      console.log(chalk.yellow("\n📤 Execution Errors:"));
      console.log(response.stderr);
    }

    console.log(chalk.cyan(`\n🔢 Exit Code: ${response.exitCode}`));
    console.log(chalk.cyan(`📦 Sandbox ID: ${response.sandboxId}`));
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to generate code: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Execute command in environment
 */
export async function execCommand(options: {
  env?: string;
  command?: string;
  timeout?: string;
  background?: boolean;
  stream?: boolean;
  saveOutput?: string;
}) {
  try {
    const spinner = ora("Preparing to execute command...").start();

    // Get environment
    let env: EnvironmentRecord;
    if (options.env) {
      const foundEnv =
        (await store.findByName(options.env)) ||
        (await store.findById(options.env));
      if (!foundEnv) {
        spinner.fail(`Environment '${options.env}' not found`);
        return;
      }
      env = foundEnv;
    } else {
      // Interactive selection
      const environments = await store.load();
      if (environments.length === 0) {
        spinner.fail(
          'No environments found. Create one first with "vibekit local create"'
        );
        return;
      }

      spinner.stop();

      const { selectedEnv } = await prompt<{ selectedEnv: string }>({
        type: "select",
        name: "selectedEnv",
        message: "Select environment:",
        choices: environments.map((env) => ({
          name: env.name,
          message: `${env.name} (${env.agentType || "default"}, ${env.status})`,
          value: env.name,
        })),
      });

      const foundSelectedEnv = await store.findByName(selectedEnv);
      if (!foundSelectedEnv) {
        console.error(chalk.red(`Environment '${selectedEnv}' not found`));
        return;
      }
      env = foundSelectedEnv;

      spinner.start("Preparing to execute command...");
    }

    // Get command
    let command = options.command;
    if (!command) {
      spinner.stop();
      const result = await prompt<{ cmd: string }>({
        type: "input",
        name: "cmd",
        message: "Enter command to execute:",
      });
      command = result.cmd;
    }

    const provider = getLocalProvider();

    spinner.text = `Executing command in ${env.name}...`;

    // Resume sandbox
    const sandbox = await provider.resume(env.sandboxId);

    // Set up streaming if enabled
    if (options.stream) {
      sandbox.on("update", (message: string) => {
        spinner.stop();
        console.log(chalk.blue("📤"), message);
      });

      sandbox.on("error", (error: string) => {
        spinner.stop();
        console.error(chalk.red("❌"), error);
      });
    }

    const result = await sandbox.commands.run(command, {
      timeoutMs: options.timeout ? parseInt(options.timeout) : 30000,
      background: options.background,
      onStdout: options.stream
        ? (data: string) => {
            if (spinner.isSpinning) spinner.stop();
            console.log(chalk.blue("📤"), data);
          }
        : undefined,
      onStderr: options.stream
        ? (data: string) => {
            if (spinner.isSpinning) spinner.stop();
            console.error(chalk.yellow("📤 STDERR:"), data);
          }
        : undefined,
    });

    // Update last used time
    await store.update(env.id, { lastUsed: new Date() });

    if (spinner.isSpinning) {
      spinner.succeed(`Command completed (exit code: ${result.exitCode})`);
    }

    // Save output if requested
    if (options.saveOutput) {
      const output = {
        command,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timestamp: new Date().toISOString(),
        environment: env.name,
      };
      await writeFile(options.saveOutput, JSON.stringify(output, null, 2));
      console.log(chalk.green(`💾 Output saved to ${options.saveOutput}`));
    }

    console.log(
      chalk.green(`\n✅ Command completed (exit code: ${result.exitCode})`)
    );
    if (!options.stream && result.stdout) {
      console.log(chalk.blue("\n📤 STDOUT:"));
      console.log(result.stdout);
    }
    if (!options.stream && result.stderr) {
      console.log(chalk.yellow("\n📤 STDERR:"));
      console.log(result.stderr);
    }
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to execute command: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Create a pull request from the current environment
 */
export async function createPullRequestCommand(options: {
  env?: string;
  title?: string;
  body?: string;
  branch?: string;
  labels?: string;
  draft?: boolean;
  autoMerge?: boolean;
}) {
  try {
    const spinner = ora("Preparing to create pull request...").start();

    // Get environment
    let env: EnvironmentRecord;
    if (options.env) {
      const foundEnv =
        (await store.findByName(options.env)) ||
        (await store.findById(options.env));
      if (!foundEnv) {
        spinner.fail(`Environment '${options.env}' not found`);
        return;
      }
      env = foundEnv;
    } else {
      // Interactive selection
      const environments = await store.load();
      if (environments.length === 0) {
        spinner.fail(
          'No environments found. Create one first with "vibekit local create"'
        );
        return;
      }

      spinner.stop();

      const { selectedEnv } = await prompt<{ selectedEnv: string }>({
        type: "select",
        name: "selectedEnv",
        message: "Select environment:",
        choices: environments.map((env) => ({
          name: env.name,
          message: `${env.name} (${env.agentType || "default"}, ${env.status})`,
          value: env.name,
        })),
      });

      const foundSelectedEnv = await store.findByName(selectedEnv);
      if (!foundSelectedEnv) {
        console.error(chalk.red(`Environment '${selectedEnv}' not found`));
        return;
      }
      env = foundSelectedEnv;

      spinner.start("Preparing to create pull request...");
    }

    // Check if environment has GitHub token
    if (!env.githubToken) {
      spinner.fail(
        "GitHub token not configured for this environment. Set GITHUB_TOKEN or provide --github-token when creating the environment."
      );
      return;
    }

    // Check if GitHub repository is configured
    const repository = getEnv("GITHUB_REPOSITORY");
    if (!repository) {
      spinner.fail(
        "GitHub repository not configured. Set GITHUB_REPOSITORY environment variable."
      );
      return;
    }

    // Load environment variables for API keys
    loadDotEnv();

    // Check if agent has required API key
    const agentType = env.agentType || "claude";
    let apiKey = env.apiKey;

    if (!apiKey) {
      // Try to get from environment variables
      switch (agentType) {
        case "claude":
          apiKey = getEnv("ANTHROPIC_API_KEY");
          break;
        case "codex":
          apiKey = getEnv("OPENAI_API_KEY");
          break;
        case "gemini":
          apiKey = getEnv("GOOGLE_API_KEY");
          break;
        case "opencode":
          apiKey = getEnv("GROQ_API_KEY") || getEnv("OPENAI_API_KEY");
          break;
      }
    }

    if (!apiKey) {
      spinner.fail(
        `No API key found for ${agentType} agent. Set the appropriate environment variable or use --api-key when creating the environment.`
      );
      return;
    }

    // Import VibeKit dynamically and create with builder pattern
    spinner.text = "Initializing VibeKit...";
    const { VibeKit } = await import("@vibe-kit/sdk");
    const { createLocalProvider } = await import("@vibe-kit/dagger");

    // Get the correct model provider for the agent type
    const getModelProvider = (agentType: string): string => {
      switch (agentType) {
        case "claude":
          return "anthropic";
        case "codex":
          return "openai";
        case "gemini":
          return "google";
        case "opencode":
          return "groq";
        default:
          return "openai";
      }
    };

    // Get default model for agent type
    const getDefaultModel = (agentType: string): string => {
      switch (agentType) {
        case "claude":
          return "claude-3-5-sonnet-20241022";
        case "codex":
          return "gpt-4o";
        case "gemini":
          return "gemini-1.5-pro";
        case "opencode":
          return "llama-3.1-70b-versatile";
        default:
          return "gpt-4o";
      }
    };

    // Create local sandbox provider
    const sandboxProvider = createLocalProvider();

    // Create VibeKit instance using builder pattern
    const vibekit = new VibeKit()
      .withAgent({
        type: agentType as any,
        provider: getModelProvider(agentType) as any,
        apiKey,
        model: env.model || getDefaultModel(agentType),
      })
      .withSandbox(sandboxProvider)
      .withGithub({
        token: env.githubToken,
        repository,
      })
      .withWorkingDirectory(env.workingDirectory);

    // Add session if we have a sandbox ID
    if (env.sandboxId) {
      vibekit.withSession(env.sandboxId);
    }

    // Add telemetry if enabled
    const telemetryEnabled = getEnv("VIBEKIT_TELEMETRY_ENABLED") === "true";
    if (telemetryEnabled) {
      vibekit.withTelemetry({
        enabled: true,
        sessionId: getEnv("VIBEKIT_TELEMETRY_SESSION_ID"),
      });
    }

    spinner.text = "Creating pull request...";

    // Create pull request (labels will be handled automatically by the agent)
    const response = await vibekit.createPullRequest(
      undefined, // LabelOptions - let the agent handle labeling
      options.branch
    );

    // Update environment last used time
    await store.update(env.id, { lastUsed: new Date() });

    spinner.succeed("Pull request created successfully!");

    // Display results
    console.log(chalk.green("\n✅ Pull Request Created!"));
    console.log(chalk.cyan(`📝 Title: ${response.title}`));
    console.log(chalk.cyan(`🔗 URL: ${response.html_url}`));
    console.log(chalk.cyan(`🌿 Branch: ${response.head.ref}`));
    console.log(chalk.cyan(`📊 Status: ${response.state}`));
    console.log(chalk.cyan(`#️⃣ Number: #${response.number}`));

    if (response.body) {
      console.log(chalk.blue("\n📄 Description:"));
      console.log(response.body);
    }

    if (options.autoMerge && response.mergeable) {
      console.log(
        chalk.yellow(
          "\n🔄 Auto-merge is enabled but requires additional setup in your repository settings."
        )
      );
    }
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to create pull request: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Enhanced delete command with proper cleanup
 */
export async function deleteCommand(
  options: {
    force?: boolean;
    all?: boolean;
    interactive?: boolean;
    cleanup?: boolean;
  },
  names?: string[]
) {
  try {
    let envsToDelete: EnvironmentRecord[] = [];

    if (options.all) {
      envsToDelete = await store.load();
    } else if (names && names.length > 0) {
      for (const name of names) {
        const env =
          (await store.findByName(name)) || (await store.findById(name));
        if (env) {
          envsToDelete.push(env);
        } else {
          console.log(chalk.yellow(`⚠️ Environment '${name}' not found`));
        }
      }
    } else if (options.interactive) {
      const environments = await store.load();
      if (environments.length === 0) {
        console.log(chalk.yellow("📭 No environments to delete"));
        return;
      }

      const { selectedEnvs } = await prompt<{ selectedEnvs: string[] }>({
        type: "multiselect",
        name: "selectedEnvs",
        message: "Select environments to delete:",
        choices: environments.map((env) => ({
          name: env.name,
          message: `${env.name} (${env.agentType || "default"}, ${env.status})`,
          value: env.name,
        })),
      });

      envsToDelete = environments.filter((env) =>
        selectedEnvs.includes(env.name)
      );
    } else {
      console.error(
        chalk.red(
          "❌ Please specify environment names, use --all, or use --interactive"
        )
      );
      process.exit(1);
    }

    if (envsToDelete.length === 0) {
      console.log(chalk.yellow("📭 No environments selected for deletion"));
      return;
    }

    // Confirm deletion unless --force is used
    if (!options.force) {
      const envNames = envsToDelete.map((e) => e.name).join(", ");
      const { confirmed } = await prompt<{ confirmed: boolean }>({
        type: "confirm",
        name: "confirmed",
        message: `Are you sure you want to delete ${envsToDelete.length} environment(s): ${envNames}?`,
        initial: false,
      });

      if (!confirmed) {
        console.log(chalk.yellow("❌ Deletion cancelled"));
        return;
      }
    }

    const spinner = ora("Deleting environments...").start();

    let deletedCount = 0;
    const provider = getLocalProvider();

    for (const env of envsToDelete) {
      try {
        spinner.text = `Deleting ${env.name}...`;

        // If environment has a running sandbox, kill it
        if (env.status === "running") {
          try {
            const sandbox = await provider.resume(env.sandboxId);
            await sandbox.kill();
            console.log(chalk.gray(`🔪 Killed sandbox for ${env.name}`));
          } catch (killError) {
            console.warn(
              chalk.yellow(
                `⚠️ Could not kill sandbox for ${env.name}: ${
                  killError instanceof Error
                    ? killError.message
                    : String(killError)
                }`
              )
            );
          }
        }

        // Remove from storage
        await store.delete(env.id);
        deletedCount++;
      } catch (error) {
        console.warn(
          chalk.yellow(
            `⚠️ Error deleting ${env.name}: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        );
      }
    }

    spinner.succeed(`✅ Deleted ${deletedCount} environment(s)`);

    if (options.cleanup) {
      console.log(chalk.blue("\n🧹 Additional cleanup options:"));
      console.log(
        chalk.gray("  • Clean Docker containers: docker container prune")
      );
      console.log(chalk.gray("  • Clean Docker images: docker image prune"));
      console.log(chalk.gray("  • Clean Docker volumes: docker volume prune"));
    }
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to delete environments: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Connect to environment for interactive shell access using Dagger's terminal() method
 */
export async function connectCommand(options: {
  env?: string;
  shell?: string;
  container?: string;
}) {
  try {
    const spinner = ora("Connecting to environment...").start();

    // Get environment
    let env: EnvironmentRecord;
    if (options.env) {
      const foundEnv =
        (await store.findByName(options.env)) ||
        (await store.findById(options.env));
      if (!foundEnv) {
        spinner.fail(`Environment '${options.env}' not found`);
        return;
      }
      env = foundEnv;
    } else {
      // Interactive selection
      const environments = await store.load();
      if (environments.length === 0) {
        spinner.fail(
          'No environments found. Create one first with "vibekit local create"'
        );
        return;
      }

      spinner.stop();

      const { selectedEnv } = await prompt<{ selectedEnv: string }>({
        type: "select",
        name: "selectedEnv",
        message: "Select environment:",
        choices: environments.map((env) => ({
          name: env.name,
          message: `${env.name} (${env.agentType || "default"}, ${env.status})`,
          value: env.name,
        })),
      });

      const foundSelectedEnv = await store.findByName(selectedEnv);
      if (!foundSelectedEnv) {
        console.error(chalk.red(`Environment '${selectedEnv}' not found`));
        return;
      }
      env = foundSelectedEnv;

      spinner.start("Connecting to environment...");
    }

    const provider = getLocalProvider();

    spinner.text = `Connecting to ${env.name}...`;

    // Resume sandbox
    const sandbox = await provider.resume(env.sandboxId);

    // Update last used time
    await store.update(env.id, { lastUsed: new Date() });

    spinner.succeed(`Connected to ${env.name}!`);

    console.log(chalk.green(`\n🔗 Connected to environment: ${env.name}`));
    console.log(chalk.cyan(`📦 Sandbox ID: ${env.sandboxId}`));
    console.log(chalk.cyan(`📁 Working Directory: ${env.workingDirectory}`));

    // Use Dagger's interactive terminal feature
    const shell = options.shell || "bash";
    const containerImage = options.container || "alpine";

    console.log(
      chalk.yellow(`\n🐚 Starting Dagger interactive terminal with ${shell}...`)
    );
    console.log(
      chalk.gray(
        "Using Dagger's Container.terminal() method for proper interactive access."
      )
    );
    console.log(
      chalk.gray('Type "exit" to disconnect from the environment.\n')
    );

    try {
      // Create a Dagger workflow that opens an interactive terminal
      // This follows the pattern from the Dagger docs: https://docs.dagger.io/api/terminal/
      const daggerCommand = `
        cd ${env.workingDirectory} && \\
        dagger call container \\
          --from=${containerImage} \\
          --with-workdir=${env.workingDirectory} \\
          ${Object.entries(env.envVars)
            .map(([key, value]) => `--with-env-variable=${key}="${value}"`)
            .join(" ")} \\
          --with-exec="sh,-c,cd ${env.workingDirectory}" \\
          terminal \\
          ${shell !== "sh" ? `--cmd=${shell}` : ""}
      `
        .replace(/\s+/g, " ")
        .trim();

      // Execute the Dagger terminal command
      const result = await sandbox.commands.run(daggerCommand, {
        timeoutMs: 0, // No timeout for interactive sessions
        background: false,
        onStdout: (data: string) => {
          process.stdout.write(data);
        },
        onStderr: (data: string) => {
          process.stderr.write(data);
        },
      });

      console.log(
        chalk.green(
          `\n✅ Disconnected from ${env.name} (exit code: ${result.exitCode})`
        )
      );
    } catch (terminalError) {
      console.log(
        chalk.yellow(
          "\n⚠️ Dagger terminal method failed, falling back to direct shell access..."
        )
      );

      // Fallback to direct shell execution if Dagger terminal fails
      const fallbackCommand = `cd ${env.workingDirectory} && ${shell}`;

      await sandbox.commands.run(fallbackCommand, {
        timeoutMs: 0, // No timeout for interactive sessions
        background: false,
        onStdout: (data: string) => {
          process.stdout.write(data);
        },
        onStderr: (data: string) => {
          process.stderr.write(data);
        },
      });

      console.log(chalk.green(`\n✅ Disconnected from ${env.name}`));
    }
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to connect to environment: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Show environment status and health information
 */
export async function statusCommand(options: {
  env?: string;
  verbose?: boolean;
}) {
  try {
    if (options.env) {
      // Show status for specific environment
      const env =
        (await store.findByName(options.env)) ||
        (await store.findById(options.env));
      if (!env) {
        console.error(chalk.red(`Environment '${options.env}' not found`));
        return;
      }

      console.log(chalk.blue(`\n📊 Environment Status: ${env.name}\n`));

      console.log(chalk.cyan(`🆔 ID: ${env.id}`));
      console.log(chalk.cyan(`📦 Sandbox ID: ${env.sandboxId}`));
      console.log(
        chalk.cyan(`📊 Status: ${getStatusColor(env.status)(env.status)}`)
      );

      if (env.agentType) {
        console.log(chalk.cyan(`🤖 Agent: ${env.agentType}`));
      }
      if (env.model) {
        console.log(chalk.cyan(`🧠 Model: ${env.model}`));
      }

      console.log(chalk.cyan(`📁 Working Directory: ${env.workingDirectory}`));
      console.log(chalk.cyan(`🕐 Created: ${env.created.toLocaleString()}`));
      console.log(chalk.cyan(`🕑 Last Used: ${env.lastUsed.toLocaleString()}`));

      if (env.branch) {
        console.log(chalk.cyan(`🌿 Branch: ${env.branch}`));
      }

      if (options.verbose && Object.keys(env.envVars).length > 0) {
        console.log(chalk.cyan(`🔧 Environment Variables:`));
        for (const [key, value] of Object.entries(env.envVars)) {
          console.log(
            chalk.gray(
              `   ${key}=${value.substring(0, 50)}${
                value.length > 50 ? "..." : ""
              }`
            )
          );
        }
      }

      // Try to check if sandbox is actually running
      if (env.status === "running") {
        try {
          const provider = getLocalProvider();
          const sandbox = await provider.resume(env.sandboxId);
          const health = await sandbox.commands.run('echo "ping"', {
            timeoutMs: 5000,
          });

          if (health.exitCode === 0) {
            console.log(chalk.green(`✅ Sandbox is healthy and responsive`));
          } else {
            console.log(
              chalk.yellow(`⚠️ Sandbox may not be responding properly`)
            );
          }
        } catch (error) {
          console.log(
            chalk.red(
              `❌ Sandbox health check failed: ${
                error instanceof Error ? error.message : String(error)
              }`
            )
          );
        }
      }
    } else {
      // Show summary of all environments
      const environments = await store.load();

      if (environments.length === 0) {
        console.log(chalk.yellow("📭 No environments found"));
        return;
      }

      console.log(chalk.blue("\n📊 Environment Status Summary\n"));

      const statusCounts = environments.reduce((acc, env) => {
        acc[env.status] = (acc[env.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log(chalk.cyan(`📦 Total Environments: ${environments.length}`));

      for (const [status, count] of Object.entries(statusCounts)) {
        const color = getStatusColor(status as any);
        console.log(chalk.cyan(`${color("●")} ${status}: ${count}`));
      }

      // Show recent activity
      const recentEnvs = environments
        .sort((a, b) => b.lastUsed.getTime() - a.lastUsed.getTime())
        .slice(0, 3);

      if (recentEnvs.length > 0) {
        console.log(chalk.blue("\n🕑 Most Recently Used:"));
        for (const env of recentEnvs) {
          const timeDiff = Date.now() - env.lastUsed.getTime();
          const timeAgo =
            timeDiff < 60000
              ? "just now"
              : timeDiff < 3600000
              ? `${Math.floor(timeDiff / 60000)}m ago`
              : timeDiff < 86400000
              ? `${Math.floor(timeDiff / 3600000)}h ago`
              : `${Math.floor(timeDiff / 86400000)}d ago`;

          console.log(chalk.gray(`  • ${env.name} (${timeAgo})`));
        }
      }
    }
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to get status: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Show logs for an environment
 */
export async function logsCommand(options: {
  env?: string;
  lines?: string;
  follow?: boolean;
}) {
  try {
    // Get environment
    let env: EnvironmentRecord;
    if (options.env) {
      const foundEnv =
        (await store.findByName(options.env)) ||
        (await store.findById(options.env));
      if (!foundEnv) {
        console.error(chalk.red(`Environment '${options.env}' not found`));
        return;
      }
      env = foundEnv;
    } else {
      // Interactive selection
      const environments = await store.load();
      if (environments.length === 0) {
        console.error(
          chalk.red(
            'No environments found. Create one first with "vibekit local create"'
          )
        );
        return;
      }

      const { selectedEnv } = await prompt<{ selectedEnv: string }>({
        type: "select",
        name: "selectedEnv",
        message: "Select environment:",
        choices: environments.map((env) => ({
          name: env.name,
          message: `${env.name} (${env.agentType || "default"}, ${env.status})`,
          value: env.name,
        })),
      });

      const foundSelectedEnv = await store.findByName(selectedEnv);
      if (!foundSelectedEnv) {
        console.error(chalk.red(`Environment '${selectedEnv}' not found`));
        return;
      }
      env = foundSelectedEnv;
    }

    const provider = getLocalProvider();

    console.log(chalk.blue(`\n📜 Logs for environment: ${env.name}\n`));

    try {
      // Resume sandbox
      const sandbox = await provider.resume(env.sandboxId);

      // Show logs (this is a simple implementation - in practice you might want to show Docker logs)
      const lines = options.lines || "50";
      const command = options.follow
        ? `tail -f -n ${lines} /var/log/syslog`
        : `tail -n ${lines} /var/log/syslog || echo "No system logs available"`;

      const result = await sandbox.commands.run(command, {
        timeoutMs: options.follow ? 0 : 30000,
        background: false,
        onStdout: (data: string) => {
          console.log(chalk.blue("📤"), data);
        },
        onStderr: (data: string) => {
          console.log(chalk.yellow("📤 STDERR:"), data);
        },
      });

      if (!options.follow) {
        console.log(
          chalk.green(`\n✅ Logs displayed (exit code: ${result.exitCode})`)
        );
      }
    } catch (error) {
      console.error(
        chalk.red(
          `❌ Failed to get logs: ${
            error instanceof Error ? error.message : String(error)
          }`
        )
      );
    }
  } catch (error) {
    console.error(
      chalk.red(
        `\n❌ Failed to access environment: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    );
    process.exit(1);
  }
}

/**
 * Run a command in a sandbox (simplified for backwards compatibility)
 */
export async function runCommand(options: {
  sandbox?: string;
  command?: string;
  agent?: string;
  streaming?: boolean;
}) {
  // Map old parameters to new exec command
  return execCommand({
    env: options.sandbox,
    command: options.command,
    stream: options.streaming,
  });
}

/**
 * Display help and tips for using the local provider
 */
export async function helpCommand() {
  console.log(chalk.blue("\n🔧 VibeKit Local Provider\n"));
  console.log(
    "Manage local Dagger-based sandbox environments for AI development.\n"
  );

  console.log(chalk.green("Available Commands:"));
  console.log("  create     Create a new sandbox environment");
  console.log("  list       List sandbox environments");
  console.log("  exec       Execute commands in environments");
  console.log("  generate   Generate code using AI agent");
  console.log("  pr         Create a pull request from environment");
  console.log("  connect    Connect for interactive shell access");
  console.log("  status     Show environment status and health");
  console.log("  logs       Show environment logs");
  console.log("  delete     Delete sandbox environments");
  console.log("  run        Run a command (alias for exec)");
  console.log("  help       Show this help message\n");

  console.log(chalk.green("Agent Types:"));
  console.log("  claude     Claude-optimized environment");
  console.log("  codex      OpenAI Codex environment");
  console.log("  opencode   Open source model environment");
  console.log("  gemini     Google Gemini environment\n");

  console.log(chalk.green("Examples:"));
  console.log("  vibekit local create --agent claude --name my-claude-env");
  console.log("  vibekit local list --status running");
  console.log('  vibekit local exec -e my-claude-env -c "npm install"');
  console.log(
    '  vibekit local generate -e my-claude-env -p "Add error handling"'
  );
  console.log('  vibekit local pr -e my-claude-env --title "Fix bug"');
  console.log("  vibekit local connect -e my-claude-env --shell bash");
  console.log("  vibekit local status -e my-claude-env --verbose");
  console.log("  vibekit local delete --interactive\n");

  console.log(chalk.green("Environment Variables:"));
  console.log("  ANTHROPIC_API_KEY     For Claude agent");
  console.log("  OPENAI_API_KEY        For Codex agent");
  console.log("  GOOGLE_API_KEY        For Gemini agent");
  console.log("  GROQ_API_KEY          For OpenCode agent");
  console.log("  GITHUB_TOKEN          For Git operations\n");
}

/**
 * Create the enhanced local command with all subcommands
 */
export function createLocalCommand(): Command {
  const localCmd = new Command("local");
  localCmd.description("Manage local Dagger-based sandbox environments");

  // Enhanced create command
  localCmd
    .command("create")
    .description("Create a new sandbox environment")
    .option("--name <name>", "Environment name")
    .option("--agent <type>", "Agent type (claude, codex, opencode, gemini)")
    .option(
      "--working-directory <path>",
      "Working directory in sandbox",
      "/vibe0"
    )
    .option("--env <vars>", "Environment variables (key=value,key2=value2)")
    .option("--github-token <token>", "GitHub token for git operations")
    .option("--model <model>", "Specific model to use for the agent")
    .option("--api-key <key>", "API key for the agent")
    .option("--timeout <ms>", "Default timeout for commands (ms)")
    .action(createCommand);

  // Enhanced list command
  localCmd
    .command("list")
    .alias("ls")
    .description("List sandbox environments")
    .option("--status <status>", "Filter by status (running, stopped, error)")
    .option("--agent <agent>", "Filter by agent type")
    .option("--branch <branch>", "Filter by branch")
    .option("--json", "Output as JSON")
    .option("--all", "Include stopped environments")
    .action(listCommand);

  // Generate code command
  localCmd
    .command("generate")
    .description("Generate code using AI agent")
    .option("-e, --env <name>", "Environment name to use")
    .option("-p, --prompt <prompt>", "Code generation prompt")
    .option("-m, --mode <mode>", "Generation mode (ask|code)", "code")
    .option("--branch <branch>", "Branch context for generation")
    .option("--history <file>", "JSON file with conversation history")
    .option("--stream", "Enable streaming output")
    .option("--save-to <file>", "Save response to file")
    .action(generateCommand);

  // New exec command
  localCmd
    .command("exec")
    .description("Execute command in sandbox environment")
    .option("-e, --env <name>", "Environment name to use")
    .option("-c, --command <cmd>", "Command to execute")
    .option("-t, --timeout <ms>", "Timeout in milliseconds")
    .option("-b, --background", "Run in background")
    .option("--stream", "Enable streaming output")
    .option("--save-output <file>", "Save output to file")
    .action(execCommand);

  // Create pull request command
  localCmd
    .command("pr")
    .description("Create a pull request from the current environment")
    .option("-e, --env <name>", "Environment name to use")
    .option("--title <title>", "Pull request title")
    .option("--body <body>", "Pull request description")
    .option("--branch <branch>", "Target branch for PR")
    .option("--labels <labels>", "Comma-separated list of label names")
    .option("--draft", "Create as draft pull request")
    .option("--auto-merge", "Enable auto-merge (requires repo settings)")
    .action(createPullRequestCommand);

  // Enhanced delete command
  localCmd
    .command("delete [names...]")
    .alias("rm")
    .description("Delete sandbox environments")
    .option("--force", "Force deletion without confirmation")
    .option("--all", "Delete all environments")
    .option("--interactive", "Interactive selection mode")
    .option("--cleanup", "Show additional cleanup commands")
    .action((names, options) => deleteCommand(options, names));

  // Connect command
  localCmd
    .command("connect")
    .description(
      "Connect to environment for interactive shell access using Dagger terminal"
    )
    .option("-e, --env <name>", "Environment name to use")
    .option("--shell <shell>", "Shell to use (bash, zsh, sh)", "bash")
    .option(
      "--container <image>",
      "Container image for Dagger terminal",
      "alpine"
    )
    .action(connectCommand);

  // Status command
  localCmd
    .command("status")
    .description("Show environment status and health information")
    .option("-e, --env <name>", "Show status for specific environment")
    .option("-v, --verbose", "Show detailed information")
    .action(statusCommand);

  // Logs command
  localCmd
    .command("logs")
    .description("Show logs for an environment")
    .option("-e, --env <name>", "Environment name to use")
    .option("-n, --lines <number>", "Number of lines to show", "50")
    .option("-f, --follow", "Follow log output")
    .action(logsCommand);

  // Backwards compatibility run command
  localCmd
    .command("run")
    .description("Run a command in a sandbox (alias for exec)")
    .option("--sandbox <id>", "Environment name or ID")
    .option("--command <cmd>", "Command to execute")
    .option("--agent <type>", "Agent type for new sandbox (deprecated)")
    .option("--streaming", "Enable real-time output streaming")
    .action(runCommand);

  // Help command
  localCmd
    .command("help")
    .description("Show detailed help and examples")
    .action(helpCommand);

  return localCmd;
}
