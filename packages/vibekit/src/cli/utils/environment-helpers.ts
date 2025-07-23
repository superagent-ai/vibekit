/**
 * Environment Helper Utilities
 *
 * Provides helper functions for working with sandbox environments
 * in CLI commands, including selection, creation, and management.
 */

import chalk from "chalk";
import enquirer from "enquirer";
import {
  loadConfig,
  createVibeKitConfig,
  getAgentConfig,
  getDefaultModel,
} from "./config.js";
import type { CLIConfig } from "./config.js";

// Import types and classes from local package
import type { EnvironmentRecord } from "@vibe-kit/dagger";
import type { AgentType } from "../../types.js";

// Define EnvironmentStore interface locally to avoid import issues
interface EnvironmentStore {
  load(): Promise<EnvironmentRecord[]>;
  save(env: EnvironmentRecord): Promise<void>;
  update(id: string, updates: Partial<EnvironmentRecord>): Promise<void>;
  delete(id: string): Promise<void>;
  findById(id: string): Promise<EnvironmentRecord | null>;
  findByName(name: string): Promise<EnvironmentRecord | null>;
  getByStatus(
    status: EnvironmentRecord["status"]
  ): Promise<EnvironmentRecord[]>;
  cleanup(olderThanDays?: number): Promise<string[]>;
}

const { prompt } = enquirer;

/**
 * Get environment by name with interactive fallback
 */
export async function getEnvironmentByName(
  name: string | undefined,
  store: EnvironmentStore
): Promise<EnvironmentRecord> {
  if (!name) {
    // Interactive selection
    const environments = await store.load();
    if (environments.length === 0) {
      throw new Error(
        'No environments found. Create one first with "vibekit local create"'
      );
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

    const env = await store.findByName(selectedEnv);
    if (!env) {
      throw new Error(`Environment '${selectedEnv}' not found`);
    }
    return env;
  }

  const env = await store.findByName(name);
  if (!env) {
    throw new Error(`Environment '${name}' not found`);
  }

  return env;
}

/**
 * Get environment by name or ID
 */
export async function getEnvironment(
  nameOrId: string | undefined,
  store: EnvironmentStore
): Promise<EnvironmentRecord> {
  if (!nameOrId) {
    return getEnvironmentByName(undefined, store);
  }

  // Try by name first, then by ID
  let env = await store.findByName(nameOrId);
  if (!env) {
    env = await store.findById(nameOrId);
  }

  if (!env) {
    throw new Error(`Environment '${nameOrId}' not found`);
  }

  return env;
}

/**
 * Create VibeKit instance from environment configuration
 */
export async function createVibeKitFromEnvironment(
  env: EnvironmentRecord,
  config?: CLIConfig
): Promise<any> {
  const cliConfig = config || loadConfig();

  // Import VibeKit dynamically to avoid circular dependencies
  const { VibeKit } = await import("../../core/vibekit.js");

  // Validate and cast agentType
  const agentType = (env.agentType as AgentType) || cliConfig.defaults.agent;
  const agentConfig = getAgentConfig(agentType, cliConfig);
  const model = agentConfig.model || getDefaultModel(agentType);

  // Build VibeKit instance using builder pattern
  const vibekit = new VibeKit()
    .withAgent({
      type: agentType,
      provider: "openai", // Default provider, could be made configurable
      apiKey: agentConfig.apiKey,
      model: model,
    })
    .withSession(env.sandboxId)
    .withWorkingDirectory(env.workingDirectory);

  // Add GitHub config if available and repository is set
  if (cliConfig.github && cliConfig.github.repository) {
    vibekit.withGithub(
      cliConfig.github as { token: string; repository: string }
    );
  }

  // Add telemetry if enabled
  if (cliConfig.telemetry.enabled) {
    vibekit.withTelemetry({
      enabled: true,
      sessionId: cliConfig.telemetry.sessionId,
    });
  }

  return vibekit;
}

/**
 * Display environment information
 */
export function displayEnvironmentInfo(env: EnvironmentRecord): void {
  console.log(chalk.cyan(`📦 Environment: ${env.name}`));
  console.log(chalk.gray(`   ID: ${env.id}`));
  console.log(
    chalk.gray(`   Status: ${getStatusColor(env.status)(env.status)}`)
  );
  if (env.agentType) {
    console.log(chalk.gray(`   Agent: ${env.agentType}`));
  }
  if (env.model) {
    console.log(chalk.gray(`   Model: ${env.model}`));
  }
  console.log(chalk.gray(`   Working Dir: ${env.workingDirectory}`));
  console.log(chalk.gray(`   Created: ${env.created.toLocaleString()}`));
  console.log(chalk.gray(`   Last Used: ${env.lastUsed.toLocaleString()}`));
  if (env.branch) {
    console.log(chalk.gray(`   Branch: ${env.branch}`));
  }
}

/**
 * Get color function for environment status
 */
export function getStatusColor(status: EnvironmentRecord["status"]) {
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

/**
 * Prompt for input with validation
 */
export async function promptForInput(
  message: string,
  defaultValue?: string,
  validator?: (input: string) => boolean | string
): Promise<string> {
  const { input } = await prompt<{ input: string }>({
    type: "input",
    name: "input",
    message,
    initial: defaultValue,
    validate: validator,
  });

  return input;
}

/**
 * Prompt for confirmation
 */
export async function promptForConfirmation(
  message: string,
  defaultValue: boolean = false
): Promise<boolean> {
  const { confirmed } = await prompt<{ confirmed: boolean }>({
    type: "confirm",
    name: "confirmed",
    message,
    initial: defaultValue,
  });

  return confirmed;
}

/**
 * Create a unique environment name
 */
export function generateEnvironmentName(agentType?: string): string {
  const timestamp = Date.now().toString(36);
  const prefix = agentType || "env";
  return `${prefix}-${timestamp}`;
}

/**
 * Validate environment name
 */
export function validateEnvironmentName(name: string): boolean | string {
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

/**
 * Parse environment variables from string
 */
export function parseEnvVars(envString: string): Record<string, string> {
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

/**
 * Format environment variables for display
 */
export function formatEnvVars(envVars: Record<string, string>): string {
  return Object.entries(envVars)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

/**
 * Check if environment is healthy
 */
export async function checkEnvironmentHealth(
  env: EnvironmentRecord,
  store: EnvironmentStore
): Promise<{ healthy: boolean; message?: string }> {
  try {
    // For now, just check if the environment exists and is not in error state
    if (env.status === "error") {
      return { healthy: false, message: "Environment is in error state" };
    }

    // Additional health checks could be added here
    // e.g., ping the sandbox, check if processes are running, etc.

    return { healthy: true };
  } catch (error) {
    return {
      healthy: false,
      message: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Display a list of environments in a formatted table
 */
export function displayEnvironmentList(
  environments: EnvironmentRecord[]
): void {
  if (environments.length === 0) {
    console.log(chalk.yellow("📭 No environments found"));
    return;
  }

  console.log(chalk.blue("\n📦 VibeKit Environments\n"));

  // Calculate column widths
  const nameWidth = Math.max(4, ...environments.map((e) => e.name.length));
  const agentWidth = Math.max(
    5,
    ...environments.map((e) => (e.agentType || "").length)
  );
  const statusWidth = Math.max(6, ...environments.map((e) => e.status.length));

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
}

/**
 * Get environment store instance
 */
export async function getEnvironmentStore() {
  const config = loadConfig();
  // Import EnvironmentStore class dynamically
  const { EnvironmentStore } = await import("@vibe-kit/dagger");
  return new EnvironmentStore(config.storage.path);
}
