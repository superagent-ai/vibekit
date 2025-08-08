#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import ClaudeAgent from './agents/claude.js';
import GeminiAgent from './agents/gemini.js';
import CodexAgent from './agents/codex.js';
import CursorAgent from './agents/cursor.js';
import OpenCodeAgent from './agents/opencode.js';
import Logger from './logging/logger.js';
import Analytics from './analytics/analytics.js';
import ProxyServer from './proxy/server.js';
import proxyManager from './proxy/manager.js';
// Dashboard manager will be imported lazily when needed
import React from 'react';
import { render } from 'ink';
import Settings from './components/settings.js';
import { setupAliases } from './utils/aliases.js';
import SandboxEngine from './sandbox/sandbox-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

const program = new Command();

// Settings cache to avoid repeated file I/O
let settingsCache = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 30000; // 30 seconds cache

// Function to read user settings with caching
async function readSettings() {
  const now = Date.now();
  
  // Return cached settings if still valid
  if (settingsCache && (now - settingsCacheTime) < SETTINGS_CACHE_TTL) {
    return settingsCache;
  }
  
  const settingsPath = path.join(os.homedir(), '.vibekit', 'settings.json');
  const defaultSettings = {
    sandbox: { enabled: false, type: 'docker' },
    proxy: { enabled: true, redactionEnabled: true },
    analytics: { enabled: true },
    aliases: { enabled: false }
  };
  
  try {
    if (await fs.pathExists(settingsPath)) {
      const userSettings = await fs.readJson(settingsPath);
      settingsCache = { ...defaultSettings, ...userSettings };
    } else {
      settingsCache = defaultSettings;
    }
  } catch (error) {
    // Use default settings if reading fails
    settingsCache = defaultSettings;
  }
  
  settingsCacheTime = now;
  return settingsCache;
}

program
  .name('vibekit')
  .description('CLI middleware for headless and TUI coding agents')
  .version(pkg.version)
  .option('--proxy <url>', 'HTTP/HTTPS proxy URL for all agents (e.g., http://proxy.example.com:8080)');


program
  .command('claude')
  .description('Run Claude Code CLI')
  .option('-s, --sandbox', 'Enable sandbox mode')
  .option('--sandbox-type <type>', 'Sandbox type: docker, podman, none')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (options, command) => {
    const logger = new Logger('claude');
    const settings = await readSettings();
    
    // Get proxy from global option, environment variable, or default if proxy enabled in settings
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    let proxyStarted = false;
    
    // Determine if we need to start proxy server later (lazy startup)
    let shouldStartProxy = false;
    if (!proxy && settings.proxy.enabled) {
      proxy = 'http://localhost:8080';
      shouldStartProxy = !proxyManager.isRunning();
    }
    
    // Set ANTHROPIC_BASE_URL to route Claude requests through proxy
    if (proxy) {
      process.env.ANTHROPIC_BASE_URL = proxy;
    }
    
    const agentOptions = {
      proxy: proxy,
      shouldStartProxy: shouldStartProxy,
      proxyManager: proxyManager,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new ClaudeAgent(logger, agentOptions);
    
    // Setup cleanup handlers for proxy server (including lazy-started proxy)
    const cleanup = () => {
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    
    const args = command.args || [];
    try {
      await agent.run(args);
    } finally {
      // Clean up proxy server if we or the agent started it
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    }
  });

program
  .command('gemini')
  .description('Run Gemini CLI')
  .option('-s, --sandbox', 'Enable sandbox mode')
  .option('--sandbox-type <type>', 'Sandbox type: docker, podman, none')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (options, command) => {
    const logger = new Logger('gemini');
    const settings = await readSettings();
    
    // Get proxy from global option, environment variable, or default if proxy enabled in settings
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    let proxyStarted = false;
    
    // Determine if we need to start proxy server later (lazy startup)
    let shouldStartProxy = false;
    if (!proxy && settings.proxy.enabled) {
      proxy = 'http://localhost:8080';
      shouldStartProxy = !proxyManager.isRunning();
    }
    
    const agentOptions = {
      proxy: proxy,
      shouldStartProxy: shouldStartProxy,
      proxyManager: proxyManager,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new GeminiAgent(logger, agentOptions);
    
    // Setup cleanup handlers for proxy server (including lazy-started proxy)
    const cleanup = () => {
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    
    const args = command.args || [];
    try {
      await agent.run(args);
    } finally {
      // Clean up proxy server if we or the agent started it
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    }
  });

program
  .command('codex')
  .description('Run Codex CLI')
  .option('-s, --sandbox', 'Enable sandbox mode')
  .option('--sandbox-type <type>', 'Sandbox type: docker, podman, none')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (options, command) => {
    const logger = new Logger('codex');
    const settings = await readSettings();
    
    // Get proxy from global option, environment variable, or default if proxy enabled in settings
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    let proxyStarted = false;
    
    // Determine if we need to start proxy server later (lazy startup)
    let shouldStartProxy = false;
    if (!proxy && settings.proxy.enabled) {
      proxy = 'http://localhost:8080';
      shouldStartProxy = !proxyManager.isRunning();
    }
    
    const agentOptions = {
      proxy: proxy,
      shouldStartProxy: shouldStartProxy,
      proxyManager: proxyManager,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new CodexAgent(logger, agentOptions);
    
    // Setup cleanup handlers for proxy server (including lazy-started proxy)
    const cleanup = () => {
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    
    const args = command.args || [];
    try {
      await agent.run(args);
    } finally {
      // Clean up proxy server if we or the agent started it
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    }
  });

program
  .command('cursor-agent')
  .description('Run Cursor Agent')
  .option('-s, --sandbox', 'Enable sandbox mode')
  .option('--sandbox-type <type>', 'Sandbox type: docker, podman, none')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (options, command) => {
    const logger = new Logger('cursor');
    const settings = await readSettings();
    
    // Get proxy from global option, environment variable, or default if proxy enabled in settings
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    let proxyStarted = false;
    
    // Determine if we need to start proxy server later (lazy startup)
    let shouldStartProxy = false;
    if (!proxy && settings.proxy.enabled) {
      proxy = 'http://localhost:8080';
      shouldStartProxy = !proxyManager.isRunning();
    }
    
    const agentOptions = {
      proxy: proxy,
      shouldStartProxy: shouldStartProxy,
      proxyManager: proxyManager,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new CursorAgent(logger, agentOptions);
    
    // Setup cleanup handlers for proxy server (including lazy-started proxy)
    const cleanup = () => {
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    
    const args = command.args || [];
    try {
      await agent.run(args);
    } finally {
      // Clean up proxy server if we or the agent started it
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    }
  });

program
  .command('opencode')
  .description('Run OpenCode CLI')
  .option('-s, --sandbox', 'Enable sandbox mode')
  .option('--sandbox-type <type>', 'Sandbox type: docker, podman, none')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (options, command) => {
    const logger = new Logger('opencode');
    const settings = await readSettings();
    
    // Get proxy from global option, environment variable, or default if proxy enabled in settings
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    let proxyStarted = false;
    
    // Determine if we need to start proxy server later (lazy startup)
    let shouldStartProxy = false;
    if (!proxy && settings.proxy.enabled) {
      proxy = 'http://localhost:8080';
      shouldStartProxy = !proxyManager.isRunning();
    }
    
    const agentOptions = {
      proxy: proxy,
      shouldStartProxy: shouldStartProxy,
      proxyManager: proxyManager,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new OpenCodeAgent(logger, agentOptions);
    
    // Setup cleanup handlers for proxy server (including lazy-started proxy)
    const cleanup = () => {
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    };
    
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
    
    const args = command.args || [];
    try {
      await agent.run(args);
    } finally {
      // Clean up proxy server if we or the agent started it
      if ((proxyStarted || agent.proxyStarted) && proxyManager.isRunning()) {
        proxyManager.stop();
      }
    }
  });

// Sandbox management commands
const sandboxCommand = program
  .command('sandbox')
  .description('Manage sandbox environment');

sandboxCommand
  .command('status')
  .description('Show sandbox status and configuration')
  .option('-s, --sandbox', 'Enable sandbox mode')
  .option('--sandbox-type <type>', 'Sandbox type: docker, podman, none')
  .action(async (options) => {
    const logger = new Logger('sandbox');
    const settings = await readSettings();
    
    const sandboxEngine = new SandboxEngine(process.cwd(), logger);
    const status = await sandboxEngine.getStatus({
      sandbox: options.sandbox,
      sandboxType: options.sandboxType
    }, settings);

    console.log(chalk.blue('📦 Sandbox Status'));
    console.log(chalk.gray('─'.repeat(50)));
    
    if (!status.enabled) {
      console.log(`Status: ${chalk.red('DISABLED')}`);
      console.log(chalk.gray('Use --sandbox flag or set VIBEKIT_SANDBOX=true to enable'));
    } else {
      console.log(`Status: ${chalk.green('ENABLED')}`);
      console.log(`Type: ${chalk.cyan(status.type)}`);
      console.log(`Source: ${chalk.gray(status.source)}`);
      
      if (status.runtime) {
        console.log(`Runtime: ${chalk.cyan(status.runtime)}`);
        console.log(`Available: ${status.available ? chalk.green('YES') : chalk.red('NO')}`);
        
        if (status.imageName) {
          console.log(`Image: ${chalk.gray(status.imageName)}`);
          console.log(`Image Exists: ${status.imageExists ? chalk.green('YES') : chalk.yellow('NO (will be built)')}`);
        }
        
        console.log(`Ready: ${status.ready ? chalk.green('YES') : chalk.yellow('NO')}`);
      }
    }
  });

sandboxCommand
  .command('build')
  .description('Build sandbox container image')
  .action(async () => {
    const logger = new Logger('sandbox');
    const DockerSandbox = (await import('./sandbox/docker-sandbox.js')).default;
    
    try {
      const sandbox = new DockerSandbox(process.cwd(), logger);
      await sandbox.buildImage();
      console.log(chalk.green('✅ Sandbox image built successfully'));
    } catch (error) {
      console.error(chalk.red('❌ Failed to build sandbox image:'), error.message);
      process.exit(1);
    }
  });

sandboxCommand
  .command('clean')
  .description('Clean up sandbox containers and images')
  .action(async () => {
    const { spawn } = await import('child_process');
    
    console.log(chalk.blue('🧹 Cleaning sandbox resources...'));
    
    // Remove vibekit sandbox image
    const cleanup = spawn('docker', ['rmi', '-f', 'vibekit-sandbox:latest'], { stdio: 'ignore' });
    
    cleanup.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✅ Sandbox resources cleaned'));
      } else {
        console.log(chalk.yellow('⚠️  Some resources may not have been cleaned (this is normal if they didn\'t exist)'));
      }
    });
    
    cleanup.on('error', () => {
      console.log(chalk.yellow('⚠️  Docker not available for cleanup'));
    });
  });

program
  .command('logs')
  .description('View vibekit logs')
  .option('-a, --agent <agent>', 'Filter logs by agent (claude, gemini)')
  .option('-n, --lines <number>', 'Number of recent lines to show', '50')
  .action(async (options) => {
    const logger = new Logger();
    await logger.viewLogs(options);
  });



const proxyCommand = program
  .command('proxy')
  .description('Manage proxy server');

proxyCommand
  .command('start')
  .description('Start proxy server with request/response logging')
  .option('-p, --port <number>', 'Port to run proxy server on', '8080')
  .action(async (options) => {
    const port = parseInt(options.port) || 8080;
    const proxyServer = proxyManager.getProxyServer(port);
    
    try {
      await proxyServer.start();
    } catch (error) {
      console.error(chalk.red('Failed to start proxy server:'), error.message);
      process.exit(1);
    }
  });

// Default action for 'proxy' without subcommand - start the server
proxyCommand
  .option('-p, --port <number>', 'Port to run proxy server on', '8080')
  .action(async (options, command) => {
    // If no subcommand was provided, start the proxy
    if (command.args.length === 0) {
      const port = parseInt(options.port) || 8080;
      const proxyServer = proxyManager.getProxyServer(port);
      
      try {
        await proxyServer.start();
      } catch (error) {
        console.error(chalk.red('Failed to start proxy server:'), error.message);
        process.exit(1);
      }
    }
  });

proxyCommand
  .command('kill')
  .description('Kill proxy server running on specified port')
  .option('-p, --port <number>', 'Port to kill proxy server on', '8080')
  .action(async (options) => {
    const port = parseInt(options.port) || 8080;
    
    try {
      const { spawn } = await import('child_process');
      
      console.log(chalk.blue(`🔍 Looking for processes on port ${port}...`));
      
      // Use lsof to find processes using the port
      const lsof = spawn('lsof', ['-ti', `:${port}`]);
      let pids = '';
      
      lsof.stdout.on('data', (data) => {
        pids += data.toString();
      });
      
      lsof.on('close', (code) => {
        if (code === 0 && pids.trim()) {
          const pidList = pids.trim().split('\n').filter(pid => pid.trim());
          
          console.log(chalk.yellow(`📋 Found ${pidList.length} process(es) on port ${port}`));
          
          pidList.forEach(pid => {
            try {
              process.kill(parseInt(pid), 'SIGTERM');
              console.log(chalk.green(`✅ Killed process ${pid}`));
            } catch (error) {
              if (error.code === 'ESRCH') {
                console.log(chalk.gray(`⚠️ Process ${pid} already dead`));
              } else {
                console.log(chalk.red(`❌ Failed to kill process ${pid}: ${error.message}`));
              }
            }
          });
          
          // Wait a moment then check again
          setTimeout(() => {
            const checkLsof = spawn('lsof', ['-ti', `:${port}`]);
            let stillRunning = '';
            
            checkLsof.stdout.on('data', (data) => {
              stillRunning += data.toString();
            });
            
            checkLsof.on('close', (checkCode) => {
              if (checkCode === 0 && stillRunning.trim()) {
                console.log(chalk.red(`⚠️ Some processes still running, trying SIGKILL...`));
                stillRunning.trim().split('\n').forEach(pid => {
                  try {
                    process.kill(parseInt(pid), 'SIGKILL');
                    console.log(chalk.green(`💀 Force killed process ${pid}`));
                  } catch (error) {
                    console.log(chalk.red(`❌ Failed to force kill ${pid}: ${error.message}`));
                  }
                });
              } else {
                console.log(chalk.green(`🎉 Port ${port} is now free`));
              }
            });
          }, 1000);
          
        } else {
          console.log(chalk.yellow(`🔍 No processes found running on port ${port}`));
        }
      });
      
      lsof.on('error', (error) => {
        console.error(chalk.red(`❌ Error finding processes: ${error.message}`));
        console.log(chalk.yellow(`💡 Trying alternative method...`));
        
        // Alternative: kill vibekit proxy processes
        const pkill = spawn('pkill', ['-f', 'vibekit.*proxy']);
        
        pkill.on('close', (code) => {
          if (code === 0) {
            console.log(chalk.green(`✅ Killed vibekit proxy processes`));
          } else {
            console.log(chalk.yellow(`⚠️ No vibekit proxy processes found to kill`));
          }
        });
      });
      
    } catch (error) {
      console.error(chalk.red('Failed to kill proxy server:'), error.message);
      process.exit(1);
    }
  });

// Dashboard commands
const dashboardCommand = program
  .command('dashboard')
  .description('Manage analytics dashboard');

dashboardCommand
  .command('start')
  .description('Start analytics dashboard server')
  .option('-p, --port <number>', 'Port to run dashboard on', '3001')
  .option('--open', 'Open dashboard in browser automatically')
  .action(async (options) => {
    const port = parseInt(options.port) || 3001;
    const { default: dashboardManager } = await import('./dashboard/manager.ts');
    const dashboardServer = dashboardManager.getDashboardServer(port);
    
    try {
      await dashboardServer.start();
      
      if (options.open) {
        await dashboardServer.openInBrowser();
      }
    } catch (error) {
      console.error(chalk.red('Failed to start dashboard:'), error.message);
      process.exit(1);
    }
  });

// Default action for 'dashboard' without subcommand - start the server and open browser
dashboardCommand
  .option('-p, --port <number>', 'Port to run dashboard on', '3001')
  .option('--no-open', 'Do not open browser automatically')
  .action(async (options, command) => {
    // If no subcommand was provided, start the dashboard with default settings
    if (command.args.length === 0) {
      const port = parseInt(options.port) || 3001;
      const { default: dashboardManager } = await import('./dashboard/manager.ts');
      const dashboardServer = dashboardManager.getDashboardServer(port);
      
      try {
        await dashboardServer.start();
        
        // Open browser by default unless --no-open is specified
        if (options.open !== false) {
          await dashboardServer.openInBrowser();
        }
      } catch (error) {
        console.error(chalk.red('Failed to start dashboard:'), error.message);
        process.exit(1);
      }
    }
  });

dashboardCommand
  .command('stop')
  .description('Stop analytics dashboard server')
  .option('-p, --port <number>', 'Port to stop dashboard on', '3001')
  .action(async (options) => {
    const port = parseInt(options.port) || 3001;
    const { default: dashboardManager } = await import('./dashboard/manager.ts');
    dashboardManager.stop(port);
    console.log(chalk.green(`✅ Dashboard stopped on port ${port}`));
  });

dashboardCommand
  .command('update')
  .description('Update the dashboard to the latest version')
  .action(async () => {
    const { default: dashboardManager } = await import('./dashboard/manager.ts');
    const dashboardServer = dashboardManager.getDashboardServer(3001);
    
    try {
      await dashboardServer.update();
    } catch (error) {
      console.error(chalk.red('Failed to update dashboard:'), error.message);
      process.exit(1);
    }
  });

program
  .command('settings')
  .description('Manage vibekit settings and configurations')
  .action(async () => {
    render(React.createElement(Settings));
  });

program
  .command('setup-aliases')
  .description('Install or remove global aliases based on settings')
  .action(async () => {
    const settings = await readSettings();
    await setupAliases(settings.aliases.enabled);
  });

program
  .command('diagnose-aliases')
  .description('Diagnose alias setup and conflicts')
  .action(async () => {
    const { checkAliasesInCurrentShell } = await import('./utils/aliases.js');
    const settings = await readSettings();
    
    console.log(chalk.blue('🔍 VibeKit Alias Diagnosis'));
    console.log(chalk.gray('─'.repeat(50)));
    
    console.log(`Settings enabled: ${settings.aliases.enabled ? chalk.green('✓ YES') : chalk.red('✗ NO')}`);
    
    // Check if vibekit command exists
    try {
      const { spawn } = await import('child_process');
      const vibekitCheck = spawn('which', ['vibekit'], { stdio: 'pipe' });
      let vibekitPath = '';
      
      vibekitCheck.stdout.on('data', (data) => {
        vibekitPath += data.toString().trim();
      });
      
      await new Promise((resolve) => {
        vibekitCheck.on('close', (code) => {
          if (code === 0 && vibekitPath) {
            console.log(`VibeKit command: ${chalk.green('✓ FOUND')} at ${vibekitPath}`);
          } else {
            console.log(`VibeKit command: ${chalk.red('✗ NOT FOUND')}`);
            console.log(chalk.yellow('  Try: npm install -g @vibe-kit/cli'));
          }
          resolve();
        });
      });
    } catch (error) {
      console.log(`VibeKit command: ${chalk.red('✗ ERROR')} - ${error.message}`);
    }
    
    // Check current shell aliases
    const shellWorking = await checkAliasesInCurrentShell();
    console.log(`Shell aliases: ${shellWorking ? chalk.green('✓ WORKING') : chalk.red('✗ NOT WORKING')}`);
    
    if (!shellWorking) {
      console.log(chalk.yellow('\n💡 To fix alias issues:'));
      console.log(chalk.yellow('   1. Run: vibekit settings (enable aliases)'));
      console.log(chalk.yellow('   2. Restart terminal or run: source ~/.zshrc'));
      console.log(chalk.yellow('   3. Test with: claude --help'));
    }
    
    // Show current aliases
    try {
      const { spawn } = await import('child_process');
      const aliasCheck = spawn('bash', ['-c', 'alias | grep -E "(claude|gemini)"'], { stdio: 'pipe' });
      let aliasOutput = '';
      
      aliasCheck.stdout.on('data', (data) => {
        aliasOutput += data.toString();
      });
      
      await new Promise((resolve) => {
        aliasCheck.on('close', () => {
          if (aliasOutput.trim()) {
            console.log(chalk.blue('\n📋 Current aliases:'));
            console.log(aliasOutput.trim());
          }
          resolve();
        });
      });
    } catch (error) {
      // Ignore alias check errors
    }
  });

program
  .command('analytics')
  .description('View agent analytics and usage statistics')
  .option('-a, --agent <agent>', 'Filter analytics by agent (claude, gemini)')
  .option('-d, --days <number>', 'Number of days to include', '7')
  .option('--summary', 'Show summary statistics only')
  .option('--export <file>', 'Export analytics to JSON file')
  .action(async (options) => {
    try {
      const days = parseInt(options.days) || 7;
      const analytics = await Analytics.getAnalytics(options.agent, days);
      
      if (analytics.length === 0) {
        console.log(chalk.yellow('No analytics data found'));
        return;
      }
      
      if (options.export) {
        await fs.writeFile(options.export, JSON.stringify(analytics, null, 2));
        console.log(chalk.green(`✓ Analytics exported to ${options.export}`));
        return;
      }
      
      const summary = Analytics.generateSummary(analytics);
      
      console.log(chalk.blue('📊 Agent Analytics Summary'));
      console.log(chalk.gray('─'.repeat(50)));
      
      console.log(`Total Sessions: ${chalk.cyan(summary.totalSessions)}`);
      console.log(`Total Duration: ${chalk.cyan(Math.round(summary.totalDuration / 1000))}s`);
      console.log(`Average Duration: ${chalk.cyan(Math.round(summary.averageDuration / 1000))}s`);
      console.log(`Success Rate: ${chalk.cyan(summary.successRate.toFixed(1))}%`);
      console.log(`Files Changed: ${chalk.cyan(summary.totalFilesChanged)}`);
      console.log(`Total Errors: ${chalk.cyan(summary.totalErrors)}`);
      console.log(`Total Warnings: ${chalk.cyan(summary.totalWarnings)}`);
      
      if (Object.keys(summary.agentBreakdown).length > 1) {
        console.log(chalk.blue('\n🤖 Agent Breakdown'));
        console.log(chalk.gray('─'.repeat(50)));
        
        Object.entries(summary.agentBreakdown).forEach(([agentName, stats]) => {
          console.log(chalk.yellow(`${agentName}:`));
          console.log(`  Sessions: ${stats.sessions}`);
          console.log(`  Avg Duration: ${Math.round(stats.averageDuration / 1000)}s`);
          console.log(`  Success Rate: ${stats.successRate.toFixed(1)}%`);
        });
      }
      
      if (summary.topErrors.length > 0) {
        console.log(chalk.blue('\n❌ Top Errors'));
        console.log(chalk.gray('─'.repeat(50)));
        
        summary.topErrors.forEach(({ error, count }) => {
          console.log(`${chalk.red(count)}x ${error.substring(0, 80)}${error.length > 80 ? '...' : ''}`);
        });
      }
      
      if (!options.summary) {
        console.log(chalk.blue('\n📋 Recent Sessions'));
        console.log(chalk.gray('─'.repeat(50)));
        
        analytics.slice(0, 10).forEach(session => {
          const date = new Date(session.startTime).toLocaleString();
          const duration = Math.round((session.duration || 0) / 1000);
          const status = session.exitCode === 0 ? chalk.green('✓') : chalk.red('✗');
          
          console.log(`${status} ${chalk.cyan(session.agentName)} ${chalk.gray(date)} ${duration}s`);
          
          if (session.filesChanged && session.filesChanged.length > 0) {
            console.log(chalk.gray(`   Files: ${session.filesChanged.slice(0, 3).join(', ')}${session.filesChanged.length > 3 ? '...' : ''}`));
          }
          
          if (session.errors && session.errors.length > 0) {
            console.log(chalk.red(`   Errors: ${session.errors.length}`));
          }
        });
      }
      
    } catch (error) {
      console.error(chalk.red('Failed to retrieve analytics:'), error.message);
    }
  });

program
  .command('clean')
  .description('Clean logs and analytics')
  .option('--logs', 'Clean logs only')
  .option('--analytics', 'Clean analytics data only')
  .action(async (options) => {
    const logger = new Logger();
    
    if (options.logs || (!options.logs && !options.analytics)) {
      await logger.cleanLogs();
      console.log(chalk.green('✓ Logs cleaned'));
    }
    
    if (options.analytics || (!options.logs && !options.analytics)) {
      const os = await import('os');
      const analyticsDir = path.join(os.homedir(), '.vibekit', 'analytics');
      if (await fs.pathExists(analyticsDir)) {
        await fs.remove(analyticsDir);
        console.log(chalk.green('✓ Analytics cleaned'));
      }
    }
  });

if (process.argv.length === 2) {
  program.help();
}

program.parseAsync(process.argv).catch(error => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});