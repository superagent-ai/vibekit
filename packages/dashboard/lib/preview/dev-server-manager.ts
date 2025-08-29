import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { createLogger } from '@vibe-kit/logger';
import net from 'net';
import path from 'path';
import { SimpleProjectDetector } from './simple-project-detector';
import { 
  DevServerInstance, 
  DevServerConfig, 
  DevServerStatus,
  DevServerLog
} from './types';

const logger = createLogger('DevServerManager');

/**
 * Manages local development servers for projects
 */
export class DevServerManager {
  private static instance: DevServerManager;
  private activeServers: Map<string, DevServerInstance> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private logs: Map<string, DevServerLog[]> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  private constructor() {
    this.startCleanupScheduler();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): DevServerManager {
    if (!DevServerManager.instance) {
      DevServerManager.instance = new DevServerManager();
    }
    return DevServerManager.instance;
  }

  /**
   * Test if a port is actively listening (opposite of isPortAvailable)
   */
  private async testPortListening(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      
      socket.setTimeout(1000);
      
      socket.on('connect', () => {
        socket.destroy();
        resolve(true); // Port is listening
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      
      socket.on('error', () => {
        resolve(false); // Port is not listening
      });
      
      socket.connect(port, host);
    });
  }

  /**
   * Check if a port is available
   */
  private static async isPortAvailable(port: number, host: string = '127.0.0.1'): Promise<boolean> {
    return new Promise((resolve) => {
      const server = net.createServer();
      
      server.listen(port, host, () => {
        server.once('close', () => {
          resolve(true);
        });
        server.close();
      });
      
      server.on('error', () => {
        resolve(false);
      });
    });
  }

  /**
   * Find an available port starting from the preferred port
   */
  private static async findAvailablePort(preferredPort: number, maxTries: number = 50): Promise<number> {
    // Try 50 ports to handle ~50 concurrent projects
    for (let i = 0; i < maxTries; i++) {
      const portToTry = preferredPort + i;
      if (portToTry > 65535) break; // Port number limit
      
      const isAvailable = await this.isPortAvailable(portToTry);
      if (isAvailable) {
        return portToTry;
      }
    }
    
    throw new Error(`No available ports found in range ${preferredPort}-${preferredPort + maxTries}`);
  }

  /**
   * Get lock directory path
   */
  private getLockDir(): string {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '.';
    return path.join(homeDir, '.vibekit', 'preview-locks');
  }

  /**
   * Get lock file path for a project
   */
  private getLockFilePath(projectId: string): string {
    return path.join(this.getLockDir(), `${projectId}.json`);
  }

  /**
   * Ensure lock directory exists
   */
  private async ensureLockDir(): Promise<void> {
    const dir = this.getLockDir();
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Start cleanup scheduler for idle servers
   */
  private startCleanupScheduler() {
    this.cleanupInterval = setInterval(async () => {
      await this.cleanupIdleServers();
    }, 10 * 60 * 1000); // Run every 10 minutes
  }

  /**
   * Check if a process is running by PID
   */
  private isProcessRunning(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get existing server lock if it exists and is valid
   */
  private async getExistingServerLock(projectId: string): Promise<DevServerInstance | null> {
    try {
      const lockFile = this.getLockFilePath(projectId);
      const data = await fs.readFile(lockFile, 'utf8');
      const lock = JSON.parse(data);
      
      // Check if the process is still running
      if (lock.pid && this.isProcessRunning(lock.pid)) {
        logger.info('Found valid existing server lock', { 
          projectId, 
          port: lock.port, 
          pid: lock.pid 
        });
        
        // Reconstruct DevServerInstance from lock data
        const instance: DevServerInstance = {
          id: `dev-server-${projectId}-${Date.now()}`,
          projectId,
          config: {
            projectType: 'static', // We'll detect this properly if needed
            devCommand: `node server ${lock.port}`,
            port: lock.port,
            packageManager: 'npm',
            framework: { name: 'Static HTML' }
          },
          status: 'running',
          previewUrl: lock.previewUrl,
          startedAt: new Date(lock.startedAt),
          lastActivity: new Date(),
          pid: lock.pid
        };
        
        return instance;
      } else {
        // Process is dead, clean up the stale lock
        logger.info('Found stale lock file, cleaning up', { projectId, pid: lock.pid });
        await fs.unlink(lockFile).catch(() => {});
        return null;
      }
    } catch (error) {
      // No lock file or invalid JSON
      return null;
    }
  }

  /**
   * Create lock file for a running server
   */
  private async acquireServerLock(projectId: string, instance: DevServerInstance): Promise<void> {
    try {
      await this.ensureLockDir();
      const lockFile = this.getLockFilePath(projectId);
      
      const lockData = {
        projectId,
        pid: instance.pid,
        port: instance.config.port,
        startedAt: instance.startedAt?.toISOString() || new Date().toISOString(),
        previewUrl: instance.previewUrl
      };
      
      await fs.writeFile(lockFile, JSON.stringify(lockData, null, 2));
      logger.info('Created server lock file', { projectId, lockFile });
    } catch (error) {
      logger.error('Failed to create server lock file', { 
        projectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      // Don't throw - lock file creation failure shouldn't kill the server
    }
  }

  /**
   * Remove lock file for a server
   */
  private async releaseServerLock(projectId: string): Promise<void> {
    const lockFile = this.getLockFilePath(projectId);
    try {
      await fs.unlink(lockFile);
      logger.info('Released server lock file', { projectId, lockFile });
    } catch (error) {
      // Lock file might not exist, which is fine
      logger.debug('Lock file already removed or not found', { projectId });
    }
  }

  /**
   * Start a development server for a project
   */
  async startDevServer(projectId: string, projectRoot: string, customPort?: number): Promise<DevServerInstance> {
    // Check for existing server from lock file (cross-session)
    const existingLock = await this.getExistingServerLock(projectId);
    if (existingLock) {
      logger.info('Found existing server from another session', {
        projectId,
        port: existingLock.config.port,
        pid: existingLock.pid
      });
      
      // Add to our local map and return
      this.activeServers.set(projectId, existingLock);
      return existingLock;
    }

    // Stop existing server if running in this session
    if (this.activeServers.has(projectId)) {
      const existing = this.activeServers.get(projectId)!;
      logger.info('Server already running in this session', {
        projectId,
        port: existing.config.port
      });
      return existing;
    }

    logger.info('Starting dev server', { projectId, projectRoot, customPort });
    
    // Detect project configuration
    const detection = await SimpleProjectDetector.detectProject(projectRoot);
    logger.info('Project detection result', { 
      projectId, 
      detection: {
        type: detection.type,
        framework: detection.framework?.name,
        devCommand: detection.devCommand,
        port: detection.port,
        packageManager: detection.packageManager,
        scripts: detection.scripts ? Object.keys(detection.scripts) : 'none'
      }
    });

    // Find an available port
    let finalPort: number;
    
    if (customPort) {
      // If custom port specified, check if it's available
      const isCustomPortAvailable = await DevServerManager.isPortAvailable(customPort);
      if (!isCustomPortAvailable) {
        throw new Error(`Custom port ${customPort} is already in use`);
      }
      finalPort = customPort;
      logger.info('Using custom port', { projectId, customPort, originalPort: detection.port });
    } else {
      // Find an available port starting from the detected port
      try {
        finalPort = await DevServerManager.findAvailablePort(detection.port);
        if (finalPort !== detection.port) {
          logger.info('Original port unavailable, using alternative', { 
            projectId, 
            originalPort: detection.port, 
            finalPort 
          });
        } else {
          logger.info('Using default port', { projectId, port: finalPort });
        }
      } catch (error) {
        throw new Error(`Failed to find available port: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Build command and arguments arrays for proper spawning
    let command: string;
    let args: string[];
    
    if (detection.type === 'static') {
      // Use absolute path since __dirname is unreliable in Next.js builds
      const serverPath = path.join(process.cwd(), 'lib', 'preview', 'iframe-static-server.js');
      command = 'node';
      args = [serverPath, '.', String(finalPort), '127.0.0.1'];
      logger.info('Using custom static server', { projectId, serverPath, port: finalPort });
    } else if (detection.type === 'python') {
      command = 'python3';
      args = ['-m', 'http.server', String(finalPort), '--bind', '127.0.0.1'];
    } else {
      // For Node.js projects, build command more carefully
      if (detection.devCommand.includes('npm ')) {
        // Handle npm commands
        const parts = detection.devCommand.split(' ');
        command = parts[0]; // 'npm'
        args = parts.slice(1); // ['run', 'dev'] or ['start']
      } else if (detection.devCommand.includes('node ')) {
        // Handle direct node commands
        const parts = detection.devCommand.split(' ');
        command = 'node';
        args = parts.slice(1); // Everything after 'node'
      } else {
        // Fallback - split on spaces (may still have issues with quotes)
        const [detectedCommand, ...detectedArgs] = detection.devCommand.split(' ');
        command = detectedCommand;
        args = detectedArgs;
        logger.warn('Using fallback command parsing', { projectId, devCommand: detection.devCommand });
      }
      
      if (finalPort !== detection.port) {
        // The PORT environment variable will be set in spawn
        logger.info('Will use PORT environment variable for Node.js project', { 
          projectId, 
          detectedPort: detection.port,
          finalPort 
        });
      }
    }

    // Create server configuration
    const config: DevServerConfig = {
      projectType: detection.type,
      devCommand: `${command} ${args.join(' ')}`, // For display purposes
      port: finalPort,
      packageManager: detection.packageManager,
      framework: detection.framework,
    };

    // Create server instance
    const instance: DevServerInstance = {
      id: `dev-server-${projectId}-${Date.now()}`,
      projectId,
      config,
      status: 'starting',
      previewUrl: `http://127.0.0.1:${config.port}`,
      startedAt: new Date(),
      lastActivity: new Date(),
    };

    this.activeServers.set(projectId, instance);
    this.logs.set(projectId, []);

    try {
      // Start the development server process
      await this.spawnDevServer(instance, projectRoot, command, args);
      
      instance.status = 'running';
      instance.lastActivity = new Date();
      
      // Create lock file after successful start
      await this.acquireServerLock(projectId, instance);
      
      logger.info('Dev server started successfully', { 
        projectId, 
        instanceId: instance.id,
        previewUrl: instance.previewUrl 
      });
      
      return instance;
    } catch (error) {
      instance.status = 'error';
      instance.error = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to start dev server', { 
        projectId, 
        instanceId: instance.id, 
        error: instance.error 
      });
      throw error;
    }
  }

  /**
   * Stop a development server
   */
  async stopDevServer(projectId: string): Promise<void> {
    const instance = this.activeServers.get(projectId);
    const process = this.processes.get(projectId);

    if (!instance && !process) {
      return; // Already stopped
    }

    logger.info('Stopping dev server', { projectId });

    if (instance) {
      instance.status = 'stopping';
    }

    if (process) {
      try {
        // Kill the process
        process.kill('SIGTERM');
        
        // Wait for process to exit gracefully
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(() => {
            // Force kill if it doesn't exit gracefully
            process.kill('SIGKILL');
            resolve();
          }, 5000);

          process.once('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        this.processes.delete(projectId);
        logger.info('Dev server process terminated', { projectId });
      } catch (error) {
        logger.error('Error stopping dev server process', { 
          projectId, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    if (instance) {
      instance.status = 'stopped';
    }

    this.activeServers.delete(projectId);
    
    // Clean up lock file
    await this.releaseServerLock(projectId);
    
    logger.info('Dev server stopped and lock released', { projectId });
  }

  /**
   * Get dev server status
   */
  async getServerStatus(projectId: string): Promise<DevServerStatus | null> {
    // First check in-memory (current session)
    const memoryInstance = this.activeServers.get(projectId);
    if (memoryInstance) {
      return memoryInstance.status;
    }
    
    // Check lock file for cross-session instances
    const lockInstance = await this.getExistingServerLock(projectId);
    if (lockInstance) {
      // Add to memory for future calls
      this.activeServers.set(projectId, lockInstance);
      return lockInstance.status;
    }
    
    return null;
  }

  /**
   * Get dev server instance (checks both memory and lock files)
   */
  async getServerInstance(projectId: string): Promise<DevServerInstance | null> {
    // First check in-memory (current session)
    const memoryInstance = this.activeServers.get(projectId);
    if (memoryInstance) {
      return memoryInstance;
    }
    
    // Check lock file for cross-session instances
    const lockInstance = await this.getExistingServerLock(projectId);
    if (lockInstance) {
      // Add to memory for future calls
      this.activeServers.set(projectId, lockInstance);
      return lockInstance;
    }
    
    return null;
  }

  /**
   * Update server activity to prevent idle cleanup
   */
  updateServerActivity(projectId: string): void {
    const instance = this.activeServers.get(projectId);
    if (instance) {
      instance.lastActivity = new Date();
      logger.debug('Updated server activity', { projectId });
    }
  }

  /**
   * Get dev server logs
   */
  getLogs(projectId: string, since?: Date): DevServerLog[] {
    const logs = this.logs.get(projectId) || [];
    
    if (since) {
      return logs.filter(log => log.timestamp >= since);
    }
    
    return logs;
  }

  /**
   * Clear logs for a project
   */
  clearLogs(projectId: string): void {
    this.logs.set(projectId, []);
  }

  /**
   * Spawn the development server process
   */
  private async spawnDevServer(instance: DevServerInstance, projectRoot: string, command: string, args: string[]): Promise<void> {
    const { config } = instance;
    const { projectId } = instance;

    logger.info('Starting dev server process', { 
      projectId, 
      command, 
      args, 
      cwd: projectRoot,
      port: config.port,
      framework: config.framework?.name || 'unknown'
    });

    // Add initial system log
    this.addLog(projectId, 'system', `Starting ${config.framework?.name || 'development'} server on port ${config.port}...`);
    this.addLog(projectId, 'system', `Command: ${command} ${args.join(' ')}`);
    this.addLog(projectId, 'system', `Working directory: ${projectRoot}`);
    this.addLog(projectId, 'system', `Arguments: [${args.map(arg => `"${arg}"`).join(', ')}]`);

    const child = spawn(command, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(config.port),
        NODE_ENV: 'development',
        // Add additional helpful environment variables
        HOST: '0.0.0.0', // Allow external connections
        BROWSER: 'none', // Don't auto-open browser
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    instance.pid = child.pid;
    this.processes.set(projectId, child);

    // Track startup progress
    let isServerReady = false;
    const startupTimeout = setTimeout(() => {
      if (!isServerReady) {
        this.addLog(projectId, 'system', `Server is taking longer than expected to start...`);
        logger.warn('Dev server startup taking long time', { projectId, port: config.port });
      }
    }, 10000);

    // Handle process output
    child.stdout?.on('data', (data) => {
      const message = data.toString();
      this.addLog(projectId, 'stdout', message);
      
      // Check for common server ready indicators
      if (!isServerReady) {
        const readyIndicators = [
          `127.0.0.1:${config.port}`,
          `localhost:${config.port}`,
          `:${config.port}`,
          'ready',
          'compiled',
          'server started',
          'development server',
          'local:',
          'Local:',
        ];
        
        const lowerMessage = message.toLowerCase();
        if (readyIndicators.some(indicator => lowerMessage.includes(indicator.toLowerCase()))) {
          isServerReady = true;
          clearTimeout(startupTimeout);
          this.addLog(projectId, 'system', `✅ Server appears to be ready!`);
          logger.info('Dev server ready detected', { projectId, port: config.port });
        }
      }
    });

    child.stderr?.on('data', (data) => {
      const message = data.toString();
      this.addLog(projectId, 'stderr', message);
      
      // Log all stderr output for debugging
      logger.warn('Dev server stderr output', { 
        projectId, 
        message: message.trim(),
        command: `${command} ${args.join(' ')}`,
        port: config.port
      });
      
      // Check for common error patterns
      const errorMessage = message.toLowerCase();
      if (errorMessage.includes('eaddrinuse') || (errorMessage.includes('port') && errorMessage.includes('already'))) {
        this.addLog(projectId, 'system', `❌ Port ${config.port} is already in use! This should not happen with port detection.`);
        this.addLog(projectId, 'system', `💡 Please try starting the preview again or restart the dashboard.`);
        logger.error('Port already in use despite port checking', { projectId, port: config.port });
      } else if (errorMessage.includes('command not found') || errorMessage.includes('not found')) {
        this.addLog(projectId, 'system', `❌ Command "${command}" not found. Make sure dependencies are installed.`);
        logger.error('Command not found', { projectId, command });
      } else if (errorMessage.includes('permission denied')) {
        this.addLog(projectId, 'system', `❌ Permission denied. Check file permissions.`);
        logger.error('Permission denied', { projectId });
      } else if (errorMessage.includes('missing script')) {
        this.addLog(projectId, 'system', `❌ Script not found in package.json. Available scripts: ${Object.keys((instance as any).detectedScripts || {}).join(', ')}`);
        logger.error('Missing npm script', { projectId, command, availableScripts: (instance as any).detectedScripts });
      }
    });

    // Handle process events
    child.on('error', (error: any) => {
      clearTimeout(startupTimeout);
      logger.error('Dev server process error', { 
        projectId, 
        error: error.message, 
        code: error.code,
        command,
        args: args.join(' ')
      });
      this.addLog(projectId, 'system', `❌ Process error: ${error.message}`);
      
      // Provide helpful error messages
      if (error.code === 'ENOENT') {
        this.addLog(projectId, 'system', `💡 Command "${command}" not found. Ensure Node.js is installed and in PATH.`);
        if (command === 'node') {
          this.addLog(projectId, 'system', `💡 Check that the server file exists: ${args[0]}`);
        }
      } else if (error.code === 'EACCES') {
        this.addLog(projectId, 'system', `💡 Permission denied. Check file permissions or try running with appropriate permissions.`);
      } else if (error.code === 'EMFILE' || error.code === 'ENFILE') {
        this.addLog(projectId, 'system', `💡 Too many open files. Try closing other applications or restarting the dashboard.`);
      }
      
      if (instance) {
        instance.status = 'error';
        instance.error = error.message;
      }
    });

    child.on('exit', (code, signal) => {
      clearTimeout(startupTimeout);
      logger.info('Dev server process exited', { projectId, code, signal, isServerReady });
      
      if (code === 0) {
        this.addLog(projectId, 'system', `✅ Process exited cleanly (code: ${code})`);
      } else if (signal) {
        this.addLog(projectId, 'system', `🔄 Process terminated by signal: ${signal}`);
      } else {
        this.addLog(projectId, 'system', `❌ Process exited with error code: ${code}`);
        
        // Provide helpful suggestions for common exit codes
        if (code === 1) {
          this.addLog(projectId, 'system', `💡 Exit code 1 usually indicates a runtime error. Check the logs above for details.`);
        } else if (code === 127) {
          this.addLog(projectId, 'system', `💡 Exit code 127 means command not found. Make sure the command is available in PATH.`);
        }
      }
      
      if (instance && instance.status !== 'stopping') {
        instance.status = code === 0 ? 'stopped' : 'error';
        if (code !== 0 && !instance.error) {
          instance.error = `Process exited with code ${code}`;
        }
      }
      
      // Remove server from activeServers when process exits
      this.activeServers.delete(projectId);
      
      // Clean up lock file when process exits (crash or normal exit)
      this.releaseServerLock(projectId).catch(error => {
        logger.debug('Failed to release lock on process exit', { projectId, error });
      });
      
      this.processes.delete(projectId);
    });

    // Wait for the process to spawn successfully
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Server failed to spawn within timeout (${config.port})`));
      }, 5000); // Shorter timeout just for process spawn

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      child.on('spawn', () => {
        clearTimeout(timeout);
        this.addLog(projectId, 'system', `✅ Process spawned successfully (PID: ${child.pid})`);
        logger.info('Dev server process spawned', { projectId, pid: child.pid, port: config.port });
        resolve();
      });
    });

    // For static servers, add a brief delay to let the server initialize
    if (config.projectType === 'static') {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this.addLog(projectId, 'system', `✅ Static server initialization complete!`);
    }

    logger.info('Dev server is ready and accepting connections', { 
      projectId, 
      pid: child.pid,
      port: config.port,
      previewUrl: instance.previewUrl
    });
  }

  /**
   * Add log entry
   */
  private addLog(projectId: string, type: 'stdout' | 'stderr' | 'system', message: string): void {
    const logs = this.logs.get(projectId) || [];
    
    logs.push({
      timestamp: new Date(),
      type,
      message: message.trim(),
    });

    // Keep only the last 1000 log entries
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }

    this.logs.set(projectId, logs);
  }

  /**
   * Cleanup idle servers
   */
  private async cleanupIdleServers(): Promise<void> {
    const idleThreshold = 60 * 60 * 1000; // 1 hour
    const now = new Date();

    for (const [projectId, instance] of this.activeServers.entries()) {
      if (!instance.lastActivity) {
        continue;
      }

      const idleTime = now.getTime() - instance.lastActivity.getTime();
      if (idleTime > idleThreshold) {
        logger.info('Cleaning up idle dev server', { 
          projectId, 
          instanceId: instance.id, 
          idleMinutes: Math.floor(idleTime / 60000)
        });
        
        await this.stopDevServer(projectId);
      }
    }
  }

  /**
   * Shutdown all servers
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down dev server manager');
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    const shutdownPromises = Array.from(this.activeServers.keys()).map(
      projectId => this.stopDevServer(projectId)
    );

    await Promise.all(shutdownPromises);
    logger.info('All dev servers stopped');
  }
}