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

  private async getLocalDashboardPath(): Promise<string | null> {
    // Check if we're in a VibeKit workspace by looking for local dashboard
    const currentDir = process.cwd();
    const possiblePaths = [
      join(currentDir, "packages", "dashboard"),
      join(currentDir, "..", "packages", "dashboard"), 
      join(currentDir, "..", "..", "packages", "dashboard"),
      join(__dirname, "..", "..", "..", "dashboard"),
      join(__dirname, "..", "..", "dashboard")
    ];

    for (const path of possiblePaths) {
      const serverPath = join(path, "server.js");
      if (await fs.pathExists(serverPath)) {
        return path;
      }
    }
    return null;
  }

  private async getPortFromSettings(): Promise<number> {
    try {
      const settingsPath = join(os.homedir(), '.vibekit', 'settings.json');
      if (await fs.pathExists(settingsPath)) {
        const settings = await fs.readJson(settingsPath);
        return settings.dashboard?.port || 3001;
      }
    } catch (error) {
      // Fall back to default if settings can't be read
    }
    return 3001;
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

    // Check for local development version first
    const localDashboardPath = await this.getLocalDashboardPath();
    let packagePath: string;
    let serverPath: string;

    if (localDashboardPath) {
      console.log(chalk.gray("🔧 Using local development dashboard..."));
      packagePath = localDashboardPath;
      serverPath = join(packagePath, "server.js");
    } else {
      await this.ensureDashboardInstalled();
      packagePath = join(this.dashboardDir, "node_modules", "@vibe-kit", "dashboard");
      serverPath = join(packagePath, "server.js");
    }

    return new Promise<void>(async (resolve, reject) => {
      // Get the port that will be used from settings
      const configuredPort = await this.getPortFromSettings();
      this.port = configuredPort; // Update our internal port
      
      console.log(
        chalk.blue(`🚀 Starting VibeKit Dashboard on port ${configuredPort}...`)
      );
      
      if (!(await fs.pathExists(serverPath))) {
        reject(new Error("Dashboard server not found. Package may be corrupted."));
        return;
      }

      // Use our new server.js which handles settings and port management
      this.process = spawn(
        "node",
        ["server.js"],
        {
          cwd: packagePath,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            NODE_ENV: localDashboardPath ? "development" : "production",
          },
        }
      );

      let hasStarted = false;

      this.process.stdout?.on("data", (data: Buffer) => {
        const output = data.toString();
        console.log(chalk.gray(`[Dashboard] ${output.trim()}`));

        if (
          !hasStarted &&
          (output.includes("VibeKit Dashboard ready!") ||
            output.includes("Local:") ||
            output.includes(`localhost:`) ||
            output.includes("server started on") ||
            output.includes("ready on"))
        ) {
          hasStarted = true;
          this.isRunning = true;
          
          // Extract the actual port from URL in output to confirm
          const urlMatch = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
          if (urlMatch) {
            const actualPort = parseInt(urlMatch[1]);
            if (actualPort !== this.port) {
              console.log(chalk.yellow(`⚠️  Port changed from ${this.port} to ${actualPort}`));
              this.port = actualPort;
            }
          }
          
          console.log(chalk.green(`✅ Dashboard started successfully!`));
          console.log(
            chalk.cyan(`📊 VibeKit Dashboard: http://localhost:${this.port}`)
          );
          console.log(chalk.gray(`   Process ID: ${this.process?.pid || 'unknown'}`));
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
  private server: DashboardServer | null = null;

  constructor() {}

  private async getPortFromSettings(): Promise<number> {
    try {
      const settingsPath = join(os.homedir(), '.vibekit', 'settings.json');
      if (await fs.pathExists(settingsPath)) {
        const settings = await fs.readJson(settingsPath);
        return settings.dashboard?.port || 3001;
      }
    } catch (error) {
      // Fall back to default if settings can't be read
    }
    return 3001;
  }

  async getDashboardServer(): Promise<DashboardServer> {
    if (!this.server) {
      const port = await this.getPortFromSettings();
      this.server = new DashboardServer(port);
    }
    return this.server;
  }

  stop(): void {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
  }

  stopAll(): void {
    this.stop();
  }
}

const dashboardManager = new DashboardManager();

export default dashboardManager;