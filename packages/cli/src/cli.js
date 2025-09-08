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
import GrokAgent from './agents/grok.js';
import Logger from './logging/logger.js';
import Analytics from './analytics/analytics.js';
// Dashboard manager will be imported lazily when needed
import React from 'react';
import { render } from 'ink';
import Settings from './components/settings.js';
import { setupAliases } from './utils/aliases.js';
import SandboxEngine from './sandbox/sandbox-engine.js';
import { setupProxySettings } from './utils/claude-settings.js';

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
    
    // Get proxy from global option or environment variable
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    
    const agentOptions = {
      proxy: proxy,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new ClaudeAgent(logger, agentOptions);
    
    
    const args = command.args || [];
    await agent.run(args);
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
    
    // Get proxy from global option or environment variable
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    
    const agentOptions = {
      proxy: proxy,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new GeminiAgent(logger, agentOptions);
    
    
    const args = command.args || [];
    await agent.run(args);
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
    
    // Get proxy from global option or environment variable
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    
    // Set OPENAI_BASE_URL for codex instead of ANTHROPIC_BASE_URL
    if (proxy) {
      process.env.OPENAI_BASE_URL = proxy;
    }
    
    const agentOptions = {
      proxy: proxy,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new CodexAgent(logger, agentOptions);
    
    
    const args = command.args || [];
    await agent.run(args);
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
    
    // Get proxy from global option or environment variable
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    
    const agentOptions = {
      proxy: proxy,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new CursorAgent(logger, agentOptions);
    
    
    const args = command.args || [];
    await agent.run(args);
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
    
    // Get proxy from global option or environment variable
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    
    const agentOptions = {
      proxy: proxy,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new OpenCodeAgent(logger, agentOptions);
    
    
    const args = command.args || [];
    await agent.run(args);
  });

program
  .command('grok')
  .description('Run Grok CLI')
  .option('-s, --sandbox', 'Enable sandbox mode')
  .option('--sandbox-type <type>', 'Sandbox type: docker, podman, none')
  .allowUnknownOption()
  .allowExcessArguments()
  .action(async (options, command) => {
    const logger = new Logger('grok');
    const settings = await readSettings();
    
    // Get proxy from global option or environment variable
    let proxy = command.parent.opts().proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
    
    const agentOptions = {
      proxy: proxy,
      settings: settings,
      sandboxOptions: {
        sandbox: options.sandbox,
        sandboxType: options.sandboxType
      }
    };
    const agent = new GrokAgent(logger, agentOptions);
    
    
    const args = command.args || [];
    await agent.run(args);
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
  .action(async (options) => {
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


// Auth commands
const authCommand = program
  .command('auth')
  .description('Manage authentication');

// Import AuthHelperFactory for agent status checks
async function getAuthHelperFactory() {
  const { default: AuthHelperFactory } = await import('./auth/auth-helper-factory.js');
  return AuthHelperFactory;
}

authCommand
  .command('login <agent>')
  .description('Authenticate with specific agent (claude, codex, grok, gemini)')
  .action(async (agent) => {
    const supportedAgents = ['claude'];
    const plannedAgents = ['codex', 'grok', 'gemini'];
    
    if (!supportedAgents.includes(agent) && !plannedAgents.includes(agent)) {
      console.log(chalk.red(`❌ Unknown agent: ${agent}`));
      console.log(chalk.gray('Supported agents: claude'));
      console.log(chalk.gray('Planned agents: codex, grok, gemini'));
      process.exit(1);
    }
    
    if (plannedAgents.includes(agent)) {
      console.log(chalk.red(`❌ Authentication for ${agent} is not yet implemented.`));
      console.log(chalk.blue(`💡 This agent is planned for future release.`));
      console.log(chalk.gray(`📖 Visit https://docs.vibekit.dev/agents/${agent} for updates.`));
      process.exit(1);
    }
    
    // Handle Claude authentication
    if (agent === 'claude') {
      try {
        const { ClaudeAuth } = await import('@vibe-kit/auth/node');
        console.log(chalk.blue('🚀 Starting Claude authentication...'));
        console.log(chalk.blue('🌐 Opening browser for OAuth flow...'));
        await ClaudeAuth.authenticate();
        console.log(chalk.green('✅ Authentication successful!'));
        console.log(chalk.gray('📝 Credentials saved to ~/.vibekit/claude-oauth-token.json'));
      } catch (error) {
        console.error(chalk.red('❌ Authentication failed:'), error.message);
        process.exit(1);
      }
    }
  });

authCommand
  .command('status [agent]')
  .description('Show authentication status for all agents or specific agent')
  .action(async (agent) => {
    const AuthHelperFactory = await getAuthHelperFactory();
    const allAgents = ['claude', 'codex', 'grok', 'gemini'];
    
    console.log(chalk.blue('🔐 Authentication Status'));
    console.log(chalk.gray('─'.repeat(50)));
    
    if (agent) {
      // Show status for specific agent
      if (!allAgents.includes(agent)) {
        console.log(chalk.red(`❌ Unknown agent: ${agent}`));
        process.exit(1);
      }
      
      const status = await AuthHelperFactory.getAuthStatus(agent);
      
      if (status.supported) {
        if (status.authenticated) {
          let statusLine = `✅ ${agent}    ${chalk.green('Authenticated')}  (OAuth)`;
          if (status.expiresAt) {
            const expireStr = status.expiresAt.toLocaleString();
            statusLine += `     Expires: ${expireStr}`;
          }
          console.log(statusLine);
        } else {
          console.log(`❌ ${agent}    ${chalk.red('Not authenticated')}     ${status.message}`);
        }
      } else {
        console.log(`🚧 ${agent}    ${chalk.yellow('Implementation pending')}`);
      }
    } else {
      // Show status for all agents
      for (const agentName of allAgents) {
        const status = await AuthHelperFactory.getAuthStatus(agentName);
        
        if (status.supported) {
          if (status.authenticated) {
            let statusLine = `✅ ${agentName.padEnd(8)} ${chalk.green('Authenticated')}  (OAuth)`;
            if (status.expiresAt) {
              const expireStr = status.expiresAt.toLocaleString();
              statusLine += `     Expires: ${expireStr}`;
            }
            console.log(statusLine);
          } else {
            console.log(`❌ ${agentName.padEnd(8)} ${chalk.red('Not authenticated')}     Run: vibekit auth login ${agentName}`);
          }
        } else {
          console.log(`🚧 ${agentName.padEnd(8)} ${chalk.yellow('Implementation pending')}`);
        }
      }
      
      console.log('');
      console.log(chalk.blue('Commands:'));
      console.log(`  ${chalk.cyan('vibekit auth login <agent>')}    Authenticate with specific agent`);
      console.log(`  ${chalk.cyan('vibekit auth verify <agent>')}   Test authentication`);
      console.log(`  ${chalk.cyan('vibekit auth logout <agent>')}   Remove authentication`);
    }
  });

authCommand
  .command('verify <agent>')
  .description('Test authentication with API call for specific agent')
  .action(async (agent) => {
    const supportedAgents = ['claude'];
    
    if (!supportedAgents.includes(agent)) {
      console.log(chalk.red(`❌ Authentication verification for ${agent} is not yet implemented.`));
      process.exit(1);
    }
    
    if (agent === 'claude') {
      try {
        const { ClaudeAuth } = await import('@vibe-kit/auth/node');
        console.log(chalk.blue('🧪 Testing Claude authentication...'));
        
        const result = await ClaudeAuth.verifyWithDetails();
        
        if (result.success) {
          console.log(chalk.green('✅ Claude authentication verified successfully!'));
          console.log(`Response: ${chalk.gray(result.response)}`);
        } else {
          console.log(chalk.red('❌ Claude authentication verification failed'));
          console.log(`Error: ${chalk.gray(result.error)}`);
          if (result.status) {
            console.log(`Status: ${chalk.gray(result.status)}`);
          }
        }
      } catch (error) {
        console.error(chalk.red('❌ Verification failed:'), error.message);
        process.exit(1);
      }
    }
  });

authCommand
  .command('logout <agent>')
  .description('Clear stored authentication for specific agent')
  .option('--all', 'Logout all agents')
  .action(async (agent, options) => {
    const supportedAgents = ['claude'];
    
    if (options.all) {
      console.log(chalk.blue('🚪 Logging out all agents...'));
      
      // Logout Claude
      try {
        const { ClaudeAuth } = await import('@vibe-kit/auth/node');
        await ClaudeAuth.logout();
        console.log(chalk.green('✅ Claude logged out successfully'));
      } catch (error) {
        console.log(chalk.yellow('⚠️  Claude logout failed:'), error.message);
      }
      
      console.log(chalk.green('✅ All available agents logged out'));
      return;
    }
    
    if (!supportedAgents.includes(agent)) {
      console.log(chalk.red(`❌ Logout for ${agent} is not yet implemented.`));
      process.exit(1);
    }
    
    if (agent === 'claude') {
      try {
        const { ClaudeAuth } = await import('@vibe-kit/auth/node');
        await ClaudeAuth.logout();
        console.log(chalk.green('✅ Claude logged out successfully'));
      } catch (error) {
        console.error(chalk.red('❌ Logout failed:'), error.message);
        process.exit(1);
      }
    }
  });

authCommand
  .command('import <agent>')
  .description('Import authentication token for specific agent')
  .option('--token <token>', 'Import access token directly')
  .option('--env', 'Import from environment variable')
  .option('--file <path>', 'Import from JSON file')
  .action(async (agent, options) => {
    const supportedAgents = ['claude'];
    
    if (!supportedAgents.includes(agent)) {
      console.log(chalk.red(`❌ Token import for ${agent} is not yet implemented.`));
      process.exit(1);
    }
    
    if (agent === 'claude') {
      try {
        const { ClaudeAuth } = await import('@vibe-kit/auth/node');
        
        if (options.token) {
          await ClaudeAuth.importToken({ accessToken: options.token });
          console.log(chalk.green('✅ Claude token imported successfully'));
        } else if (options.env) {
          await ClaudeAuth.importToken({ fromEnv: true });
          console.log(chalk.green('✅ Claude token imported from CLAUDE_CODE_OAUTH_TOKEN environment variable'));
        } else if (options.file) {
          await ClaudeAuth.importToken({ fromFile: options.file });
          console.log(chalk.green('✅ Claude token imported from file'));
        } else {
          console.log(chalk.yellow('Please specify import source: --token, --env, or --file'));
          console.log(chalk.gray('Example: vibekit auth import claude --token your-oauth-token'));
        }
      } catch (error) {
        console.error(chalk.red('❌ Import failed:'), error.message);
        process.exit(1);
      }
    }
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
      console.log(chalk.yellow('   1. Run: vibekit (enable aliases)'));
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

// Show welcome screen when just 'vibekit' is typed
if (process.argv.length === 2) {
  render(React.createElement(Settings, { showWelcome: true }));
} else {
  program.parseAsync(process.argv).catch(error => {
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  });
}