import { spawn } from 'child_process';
import chalk from 'chalk';
import path from 'path';
import StatusDisplay from '../components/status-display.js';
import React from 'react';
import { render, Static } from 'ink';
import Analytics from '../analytics/analytics.js';
import fs from 'fs-extra';
import crypto from 'crypto';
import SandboxEngine from '../sandbox/sandbox-engine.js';
import SandboxConfig from '../sandbox/sandbox-config.js';

class BaseAgent {
  constructor(agentName, logger, options = {}) {
    this.agentName = agentName;
    this.logger = logger;
    
    // Proxy options
    this.proxy = options.proxy;
    
    // Settings for display
    this.settings = options.settings || {};
    
    // Sandbox options
    this.sandboxOptions = options.sandboxOptions || {};
    this.sandboxEngine = new SandboxEngine(process.cwd(), logger, {
      env: { ...process.env, HTTP_PROXY: this.proxy, HTTPS_PROXY: this.proxy }
    });
  }



  async run(args) {
    await this.logger.log('info', `Starting ${this.agentName} agent`, { 
      args
    });

    // Show status display on host before execution
    await this.showStatusDisplay();

    try {
      // Check if we're already inside a sandbox to prevent double execution
      if (process.env.VIBEKIT_SANDBOX_ACTIVE) {
        // We're already inside a sandbox, run directly
        return await this.runDirect(args);
      }

      // Try sandbox execution first
      const sandboxResult = await this.sandboxEngine.executeWithSandbox(
        this.getAgentCommand(),
        args,
        this.sandboxOptions,
        this.settings,
        this.agentName  // Pass agent name for simplified auth
      );

      // If sandbox execution succeeded, return result with analytics
      if (sandboxResult) {
        return await this.runWithAnalytics(this.getAgentCommand(), args, () => Promise.resolve(sandboxResult), 'sandbox');
      }

      // Otherwise, fall back to direct execution
      return await this.runDirect(args);
    } catch (error) {
      await this.logger.log('error', `${this.agentName} agent failed`, { 
        error: error.message,
        args
      });
      throw error;
    }
  }




  async showStatusDisplay() {
    // Get sandbox config for status display
    const sandboxConfig = await SandboxConfig.resolveSandboxConfig(this.sandboxOptions, this.settings);
    
    // Show status display and keep it visible
    render(React.createElement(Static, { items: [{ 
      key: 'status-display',
      agentName: this.agentName,
      options: { proxy: this.proxy },
      settings: this.settings,
      sandboxConfig: sandboxConfig
    }] }, (item) => React.createElement(StatusDisplay, item)));
  }

  async runDirect(args) {
    const startTime = Date.now();
    const result = await this.createChildProcess(this.getAgentCommand(), args);
    const duration = Date.now() - startTime;

    await this.logger.log('info', `${this.agentName} agent completed`, { 
      exitCode: result.code,
      duration 
    });

    return { ...result, duration };
  }

  async runWithAnalytics(command, args, executionFunction, executionMode = 'local') {
    const startTime = Date.now();
    
    // Always capture optimized file snapshot for full analytics
    let beforeSnapshot;
    let currentSnapshot;
    
    // File change callback for periodic updates
    const fileChangeCallback = async () => {
      if (!beforeSnapshot) return null;
      
      try {
        const newSnapshot = await this.captureFileSnapshot();
        const changes = await this.detectFileChanges(currentSnapshot || beforeSnapshot, newSnapshot);
        currentSnapshot = newSnapshot;
        return changes;
      } catch (error) {
        console.warn('Failed to detect file changes during periodic check:', error.message);
        return null;
      }
    };
    
    const analytics = new Analytics(this.agentName, this.logger, fileChangeCallback, executionMode);
    
    // Start periodic logging (every minute by default, configurable via options)
    const logInterval = 60000; // 60 seconds default
    analytics.startPeriodicLogging(logInterval);
    
    // Capture the command being executed
    analytics.captureCommand(command, args);
    
    // Capture initial file snapshot
    try {
      beforeSnapshot = await this.captureFileSnapshot();
    } catch (error) {
      console.warn('Failed to capture initial file snapshot:', error.message);
    }

    try {
      // Execute the provided function (sandbox or direct)
      const result = await executionFunction();
      
      const duration = Date.now() - startTime;
      
      // Detect final file changes
      if (beforeSnapshot) {
        try {
          const afterSnapshot = await this.captureFileSnapshot();
          const fileChanges = await this.detectFileChanges(beforeSnapshot, afterSnapshot);
          
          // Capture file operations in analytics
          analytics.captureFileChanges(fileChanges.changes);
          analytics.captureFileOperations(fileChanges.created, fileChanges.deleted);
        } catch (error) {
          console.warn('Failed to detect file changes:', error.message);
        }
      }
      
      // Finalize analytics
      const analyticsData = await analytics.finalize(result.code || 0, duration);
      
      await this.logger.log('info', `${this.agentName} agent completed`, { 
        exitCode: result.code || 0,
        duration,
        analyticsData: analyticsData ? analyticsData.sessionId : null
      });
      
      return { ...result, duration, analyticsData };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // Finalize analytics with error
      await analytics.finalize(-1, duration);
      
      throw error;
    }
  }

  getAgentCommand() {
    // Override in subclasses
    return this.agentName;
  }

  async executeAgent(args) {
    throw new Error('executeAgent must be implemented by subclass');
  }

  async captureFileSnapshot(dir = process.cwd()) {
    const snapshot = new Map();
    
    // Skip expensive directories that rarely contain user-modified code
    const skipDirs = new Set([
      'node_modules', '.git', '.next', 'dist', 'build', '.cache', 
      'coverage', '.nyc_output', 'tmp', 'temp', '.vscode', '.idea',
      '__pycache__', '.pytest_cache', 'venv', 'env', '.env',
      'target', 'bin', 'obj', '.gradle', '.maven'
    ]);
    
    // Only track common source code file extensions
    const trackExtensions = new Set([
      '.js', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
      '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt',
      '.c', '.cpp', '.h', '.hpp', '.cs', '.swift',
      '.html', '.css', '.scss', '.sass', '.less',
      '.json', '.yaml', '.yml', '.xml', '.md', '.txt',
      '.sh', '.bash', '.zsh', '.fish', '.ps1',
      '.sql', '.graphql', '.proto', '.dockerfile'
    ]);
    
    const walkDir = async (dirPath, relativePath = '', depth = 0) => {
      // Limit depth to prevent excessive traversal
      if (depth > 8) return;
      
      try {
        const items = await fs.readdir(dirPath);
        
        for (const item of items) {
          if (item.startsWith('.') && item !== '.gitignore') continue;
          if (skipDirs.has(item)) continue;
          
          const itemPath = path.join(dirPath, item);
          const relativeItemPath = path.join(relativePath, item);
          const stat = await fs.stat(itemPath);
          
          if (stat.isDirectory()) {
            await walkDir(itemPath, relativeItemPath, depth + 1);
          } else {
            // Only track files with relevant extensions
            const ext = path.extname(item).toLowerCase();
            if (trackExtensions.has(ext) || item === 'Dockerfile' || item.endsWith('.env')) {
              // Use file stats (mtime + size) instead of reading content for speed
              // This is much faster and catches most meaningful changes
              const fingerprint = `${stat.mtime.getTime()}-${stat.size}`;
              snapshot.set(relativeItemPath, fingerprint);
            }
          }
        }
      } catch (error) {
        // Skip directories that can't be read
      }
    };

    await walkDir(dir);
    return snapshot;
  }

  async detectFileChanges(beforeSnapshot, afterSnapshot) {
    const changes = [];
    const created = [];
    const deleted = [];

    // Check for new and modified files
    for (const [filePath, hash] of afterSnapshot) {
      if (!beforeSnapshot.has(filePath)) {
        created.push(filePath);
        changes.push(filePath);
      } else if (beforeSnapshot.get(filePath) !== hash) {
        changes.push(filePath);
      }
    }

    // Check for deleted files
    for (const [filePath] of beforeSnapshot) {
      if (!afterSnapshot.has(filePath)) {
        deleted.push(filePath);
      }
    }

    return { changes, created, deleted };
  }

  createChildProcess(command, args, options = {}) {
    const startTime = Date.now();
    
    // Always capture optimized file snapshot for full analytics
    let beforeSnapshot;
    let currentSnapshot;
    
    // File change callback for periodic updates
    const fileChangeCallback = async () => {
      if (!beforeSnapshot) return null;
      
      try {
        const newSnapshot = await this.captureFileSnapshot();
        const changes = await this.detectFileChanges(currentSnapshot || beforeSnapshot, newSnapshot);
        currentSnapshot = newSnapshot;
        return changes;
      } catch (error) {
        console.warn('Failed to detect file changes during periodic check:', error.message);
        return null;
      }
    };
    
    const analytics = new Analytics(this.agentName, this.logger, fileChangeCallback, 'local');
    
    // Start periodic logging (every minute by default, configurable via options)
    const logInterval = options.analyticsInterval || 60000; // 60 seconds default
    analytics.startPeriodicLogging(logInterval);
    
    // Capture the command being executed
    analytics.captureCommand(command, args);
    
    // Determine if this is likely an interactive session
    const isInteractive = args.length === 0 && process.stdin.isTTY;
    
    // Using standard child process for all sessions
    
    return new Promise(async (resolve, reject) => {
      // Track if analytics have been finalized to prevent double finalization
      let analyticsFinalized = false;
      
      // Capture initial file snapshot asynchronously (don't block spawn)
      const captureSnapshot = async () => {
        try {
          beforeSnapshot = await this.captureFileSnapshot();
          currentSnapshot = beforeSnapshot;
        } catch (error) {
          console.warn('Failed to capture file snapshot:', error.message);
        }
      };
      
      // Start snapshot capture in background - don't await
      captureSnapshot();
      
      let spawnOptions;
      
      // Prepare environment variables with proxy settings
      const env = { 
        ...process.env, 
        ...options.env 
      };
      
      // Add proxy settings to environment if specified
      if (this.proxy) {
        env.HTTP_PROXY = this.proxy;
        env.HTTPS_PROXY = this.proxy;
        env.http_proxy = this.proxy;
        env.https_proxy = this.proxy;
        
        // Pass through VIBEKIT_PROXY_TARGET_URL for proxy server
        if (process.env.VIBEKIT_PROXY_TARGET_URL) {
          env.VIBEKIT_PROXY_TARGET_URL = process.env.VIBEKIT_PROXY_TARGET_URL;
        }
      }
      
      if (isInteractive) {
        // For interactive mode, use inherit stdio but still capture analytics
        spawnOptions = {
          stdio: 'inherit',
          cwd: options.cwd || process.cwd(),
          env,
          ...options
        };
      } else {
        // For non-interactive mode, capture streams for detailed analytics
        spawnOptions = {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: options.cwd || process.cwd(),
          env,
          ...options
        };
      }
      
      const child = spawn(command, args, spawnOptions);

      if (!isInteractive) {
        // Only set up stream interception for non-interactive mode
        
        // Intercept and forward stdout
        child.stdout.on('data', (data) => {
          analytics.captureOutput(data);
          process.stdout.write(data);
        });

        // Intercept and forward stderr
        child.stderr.on('data', (data) => {
          analytics.captureOutput(data);
          process.stderr.write(data);
        });

        // Forward stdin to child process
        const stdinHandler = (data) => {
          analytics.captureInput(data);
          if (child.stdin && !child.stdin.destroyed) {
            child.stdin.write(data);
          }
        };

        process.stdin.on('data', stdinHandler);

        // Handle process end
        process.stdin.on('end', () => {
          if (child.stdin && !child.stdin.destroyed) {
            child.stdin.end();
          }
        });

        // Cleanup function for non-interactive mode
        const cleanup = () => {
          process.stdin.removeListener('data', stdinHandler);
        };

        child.on('close', async (code) => {
          cleanup();
          
          const duration = Date.now() - startTime;
          
          // Detect file changes
          let fileChanges = { changes: [], created: [], deleted: [] };
          if (beforeSnapshot) {
            try {
              const afterSnapshot = await this.captureFileSnapshot();
              fileChanges = await this.detectFileChanges(beforeSnapshot, afterSnapshot);
              
              // Capture file operations in analytics
              analytics.captureFileChanges(fileChanges.changes);
              analytics.captureFileOperations(fileChanges.created, fileChanges.deleted);
            } catch (error) {
              console.warn('Failed to detect file changes:', error.message);
            }
          }
          
          // Finalize analytics
          if (!analyticsFinalized) {
            analyticsFinalized = true;
            const analyticsData = await analytics.finalize(code, duration);
            
            resolve({
              code,
              duration,
              analytics: analyticsData,
              changes: fileChanges.changes
            });
          } else {
            resolve({
              code,
              duration,
              analytics: null,
              changes: fileChanges.changes
            });
          }
        });

        child.on('error', async (error) => {
          cleanup();
          
          console.error(chalk.red(`[vibekit] Process error: ${error.message}`));
          
          // Finalize analytics with error
          if (!analyticsFinalized) {
            analyticsFinalized = true;
            await analytics.finalize(-1, Date.now() - startTime);
          }
          
          reject(error);
        });
      } else {
        // For interactive mode, capture stderr for error analysis
        if (child.stderr) {
          child.stderr.on('data', (data) => {
            const output = data.toString();
            analytics.parseOutputForMetrics(output);
          });
        }
        
        child.on('close', async (code) => {
          const duration = Date.now() - startTime;
          
          // Detect file changes
          let fileChanges = { changes: [], created: [], deleted: [] };
          if (beforeSnapshot) {
            try {
              const afterSnapshot = await this.captureFileSnapshot();
              fileChanges = await this.detectFileChanges(beforeSnapshot, afterSnapshot);
              
              // Capture file operations in analytics
              analytics.captureFileChanges(fileChanges.changes);
              analytics.captureFileOperations(fileChanges.created, fileChanges.deleted);
            } catch (error) {
              console.warn('Failed to detect file changes:', error.message);
            }
          }
          
          // Finalize analytics
          if (!analyticsFinalized) {
            analyticsFinalized = true;
            const analyticsData = await analytics.finalize(code, duration);
            
            resolve({
              code,
              duration,
              analytics: analyticsData,
              changes: fileChanges.changes
            });
          } else {
            resolve({
              code,
              duration,
              analytics: null,
              changes: fileChanges.changes
            });
          }
        });

        child.on('error', async (error) => {
          console.error(chalk.red(`[vibekit] Process error: ${error.message}`));
          
          // Finalize analytics with error
          if (!analyticsFinalized) {
            analyticsFinalized = true;
            await analytics.finalize(-1, Date.now() - startTime);
          }
          
          reject(error);
        });
      }

      // Handle signals
      const signalHandler = (signal) => {
        return () => {
          // Kill child process
          child.kill(signal);
          
          // Force finalize analytics synchronously for immediate save
          if (!analyticsFinalized) {
            analyticsFinalized = true;
            const duration = Date.now() - startTime;
            try {
              analytics.finalizeSync(-1, duration);
            } catch (error) {
              console.error('Failed to finalize analytics on signal:', error);
            }
          }
          
          // Exit immediately
          process.exit(signal === 'SIGINT' ? 130 : 1);
        };
      };

      process.on('SIGINT', signalHandler('SIGINT'));
      process.on('SIGTERM', signalHandler('SIGTERM'));
      process.on('SIGHUP', signalHandler('SIGHUP'));
      
      // Handle unexpected exits
      process.on('beforeExit', (code) => {
        if (!analyticsFinalized) {
          analyticsFinalized = true;
          const duration = Date.now() - startTime;
          try {
            analytics.finalizeSync(code || 0, duration);
          } catch (error) {
            console.error('Failed to finalize analytics on beforeExit:', error);
          }
        }
      });
      
      // Handle process exit - last chance to save
      process.on('exit', (code) => {
        if (!analyticsFinalized) {
          analyticsFinalized = true;
          const duration = Date.now() - startTime;
          try {
            analytics.finalizeSync(code || 0, duration);
          } catch (error) {
            console.error('Failed to finalize analytics on exit:', error);
          }
        }
      });
      
      // Handle uncaught exceptions
      process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error);
        if (!analyticsFinalized) {
          analyticsFinalized = true;
          const duration = Date.now() - startTime;
          try {
            analytics.finalizeSync(-1, duration);
          } catch (err) {
            console.error('Failed to finalize analytics on uncaught exception:', err);
          }
        }
        process.exit(1);
      });
      
      // Handle unhandled promise rejections
      process.on('unhandledRejection', (reason) => {
        console.error('Unhandled promise rejection:', reason);
        if (!analyticsFinalized) {
          analyticsFinalized = true;
          const duration = Date.now() - startTime;
          try {
            analytics.finalizeSync(-1, duration);
          } catch (error) {
            console.error('Failed to finalize analytics on unhandled rejection:', error);
          }
        }
        process.exit(1);
      });
    });
  }

}

export default BaseAgent;