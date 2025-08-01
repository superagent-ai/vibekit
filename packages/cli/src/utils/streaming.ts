/**
 * Log Streaming Utilities
 *
 * Provides real-time log streaming and multi-environment monitoring
 * for local sandbox environments.
 */

import { spawn, ChildProcess } from "child_process";
import chalk from "chalk";
import { Environment } from "@vibe-kit/dagger";

export interface LogEntry {
  timestamp: Date;
  environment: string;
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source?: string;
}

export interface StreamOptions {
  follow?: boolean;
  tail?: number;
  since?: Date;
  filter?: {
    level?: string[];
    source?: string[];
  };
}

export interface MultiStreamOptions extends StreamOptions {
  prefix?: boolean;
  colors?: boolean;
  interleave?: boolean;
}

/**
 * Log stream manager for single environment
 */
export class LogStream {
  private process: ChildProcess | null = null;
  private environment: Environment;
  private options: StreamOptions;
  private listeners: Set<(entry: LogEntry) => void> = new Set();

  constructor(environment: Environment, options: StreamOptions = {}) {
    this.environment = environment;
    this.options = { follow: true, ...options };
  }

  /**
   * Start streaming logs
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Build container-use log command
        const args = ["log", this.environment.name];

        if (this.options.follow) {
          args.push("--follow");
        }

        if (this.options.tail) {
          args.push("--tail", this.options.tail.toString());
        }

        if (this.options.since) {
          args.push("--since", this.options.since.toISOString());
        }

        this.process = spawn("container-use", args, {
          stdio: ["pipe", "pipe", "pipe"],
        });

        this.process.stdout?.on("data", (data: Buffer) => {
          const lines = data
            .toString()
            .split("\n")
            .filter((line) => line.trim());

          for (const line of lines) {
            const entry = this.parseLogLine(line);
            if (entry && this.shouldIncludeEntry(entry)) {
              this.listeners.forEach((listener) => listener(entry));
            }
          }
        });

        this.process.stderr?.on("data", (data: Buffer) => {
          const errorEntry: LogEntry = {
            timestamp: new Date(),
            environment: this.environment.name,
            level: "error",
            message: data.toString().trim(),
            source: "container-use",
          };
          this.listeners.forEach((listener) => listener(errorEntry));
        });

        this.process.on("error", (error) => {
          reject(error);
        });

        this.process.on("spawn", () => {
          resolve();
        });

        this.process.on("exit", (code) => {
          if (code !== 0) {
            console.warn(
              chalk.yellow(
                `Log stream for ${this.environment.name} exited with code ${code}`
              )
            );
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop streaming logs
   */
  stop(): void {
    if (this.process) {
      this.process.kill("SIGTERM");
      this.process = null;
    }
  }

  /**
   * Add log entry listener
   */
  onLogEntry(listener: (entry: LogEntry) => void): void {
    this.listeners.add(listener);
  }

  /**
   * Remove log entry listener
   */
  removeLogEntryListener(listener: (entry: LogEntry) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * Parse log line into structured entry
   */
  private parseLogLine(line: string): LogEntry | null {
    // Try to parse container log format: timestamp level message
    const match = line.match(
      /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[\.\d]*Z?)\s+(\w+)\s+(.+)$/
    );

    if (match) {
      const [, timestamp, level, message] = match;
      return {
        timestamp: new Date(timestamp),
        environment: this.environment.name,
        level: level.toLowerCase() as LogEntry["level"],
        message: message.trim(),
      };
    }

    // Fallback: treat entire line as message
    return {
      timestamp: new Date(),
      environment: this.environment.name,
      level: "info",
      message: line.trim(),
    };
  }

  /**
   * Check if log entry should be included based on filters
   */
  private shouldIncludeEntry(entry: LogEntry): boolean {
    if (this.options.filter?.level) {
      if (!this.options.filter.level.includes(entry.level)) {
        return false;
      }
    }

    if (this.options.filter?.source && entry.source) {
      if (!this.options.filter.source.includes(entry.source)) {
        return false;
      }
    }

    return true;
  }
}

/**
 * Multi-environment log stream manager
 */
export class MultiLogStream {
  private streams: Map<string, LogStream> = new Map();
  private environments: Environment[];
  private options: MultiStreamOptions;
  private colors: string[] = [
    "red",
    "green",
    "yellow",
    "blue",
    "magenta",
    "cyan",
    "white",
  ];
  private environmentColors: Map<string, string> = new Map();

  constructor(environments: Environment[], options: MultiStreamOptions = {}) {
    this.environments = environments;
    this.options = { prefix: true, colors: true, interleave: true, ...options };

    // Assign colors to environments
    this.assignColors();
  }

  /**
   * Start streaming logs from all environments
   */
  async start(): Promise<void> {
    const startPromises = this.environments.map(async (env) => {
      const stream = new LogStream(env, this.options);
      this.streams.set(env.name, stream);

      stream.onLogEntry((entry) => {
        this.handleLogEntry(entry);
      });

      try {
        await stream.start();
      } catch (error) {
        console.warn(
          chalk.yellow(`Failed to start log stream for ${env.name}: ${error}`)
        );
      }
    });

    await Promise.allSettled(startPromises);
  }

  /**
   * Stop streaming logs from all environments
   */
  stop(): void {
    for (const stream of this.streams.values()) {
      stream.stop();
    }
    this.streams.clear();
  }

  /**
   * Handle log entry from any environment
   */
  private handleLogEntry(entry: LogEntry): void {
    const formatted = this.formatLogEntry(entry);
    console.log(formatted);
  }

  /**
   * Format log entry for display
   */
  private formatLogEntry(entry: LogEntry): string {
    const timestamp = entry.timestamp.toLocaleTimeString();
    const level = this.formatLevel(entry.level);

    let prefix = "";
    if (this.options.prefix) {
      const envColor = this.environmentColors.get(entry.environment) || "white";
      const coloredEnv = this.colorText(entry.environment, envColor);
      prefix = `[${coloredEnv}] `;
    }

    return `${prefix}${chalk.gray(timestamp)} ${level} ${entry.message}`;
  }

  /**
   * Format log level with colors
   */
  private formatLevel(level: LogEntry["level"]): string {
    switch (level) {
      case "error":
        return chalk.red("ERROR");
      case "warn":
        return chalk.yellow("WARN ");
      case "info":
        return chalk.blue("INFO ");
      case "debug":
        return chalk.gray("DEBUG");
      default:
        return chalk.white(String(level).toUpperCase().padEnd(5));
    }
  }

  /**
   * Apply color to text based on color name
   */
  private colorText(text: string, color: string): string {
    switch (color) {
      case "red":
        return chalk.red(text);
      case "green":
        return chalk.green(text);
      case "yellow":
        return chalk.yellow(text);
      case "blue":
        return chalk.blue(text);
      case "magenta":
        return chalk.magenta(text);
      case "cyan":
        return chalk.cyan(text);
      case "white":
        return chalk.white(text);
      default:
        return chalk.white(text);
    }
  }

  /**
   * Assign colors to environments
   */
  private assignColors(): void {
    this.environments.forEach((env, index) => {
      const color = this.colors[index % this.colors.length];
      this.environmentColors.set(env.name, color);
    });
  }

  /**
   * Get statistics about the streams
   */
  getStats(): { environment: string; active: boolean; color: string }[] {
    return this.environments.map((env) => ({
      environment: env.name,
      active: this.streams.has(env.name),
      color: this.environmentColors.get(env.name) || "white",
    }));
  }
}

/**
 * Create interactive log viewer with controls
 */
export class InteractiveLogViewer {
  private multiStream: MultiLogStream;
  private paused = false;
  private buffer: LogEntry[] = [];
  private maxBufferSize = 1000;

  constructor(environments: Environment[], options: MultiStreamOptions = {}) {
    this.multiStream = new MultiLogStream(environments, options);
    this.setupKeyboardControls();
  }

  /**
   * Start interactive log viewing
   */
  async start(): Promise<void> {
    console.log(chalk.blue("📺 Interactive Log Viewer"));
    console.log(
      chalk.gray("Press Ctrl+C to exit, Space to pause/resume, H for help\n")
    );

    const stats = this.multiStream.getStats();
    console.log(chalk.blue("Watching environments:"));
    stats.forEach((stat) => {
      const statusIcon = stat.active ? "🟢" : "🔴";
      const coloredEnv = this.multiStream["colorText"](
        stat.environment,
        stat.color
      );
      console.log(`  ${statusIcon} ${coloredEnv}`);
    });
    console.log("");

    await this.multiStream.start();
  }

  /**
   * Stop interactive log viewing
   */
  stop(): void {
    this.multiStream.stop();
    process.stdin.setRawMode?.(false);
    process.stdin.removeAllListeners("data");
  }

  /**
   * Setup keyboard controls for interactive features
   */
  private setupKeyboardControls(): void {
    if (process.stdin.isTTY) {
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding("utf8");

      process.stdin.on("data", (key: string) => {
        switch (key) {
          case " ": // Space - pause/resume
            this.togglePause();
            break;
          case "h":
          case "H":
            this.showHelp();
            break;
          case "c":
          case "C":
            this.clearScreen();
            break;
          case "\u0003": // Ctrl+C
            this.stop();
            process.exit(0);
            break;
        }
      });
    }

    // Handle normal Ctrl+C
    process.on("SIGINT", () => {
      this.stop();
      console.log(chalk.gray("\nStopped watching logs"));
      process.exit(0);
    });
  }

  /**
   * Toggle pause/resume
   */
  private togglePause(): void {
    this.paused = !this.paused;
    const status = this.paused ? "PAUSED" : "RESUMED";
    const color = this.paused ? "yellow" : "green";
    console.log(chalk[color](`\n--- ${status} ---\n`));
  }

  /**
   * Show help
   */
  private showHelp(): void {
    console.log(chalk.blue("\n--- HELP ---"));
    console.log("  Space   - Pause/Resume log streaming");
    console.log("  C       - Clear screen");
    console.log("  H       - Show this help");
    console.log("  Ctrl+C  - Exit");
    console.log("");
  }

  /**
   * Clear screen
   */
  private clearScreen(): void {
    console.clear();
    console.log(chalk.blue("📺 Interactive Log Viewer (Screen cleared)\n"));
  }
}

/**
 * Utility functions for log streaming
 */

/**
 * Create simple log watcher for single environment
 */
export async function watchEnvironmentLogs(
  environment: Environment,
  options: StreamOptions = {}
): Promise<LogStream> {
  const stream = new LogStream(environment, options);

  stream.onLogEntry((entry) => {
    const timestamp = entry.timestamp.toLocaleTimeString();
    const level = formatSimpleLevel(entry.level);
    console.log(`${chalk.gray(timestamp)} ${level} ${entry.message}`);
  });

  await stream.start();
  return stream;
}

/**
 * Create multi-environment watcher
 */
export async function watchMultipleEnvironments(
  environments: Environment[],
  options: MultiStreamOptions = {}
): Promise<MultiLogStream> {
  const stream = new MultiLogStream(environments, options);
  await stream.start();
  return stream;
}

/**
 * Create interactive log viewer
 */
export async function createInteractiveViewer(
  environments: Environment[],
  options: MultiStreamOptions = {}
): Promise<InteractiveLogViewer> {
  const viewer = new InteractiveLogViewer(environments, options);
  await viewer.start();
  return viewer;
}

/**
 * Simple level formatting
 */
function formatSimpleLevel(level: LogEntry["level"]): string {
  switch (level) {
    case "error":
      return chalk.red("ERROR");
    case "warn":
      return chalk.yellow("WARN ");
    case "info":
      return chalk.blue("INFO ");
    case "debug":
      return chalk.gray("DEBUG");
    default:
      return chalk.white(String(level).toUpperCase().padEnd(5));
  }
}
