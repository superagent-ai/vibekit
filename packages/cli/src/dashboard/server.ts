import { spawn, ChildProcess } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface DashboardStatus {
  running: boolean;
  port: number;
  url: string | null;
}

class DashboardServer {
  private port: number;
  private process: ChildProcess | null;
  private isRunning: boolean;

  constructor(port: number = 3001) {
    this.port = port;
    this.process = null;
    this.isRunning = false;
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(
        chalk.yellow(`📊 Dashboard already running on port ${this.port}`)
      );
      return;
    }

    return new Promise((resolve, reject) => {
      console.log(
        chalk.blue(`🚀 Starting analytics dashboard on port ${this.port}...`)
      );

      // Dashboard directory path - need to handle both source and dist locations
      // When running from dist, we need to navigate to the source dashboard directory
      const dashboardDir = __dirname.includes('dist') 
        ? join(__dirname, '..', 'src', 'dashboard')
        : __dirname;

      // Start dashboard using npx next dev directly to avoid npm script resolution issues
      // Next.js expects -p flag for port
      this.process = spawn(
        "npx",
        ["next", "dev", "--turbopack", "-p", this.port.toString()],
        {
          cwd: dashboardDir,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            PORT: this.port.toString(),
          },
          shell: true, // Use shell to allow command execution
        }
      );

      let startupOutput = "";
      let hasStarted = false;

      // Handle stdout
      this.process.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        startupOutput += output;
        console.log(chalk.gray(`[Dashboard] ${output.trim()}`)); // Debug output

        // Check if server has started successfully
        if (
          !hasStarted &&
          (output.includes("Ready in") ||
            output.includes("Local:") ||
            output.includes(`localhost:${this.port}`))
        ) {
          hasStarted = true;
          this.isRunning = true;
          console.log(chalk.green(`✅ Dashboard started successfully!`));
          console.log(
            chalk.cyan(`📊 Analytics Dashboard: http://localhost:${this.port}`)
          );
          resolve();
        }
      });

      // Handle stderr
      this.process.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        startupOutput += output;
        console.log(chalk.yellow(`[Dashboard Error] ${output.trim()}`)); // Debug output

        // Some Next.js warnings are normal, only worry about errors
        if (output.includes("Error:") || output.includes("EADDRINUSE")) {
          if (!hasStarted) {
            console.error(chalk.red("❌ Failed to start dashboard:"), output);
            reject(new Error(`Dashboard startup failed: ${output}`));
          }
        }
      });

      // Handle process exit
      this.process.on(
        "exit",
        (code: number | null, signal: NodeJS.Signals | null) => {
          this.isRunning = false;
          this.process = null;

          if (code !== 0 && !hasStarted) {
            const reason = signal ? `signal ${signal}` : `code ${code}`;
            reject(new Error(`Dashboard process exited with ${reason}`));
          } else if (code !== 0 || signal) {
            const reason = signal ? `signal: ${signal}` : `code: ${code}`;
            console.log(chalk.yellow(`📊 Dashboard stopped (${reason})`));
          }
        }
      );

      // Handle process errors
      this.process.on("error", (error: NodeJS.ErrnoException) => {
        this.isRunning = false;
        this.process = null;

        if (!hasStarted) {
          if (error.code === "ENOENT") {
            reject(
              new Error(
                "npm not found. Please ensure Node.js and npm are installed."
              )
            );
          } else {
            reject(new Error(`Failed to start dashboard: ${error.message}`));
          }
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!hasStarted) {
          this.stop();
          reject(new Error("Dashboard startup timeout"));
        }
      }, 30000);

      // Setup graceful shutdown
      const cleanup = () => {
        this.stop();
      };

      process.on("SIGINT", cleanup);
      process.on("SIGTERM", cleanup);
    });
  }

  stop(): void {
    if (this.process && this.isRunning) {
      console.log(chalk.blue("🛑 Stopping dashboard..."));

      // Try graceful shutdown first
      this.process.kill("SIGTERM");

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill("SIGKILL");
        }
      }, 5000);

      this.isRunning = false;
      this.process = null;
      console.log(chalk.green("✅ Dashboard stopped"));
    }
  }

  getStatus(): DashboardStatus {
    return {
      running: this.isRunning,
      port: this.port,
      url: this.isRunning ? `http://localhost:${this.port}` : null,
    };
  }

  async openInBrowser(): Promise<void> {
    if (!this.isRunning) {
      throw new Error("Dashboard is not running");
    }

    try {
      // Use child_process to open browser instead of 'open' package
      const { spawn } = await import("child_process");
      const url = `http://localhost:${this.port}`;

      // Cross-platform browser opening
      const platform = process.platform;
      let command: string;
      let args: string[];

      if (platform === "darwin") {
        command = "open";
        args = [url];
      } else if (platform === "win32") {
        command = "start";
        args = ["", url];
      } else {
        command = "xdg-open";
        args = [url];
      }

      spawn(command, args, { detached: true, stdio: "ignore" });
      console.log(chalk.green(`🌐 Opened dashboard in browser`));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.log(
        chalk.yellow(`⚠️ Could not open browser automatically: ${errorMessage}`)
      );
      console.log(
        chalk.blue(`📊 Please open manually: http://localhost:${this.port}`)
      );
    }
  }
}

export default DashboardServer;
