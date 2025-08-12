import { spawn, ChildProcess } from "child_process";
import { join } from "path";
import chalk from "chalk";
import fs from "fs-extra";
import os from "os";
import { execSync } from "child_process";

interface DashboardStatus {
  running: boolean;
  port: number;
  url: string | null;
}

class DashboardServer {
  private port: number;
  private process: ChildProcess | null;
  private isRunning: boolean;
  private dashboardDir: string;
  private packageName: string = "@vibe-kit/dashboard";

  constructor(port: number = 3001) {
    this.port = port;
    this.process = null;
    this.isRunning = false;
    this.dashboardDir = join(os.homedir(), ".vibekit", "dashboard");
  }

  private async ensureDashboardInstalled(): Promise<void> {
    if (!(await fs.pathExists(this.dashboardDir))) {
      console.log(chalk.blue("📦 Dashboard not found. Installing..."));
      
      await fs.ensureDir(join(os.homedir(), ".vibekit"));
      await fs.ensureDir(this.dashboardDir);
      
      try {
        console.log(chalk.gray(`Installing ${this.packageName}...`));
        execSync(`npm init -y && npm install ${this.packageName}@latest`, {
          cwd: this.dashboardDir,
          stdio: "inherit",
        });
        
        console.log(chalk.green("✅ Dashboard installed successfully!"));
      } catch (error) {
        await fs.remove(this.dashboardDir);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to install dashboard: ${errorMessage}`);
      }
    } else {
      const packagePath = join(this.dashboardDir, "node_modules", "@vibe-kit", "dashboard");
      
      if (!(await fs.pathExists(packagePath))) {
        console.log(chalk.blue("📦 Installing dashboard package..."));
        execSync(`npm install ${this.packageName}@latest`, {
          cwd: this.dashboardDir,
          stdio: "inherit",
        });
      } else {
        // Check for updates every time dashboard starts
        await this.checkAndUpdateDashboard();
      }
    }
  }

  private async checkAndUpdateDashboard(): Promise<void> {
    try {
      console.log(chalk.blue("🔍 Checking for dashboard updates..."));
      
      // Get current installed version
      const packageJsonPath = join(this.dashboardDir, "node_modules", "@vibe-kit", "dashboard", "package.json");
      if (!(await fs.pathExists(packageJsonPath))) {
        console.log(chalk.yellow("⚠️ Dashboard package.json not found, reinstalling..."));
        execSync(`npm install ${this.packageName}@latest`, {
          cwd: this.dashboardDir,
          stdio: "inherit",
        });
        return;
      }

      const packageJson = await fs.readJson(packageJsonPath);
      const currentVersion = packageJson.version;

      // Get latest version from npm
      const result = execSync(`npm view ${this.packageName} version`, {
        cwd: this.dashboardDir,
        encoding: 'utf8'
      });
      const latestVersion = result.trim();

      if (currentVersion !== latestVersion) {
        console.log(chalk.blue(`🔄 Updating dashboard from v${currentVersion} to v${latestVersion}...`));
        execSync(`npm install ${this.packageName}@latest`, {
          cwd: this.dashboardDir,
          stdio: "inherit",
        });
        console.log(chalk.green("✅ Dashboard updated successfully!"));
      } else {
        console.log(chalk.gray(`✓ Dashboard is up-to-date (v${currentVersion})`));
      }
    } catch (error) {
      // Don't fail the start process if update check fails
      console.log(chalk.yellow("⚠️ Could not check for dashboard updates, continuing with current version..."));
    }
  }


  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(
        chalk.yellow(`📊 Dashboard already running on port ${this.port}`)
      );
      return;
    }

    await this.ensureDashboardInstalled();

    return new Promise<void>(async (resolve, reject) => {
      console.log(
        chalk.blue(`🚀 Starting analytics dashboard on port ${this.port}...`)
      );

      const packagePath = join(this.dashboardDir, "node_modules", "@vibe-kit", "dashboard");
      const standalonePath = join(packagePath, ".next", "standalone", "packages", "dashboard", "server.js");
      
      if (!(await fs.pathExists(standalonePath))) {
        reject(new Error("Dashboard build not found. Package may be corrupted."));
        return;
      }

      // Copy static assets to the correct location for standalone build
      const staticSourcePath = join(packagePath, ".next", "static");
      const staticTargetPath = join(packagePath, ".next", "standalone", "packages", "dashboard", ".next", "static");
      const publicSourcePath = join(packagePath, "public");
      const publicTargetPath = join(packagePath, ".next", "standalone", "packages", "dashboard", "public");
      
      try {
        if (await fs.pathExists(staticSourcePath)) {
          await fs.copy(staticSourcePath, staticTargetPath, { overwrite: true });
        }
        if (await fs.pathExists(publicSourcePath)) {
          await fs.copy(publicSourcePath, publicTargetPath, { overwrite: true });
        }
      } catch (error) {
        console.log(chalk.yellow("⚠️ Could not copy static assets:", error instanceof Error ? error.message : String(error)));
      }

      this.process = spawn(
        "node",
        ["server.js"],
        {
          cwd: join(packagePath, ".next", "standalone", "packages", "dashboard"),
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            PORT: this.port.toString(),
            HOSTNAME: "localhost",
            NODE_ENV: "production",
          },
        }
      );

      let hasStarted = false;

      this.process.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log(chalk.gray(`[Dashboard] ${output.trim()}`));

        if (
          !hasStarted &&
          (output.includes("Ready in") ||
            output.includes("Local:") ||
            output.includes(`localhost:${this.port}`) ||
            output.includes("server started on") ||
            output.includes("ready on"))
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

      this.process.stderr?.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log(chalk.yellow(`[Dashboard Error] ${output.trim()}`));

        if (output.includes("Error:") || output.includes("EADDRINUSE")) {
          if (!hasStarted) {
            console.error(chalk.red("❌ Failed to start dashboard:"), output);
            reject(new Error(`Dashboard startup failed: ${output}`));
          }
        }
      });

      this.process.on("exit", (code: number | null) => {
        this.isRunning = false;
        this.process = null;

        if (code !== 0 && !hasStarted) {
          reject(new Error(`Dashboard process exited with code ${code}`));
        } else if (code !== 0) {
          console.log(chalk.yellow(`📊 Dashboard stopped (code: ${code})`));
        }
      });

      this.process.on("error", (error: NodeJS.ErrnoException) => {
        this.isRunning = false;
        this.process = null;

        if (!hasStarted) {
          if (error.code === "ENOENT") {
            reject(
              new Error(
                "Node.js not found. Please ensure Node.js is installed."
              )
            );
          } else {
            reject(new Error(`Failed to start dashboard: ${error.message}`));
          }
        }
      });

      setTimeout(() => {
        if (!hasStarted) {
          this.stop();
          reject(new Error("Dashboard startup timeout"));
        }
      }, 30000);

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

      this.process.kill("SIGTERM");

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
    const url = `http://localhost:${this.port}`;

    try {
      const platform = process.platform;
      let command: string;

      if (platform === "darwin") {
        command = `open "${url}"`;
      } else if (platform === "win32") {
        command = `start "" "${url}"`;
      } else {
        command = `xdg-open "${url}"`;
      }

      execSync(command);
      console.log(chalk.green(`🌐 Opened dashboard in browser`));
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.log(
        chalk.yellow(`⚠️ Could not open browser automatically: ${errorMessage}`)
      );
      console.log(chalk.blue(`📊 Please open manually: ${url}`));
    }
  }

  async update(): Promise<void> {
    console.log(chalk.blue("🔄 Updating dashboard..."));
    
    try {
      console.log(chalk.gray("Updating to latest version..."));
      execSync(`npm install ${this.packageName}@latest`, {
        cwd: this.dashboardDir,
        stdio: "inherit",
      });
      
      console.log(chalk.green("✅ Dashboard updated successfully!"));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update dashboard: ${errorMessage}`);
    }
  }
}

class DashboardManager {
  private servers: Map<number, DashboardServer>;

  constructor() {
    this.servers = new Map();
  }

  getDashboardServer(port: number = 3001): DashboardServer {
    if (!this.servers.has(port)) {
      this.servers.set(port, new DashboardServer(port));
    }
    return this.servers.get(port)!;
  }

  stop(port: number): void {
    const server = this.servers.get(port);
    if (server) {
      server.stop();
      this.servers.delete(port);
    }
  }

  stopAll(): void {
    for (const [, server] of this.servers) {
      server.stop();
    }
    this.servers.clear();
  }
}

const dashboardManager = new DashboardManager();

export default dashboardManager;