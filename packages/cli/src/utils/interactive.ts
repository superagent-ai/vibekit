/**
 * Interactive CLI Utilities
 *
 * Provides interactive prompts, formatted output, and selection mechanisms
 * for local sandbox management.
 */

import enquirer from "enquirer";
import chalk from "chalk";
import { Environment } from "@vibe-kit/dagger";

const { prompt } = enquirer;

export interface EnvironmentChoice {
  name: string;
  value: string;
  description: string;
  disabled?: boolean;
}

export interface SelectionPromptResult {
  environment: string;
}

export interface MultiSelectPromptResult {
  environments: string[];
}

/**
 * Interactive environment selection prompt
 */
export async function selectEnvironmentPrompt(
  environments: Environment[],
  message: string = "Select an environment:"
): Promise<string | null> {
  if (environments.length === 0) {
    return null;
  }

  if (environments.length === 1) {
    return environments[0].name;
  }

  const choices = environments.map((env) => ({
    name: formatEnvironmentChoice(env),
    value: env.name,
    description: getEnvironmentDescription(env),
    disabled: env.status === "error",
  }));

  try {
    const result = await prompt<SelectionPromptResult>({
      type: "select",
      name: "environment",
      message,
      choices,
    });

    return result.environment;
  } catch (error) {
    // User cancelled (Ctrl+C)
    return null;
  }
}

/**
 * Multi-select environment prompt
 */
export async function multiSelectEnvironmentPrompt(
  environments: Environment[],
  message: string = "Select environments:"
): Promise<string[]> {
  if (environments.length === 0) {
    return [];
  }

  const choices = environments.map((env) => ({
    name: formatEnvironmentChoice(env),
    value: env.name,
    description: getEnvironmentDescription(env),
    disabled: env.status === "error",
  }));

  try {
    const result = await prompt<MultiSelectPromptResult>({
      type: "multiselect",
      name: "environments",
      message,
      choices,
    });

    return result.environments;
  } catch (error) {
    // User cancelled (Ctrl+C)
    return [];
  }
}

/**
 * Confirmation prompt
 */
export async function confirmPrompt(
  message: string,
  defaultValue: boolean = false
): Promise<boolean> {
  try {
    const result = await prompt<{ confirmed: boolean }>({
      type: "confirm",
      name: "confirmed",
      message,
      initial: defaultValue,
    });

    return result.confirmed;
  } catch (error) {
    // User cancelled (Ctrl+C)
    return false;
  }
}

/**
 * Text input prompt
 */
export async function textInputPrompt(
  message: string,
  defaultValue?: string,
  validate?: (input: string) => boolean | string
): Promise<string | null> {
  try {
    const result = await prompt<{ input: string }>({
      type: "input",
      name: "input",
      message,
      initial: defaultValue,
      validate: validate as any,
    });

    return result.input;
  } catch (error) {
    // User cancelled (Ctrl+C)
    return null;
  }
}

/**
 * Format environment for choice display
 */
function formatEnvironmentChoice(env: Environment): string {
  const statusIcon = getStatusIcon(env.status);
  const agentType =
    env.environment?.VIBEKIT_AGENT_TYPE || env.environment?.AGENT_TYPE;

  let display = `${statusIcon} ${env.name}`;

  if (agentType) {
    display += chalk.gray(` (${agentType})`);
  }

  return display;
}

/**
 * Get environment description for prompt
 */
function getEnvironmentDescription(env: Environment): string {
  const parts: string[] = [];

  if (env.branch) {
    parts.push(`branch: ${env.branch}`);
  }

  if (env.createdAt) {
    const created = new Date(env.createdAt);
    const ago = getTimeAgo(created);
    parts.push(`created ${ago}`);
  }

  parts.push(`status: ${env.status}`);

  return parts.join(", ");
}

/**
 * Get status icon for environment
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case "running":
      return "🟢";
    case "stopped":
      return "🔴";
    case "starting":
      return "🟡";
    case "stopping":
      return "🟡";
    case "error":
      return "💥";
    default:
      return "⚪";
  }
}

/**
 * Get human-readable time ago
 */
function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) {
    return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  } else if (diffHours > 0) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  } else if (diffMinutes > 0) {
    return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;
  } else {
    return "just now";
  }
}

/**
 * Format environments in a table-like display
 */
export function formatEnvironmentTable(environments: Environment[]): void {
  if (environments.length === 0) {
    console.log(chalk.yellow("📭 No environments found"));
    return;
  }

  console.log(chalk.blue("📋 Local Environments:"));
  console.log("");

  // Calculate column widths
  const nameWidth = Math.max(4, ...environments.map((env) => env.name.length));
  const statusWidth = Math.max(
    6,
    ...environments.map((env) => env.status.length)
  );
  const agentWidth = Math.max(
    5,
    ...environments.map((env) => {
      const agentType =
        env.environment?.VIBEKIT_AGENT_TYPE ||
        env.environment?.AGENT_TYPE ||
        "unknown";
      return agentType.length;
    })
  );

  // Header
  const header = [
    chalk.bold("NAME".padEnd(nameWidth)),
    chalk.bold("STATUS".padEnd(statusWidth)),
    chalk.bold("AGENT".padEnd(agentWidth)),
    chalk.bold("BRANCH"),
    chalk.bold("CREATED"),
  ].join("  ");

  console.log(header);
  console.log("-".repeat(header.length - 20)); // Subtract ANSI codes length

  // Rows
  for (const env of environments) {
    const statusIcon = getStatusIcon(env.status);
    const agentType =
      env.environment?.VIBEKIT_AGENT_TYPE ||
      env.environment?.AGENT_TYPE ||
      "unknown";
    const createdAt = env.createdAt
      ? getTimeAgo(new Date(env.createdAt))
      : "unknown";

    const row = [
      env.name.padEnd(nameWidth),
      `${statusIcon} ${getStatusColor(env.status)}`.padEnd(statusWidth + 2),
      chalk.cyan(agentType.padEnd(agentWidth)),
      (env.branch || "unknown").padEnd(15),
      chalk.gray(createdAt),
    ].join("  ");

    console.log(row);
  }

  console.log("");
}

/**
 * Get colored status text
 */
function getStatusColor(status: string): string {
  switch (status) {
    case "running":
      return chalk.green(status);
    case "stopped":
      return chalk.red(status);
    case "starting":
      return chalk.yellow(status);
    case "stopping":
      return chalk.yellow(status);
    case "error":
      return chalk.red(status);
    default:
      return chalk.gray(status);
  }
}

/**
 * Show progress with spinner and steps
 */
export class ProgressIndicator {
  private steps: string[] = [];
  private currentStep = 0;
  private spinner?: any;

  constructor(private totalSteps: number) {}

  addStep(description: string) {
    this.steps.push(description);
  }

  start(initialMessage?: string) {
    const ora = require("ora");
    this.spinner = ora(
      initialMessage || this.steps[0] || "Processing..."
    ).start();
  }

  nextStep(message?: string) {
    if (!this.spinner) return;

    this.currentStep++;
    const stepMessage =
      message || this.steps[this.currentStep] || `Step ${this.currentStep + 1}`;
    const progress = `[${this.currentStep}/${this.totalSteps}] ${stepMessage}`;

    this.spinner.text = progress;
  }

  succeed(message?: string) {
    if (!this.spinner) return;

    this.spinner.succeed(message || "Completed successfully");
  }

  fail(message?: string) {
    if (!this.spinner) return;

    this.spinner.fail(message || "Failed");
  }

  stop() {
    if (!this.spinner) return;

    this.spinner.stop();
  }
}

/**
 * Display help text with formatting
 */
export function displayHelp(sections: { title: string; content: string[] }[]) {
  for (const section of sections) {
    console.log(chalk.blue(`\n${section.title}:`));
    for (const line of section.content) {
      console.log(`  ${line}`);
    }
  }
  console.log("");
}

/**
 * Display tips and recommendations
 */
export function displayTips(tips: string[]) {
  if (tips.length === 0) return;

  console.log(chalk.yellow("\n💡 Tips:"));
  for (const tip of tips) {
    console.log(`  • ${tip}`);
  }
  console.log("");
}
