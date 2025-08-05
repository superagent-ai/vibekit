import { Command } from "commander";
import { spawn, ChildProcess } from "child_process";
import { join, dirname, resolve } from "path";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findPackageRoot(startDir: string = __dirname): string {
  let currentDir = resolve(startDir);
  
  // Walk up the directory tree looking for the workspace root
  while (currentDir !== dirname(currentDir)) {
    const packageJsonPath = join(currentDir, 'package.json');
    
    if (existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        // Check if this is the workspace root
        if (packageJson.name === 'vibekit-workspace' || packageJson.workspaces) {
          return currentDir;
        }
      } catch (error) {
        // Continue searching if JSON parsing fails
      }
    }
    
    currentDir = dirname(currentDir);
  }
  
  // Fallback to current working directory if not found
  return process.cwd();
}

interface DashboardOptions {
  port?: string;
  telemetryPort?: string;
  dbPath?: string;
  open?: boolean;
}

class DashboardLogger {
  static info(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  static success(message: string): void {
    console.log(`✅ ${message}`);
  }

  static error(message: string): void {
    console.error(`❌ ${message}`);
  }

  static warn(message: string): void {
    console.warn(`⚠️  ${message}`);
  }
}

async function waitForPort(port: number, maxAttempts = 30): Promise<boolean> {
  const net = await import('net');
  
  for (let i = 0; i < maxAttempts; i++) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(100);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', () => {
        resolve(false);
      });
      
      socket.connect(port, 'localhost');
    });
    
    if (connected) return true;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return false;
}

async function openBrowser(url: string): Promise<void> {
  const platform = process.platform;
  let command: string;
  
  switch (platform) {
    case 'darwin':
      command = 'open';
      break;
    case 'win32':
      command = 'start';
      break;
    default:
      command = 'xdg-open';
  }
  
  try {
    const { exec } = await import('child_process');
    exec(`${command} ${url}`);
  } catch (error) {
    DashboardLogger.warn(`Failed to open browser automatically. Please open ${url} manually.`);
  }
}

export async function dashboardCommand(options: DashboardOptions): Promise<void> {
  const processes: ChildProcess[] = [];
  const dashboardPort = parseInt(options.port || '3001');
  const telemetryPort = parseInt(options.telemetryPort || '3000');
  const packageRoot = findPackageRoot();
  const dbPath = options.dbPath || join(packageRoot, '.vibekit/telemetry.db');
  
  try {
    // Ensure .vibekit directory exists at package root
    const vibkitDir = join(packageRoot, '.vibekit');
    if (!existsSync(vibkitDir)) {
      mkdirSync(vibkitDir, { recursive: true });
      DashboardLogger.success('Created .vibekit directory');
    }
    
    DashboardLogger.info('Starting VibeKit Dashboard environment...');
    // Ensure dbPath is absolute
    const absoluteDbPath = resolve(dbPath);
    DashboardLogger.info(`Using database: ${absoluteDbPath}`);
    
    // 1. Find the dashboard directory first (needed for paths)
    // Find the dashboard directory relative to where the command is run
    const possiblePaths = [
      join(process.cwd(), 'packages/dashboard'),
      join(process.cwd(), '../dashboard'),
      join(process.cwd(), '../../packages/dashboard'),
      join(__dirname, '../../dashboard'),
      join(__dirname, '../../../packages/dashboard'),
    ];
    
    let dashboardDir = '';
    for (const path of possiblePaths) {
      if (existsSync(path)) {
        dashboardDir = path;
        break;
      }
    }
    
    if (!dashboardDir) {
      throw new Error(`Dashboard directory not found. Tried: ${possiblePaths.join(', ')}`);
    }
    
    DashboardLogger.info(`Found dashboard at: ${dashboardDir}`);
    
    // 2. Start Telemetry API Server
    DashboardLogger.info('Starting Telemetry API Server...');
    
    // Use the built start-server script
    const telemetryServerPath = join(dashboardDir, '../telemetry/dist/api/start-server.js');
    
    if (!existsSync(telemetryServerPath)) {
      throw new Error(`Telemetry server script not found at ${telemetryServerPath}. Please build the telemetry package first.`);
    }
    
    const telemetryProcess = spawn('node', [telemetryServerPath], {
      env: {
        ...process.env,
        PORT: telemetryPort.toString(),
        TELEMETRY_DB_PATH: absoluteDbPath,
        NODE_ENV: 'development'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    processes.push(telemetryProcess);
    
    telemetryProcess.stdout?.on('data', (data) => {
      console.log(`[Telemetry] ${data.toString().trim()}`);
    });
    
    telemetryProcess.stderr?.on('data', (data) => {
      console.error(`[Telemetry Error] ${data.toString().trim()}`);
    });
    
    telemetryProcess.on('error', (error) => {
      DashboardLogger.error(`Failed to start Telemetry server: ${error.message}`);
    });
    
    // 2. Wait for telemetry server to be ready
    DashboardLogger.info(`Waiting for Telemetry server on port ${telemetryPort}...`);
    const telemetryReady = await waitForPort(telemetryPort);
    
    if (!telemetryReady) {
      throw new Error('Telemetry server failed to start');
    }
    
    DashboardLogger.success(`Telemetry API Server running on http://localhost:${telemetryPort}`);
    
    // 3. Start Dashboard (Next.js app)
    DashboardLogger.info('Starting Dashboard UI...');
    
    const dashboardProcess = spawn('npm', ['run', 'dev'], {
      cwd: dashboardDir,
      env: {
        ...process.env,
        PORT: dashboardPort.toString(),
        VITE_TELEMETRY_API_URL: `http://localhost:${telemetryPort}`,
        NODE_ENV: 'development'
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true
    });
    
    processes.push(dashboardProcess);
    
    dashboardProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[Dashboard] ${output}`);
      }
    });
    
    dashboardProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim();
      if (output && !output.includes('ExperimentalWarning')) {
        console.error(`[Dashboard Error] ${output}`);
      }
    });
    
    dashboardProcess.on('error', (error) => {
      DashboardLogger.error(`Failed to start Dashboard: ${error.message}`);
    });
    
    // 4. Wait for dashboard to be ready
    DashboardLogger.info(`Waiting for Dashboard on port ${dashboardPort}...`);
    const dashboardReady = await waitForPort(dashboardPort);
    
    if (!dashboardReady) {
      throw new Error('Dashboard failed to start');
    }
    
    DashboardLogger.success(`Dashboard UI running on http://localhost:${dashboardPort}`);
    
    // 5. Open browser if requested
    if (options.open !== false) {
      DashboardLogger.info('Opening Dashboard in browser...');
      await openBrowser(`http://localhost:${dashboardPort}`);
    }
    
    // Display summary
    console.log('\n🚀 VibeKit Dashboard Environment Ready!\n');
    console.log(`📊 Telemetry API: http://localhost:${telemetryPort}`);
    console.log(`🎨 Dashboard UI:  http://localhost:${dashboardPort}`);
    console.log(`💾 Database:      ${absoluteDbPath}`);
    console.log('\nPress Ctrl+C to stop all services\n');
    
    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n\nShutting down services...');
      
      processes.forEach((proc) => {
        if (!proc.killed) {
          proc.kill('SIGTERM');
        }
      });
      
      // Give processes time to shut down gracefully
      setTimeout(() => {
        processes.forEach((proc) => {
          if (!proc.killed) {
            proc.kill('SIGKILL');
          }
        });
        process.exit(0);
      }, 3000);
    };
    
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
    // Keep the process running
    await new Promise(() => {});
    
  } catch (error) {
    DashboardLogger.error(`Failed to start dashboard environment: ${error instanceof Error ? error.message : String(error)}`);
    
    // Clean up any started processes
    processes.forEach((proc) => {
      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    });
    
    process.exit(1);
  }
}

export function createDashboardCommand(): Command {
  const command = new Command('dashboard');
  
  command
    .description('Start the complete VibeKit dashboard environment (telemetry + database + UI)')
    .option('-p, --port <port>', 'Dashboard UI port', '3001')
    .option('-t, --telemetry-port <port>', 'Telemetry API port', '3000')
    .option('-d, --db-path <path>', 'Database file path', '.vibekit/telemetry.db')
    .option('--no-open', 'Do not open browser automatically')
    .action(dashboardCommand);
  
  return command;
}