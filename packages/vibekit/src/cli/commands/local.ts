/**
 * Local Sandbox CLI Commands (Dagger-based)
 * 
 * Simplified commands for managing dagger-based sandbox instances.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import enquirer from 'enquirer';
import { 
  LocalDaggerSandboxProvider, 
  createLocalProvider,
  type LocalDaggerConfig,
  type AgentType,
} from '@vibekit/local';

let localProvider: LocalDaggerSandboxProvider | null = null;

// Mock environment interface for the commands
interface Environment {
  name: string;
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'error';
  agent?: AgentType;
  branch?: string;
  created: Date;
  sandboxId?: string;
}

// In-memory storage for demonstration (in real implementation, this would be persistent)
let environments: Environment[] = [];

/**
 * Get or create the local provider instance
 */
function getLocalProvider(): LocalDaggerSandboxProvider {
  if (!localProvider) {
    localProvider = createLocalProvider({});
  }
  return localProvider;
}

/**
 * List sandbox environments
 */
export async function listCommand(options: {
  status?: string;
  agent?: string;
  branch?: string;
  json?: boolean;
}) {
  try {
    let filteredEnvironments = [...environments];

    // Apply filters
    if (options.status) {
      filteredEnvironments = filteredEnvironments.filter(env => env.status === options.status);
    }
    if (options.agent) {
      filteredEnvironments = filteredEnvironments.filter(env => env.agent === options.agent);
    }
    if (options.branch) {
      filteredEnvironments = filteredEnvironments.filter(env => env.branch === options.branch);
    }

    if (options.json) {
      console.log(JSON.stringify(filteredEnvironments, null, 2));
      return;
    }

    if (filteredEnvironments.length === 0) {
      console.log(chalk.yellow('📭 No sandbox environments found'));
      return;
    }

    console.log(chalk.blue('\n📦 Local Sandbox Environments\n'));
    
    for (const env of filteredEnvironments) {
      const statusColor = env.status === 'running' ? 'green' : 
                         env.status === 'error' ? 'red' : 'yellow';
      
      console.log(chalk.cyan(`🔹 ${env.name}`));
      console.log(`   Status: ${chalk[statusColor](env.status)}`);
      if (env.agent) console.log(`   Agent: ${env.agent}`);
      if (env.branch) console.log(`   Branch: ${env.branch}`);
      if (env.sandboxId) console.log(`   Sandbox ID: ${env.sandboxId}`);
      console.log(`   Created: ${env.created.toLocaleString()}`);
      console.log();
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ Failed to list environments: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Delete sandbox environments
 */
export async function deleteCommand(options: {
  force?: boolean;
  all?: boolean;
  interactive?: boolean;
}, names?: string[]) {
  try {
    let envsToDelete: Environment[] = [];

    if (options.all) {
      envsToDelete = [...environments];
    } else if (names && names.length > 0) {
      for (const name of names) {
        const env = environments.find(e => e.name === name);
        if (env) {
          envsToDelete.push(env);
        } else {
          console.log(chalk.yellow(`⚠️ Environment '${name}' not found`));
        }
      }
    } else if (options.interactive) {
      if (environments.length === 0) {
        console.log(chalk.yellow('📭 No environments to delete'));
        return;
      }

      const { selectedEnvs } = await enquirer.prompt<{ selectedEnvs: string[] }>({
        type: 'multiselect',
        name: 'selectedEnvs',
        message: 'Select environments to delete:',
        choices: environments.map(env => ({
          name: env.name,
          message: `${env.name} (${env.status})`,
          value: env.name
        }))
      });

      envsToDelete = environments.filter(env => selectedEnvs.includes(env.name));
    } else {
      console.error(chalk.red('❌ Please specify environment names, use --all, or use --interactive'));
      process.exit(1);
    }

    if (envsToDelete.length === 0) {
      console.log(chalk.yellow('📭 No environments selected for deletion'));
      return;
    }

    // Confirm deletion unless --force is used
    if (!options.force) {
      const envNames = envsToDelete.map(e => e.name).join(', ');
      const { confirmed } = await enquirer.prompt<{ confirmed: boolean }>({
        type: 'confirm',
        name: 'confirmed',
        message: `Are you sure you want to delete ${envsToDelete.length} environment(s): ${envNames}?`,
        initial: false
      });

      if (!confirmed) {
        console.log(chalk.yellow('❌ Deletion cancelled'));
        return;
      }
    }

    const spinner = ora('Deleting environments...').start();
    
    let deletedCount = 0;
    const provider = getLocalProvider();

    for (const env of envsToDelete) {
      try {
        // If environment has a running sandbox, kill it
        if (env.sandboxId && env.status === 'running') {
          try {
            const sandbox = await provider.resume(env.sandboxId);
            await sandbox.kill();
          } catch (killError) {
            console.warn(chalk.yellow(`⚠️ Could not kill sandbox for ${env.name}: ${killError instanceof Error ? killError.message : String(killError)}`));
          }
        }

        // Remove from environments list
        const index = environments.indexOf(env);
        if (index > -1) {
          environments.splice(index, 1);
          deletedCount++;
        }
      } catch (error) {
        console.warn(chalk.yellow(`⚠️ Error deleting ${env.name}: ${error instanceof Error ? error.message : String(error)}`));
      }
    }

    spinner.succeed(`✅ Deleted ${deletedCount} environment(s)`);
  } catch (error) {
    console.error(chalk.red(`\n❌ Failed to delete environments: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Create a new local sandbox instance
 */
export async function createCommand(options: {
  agent?: string;
  workingDirectory?: string;
  env?: string;
  name?: string;
}) {
  try {
    const spinner = ora('Creating sandbox instance...').start();
    
    const provider = getLocalProvider();
    
    // Parse environment variables if provided
    let envVars: Record<string, string> = {};
    if (options.env) {
      const envPairs = options.env.split(',');
      for (const pair of envPairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
          envVars[key.trim()] = value.trim();
        }
      }
    }

    const agentType = options.agent as AgentType || undefined;
    const workingDirectory = options.workingDirectory || '/workspace';

    const sandbox = await provider.create(envVars, agentType, workingDirectory);
    
    // Create environment record
    const envName = options.name || `env-${Date.now().toString(36)}`;
    const newEnv: Environment = {
      name: envName,
      status: 'running',
      agent: agentType,
      created: new Date(),
      sandboxId: sandbox.sandboxId
    };
    environments.push(newEnv);
    
    spinner.succeed(`Sandbox created with ID: ${sandbox.sandboxId}`);
    
    console.log(chalk.green('\n✅ Sandbox instance created successfully!'));
    console.log(chalk.cyan(`📦 Environment: ${envName}`));
    console.log(chalk.cyan(`📦 Sandbox ID: ${sandbox.sandboxId}`));
    if (agentType) {
      console.log(chalk.cyan(`🤖 Agent Type: ${agentType}`));
    }
    console.log(chalk.cyan(`📁 Working Directory: ${workingDirectory}`));
  } catch (error) {
    console.error(chalk.red(`\n❌ Failed to create sandbox: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Run a command in a sandbox (for testing/demo purposes)
 */
export async function runCommand(options: {
  sandbox?: string;
  command?: string;
  agent?: string;
  streaming?: boolean;
}) {
  try {
    if (!options.command) {
      console.error(chalk.red('❌ Command is required'));
      process.exit(1);
    }

    const spinner = ora('Running command in sandbox...').start();
    
    const provider = getLocalProvider();
    
    // For demo purposes, create a new sandbox if none specified
    let sandbox;
    if (options.sandbox) {
      sandbox = await provider.resume(options.sandbox);
      spinner.text = `Running command in sandbox ${options.sandbox}...`;
    } else {
      const agentType = options.agent as AgentType || undefined;
      sandbox = await provider.create({}, agentType);
      spinner.text = `Running command in new sandbox ${sandbox.sandboxId}...`;
    }

    let streamingActive = false;
    
    // Set up streaming listeners for real-time output (only if streaming enabled)
    if (options.streaming) {
      const streamingSandbox = sandbox as any;
      
      streamingSandbox.on('update', (message: string) => {
        try {
          const data = JSON.parse(message);
          if (data.type === 'stdout' && data.data) {
            if (!streamingActive) {
              spinner.stop();
              streamingActive = true;
            }
            console.log(chalk.blue('📤'), data.data);
          }
        } catch {
          // Ignore non-JSON messages in streaming mode
        }
      });

      streamingSandbox.on('error', (error: string) => {
        if (!streamingActive) {
          spinner.stop();
          streamingActive = true;
        }
        console.log(chalk.yellow('⚠️'), error);
      });
    }

    const result = await sandbox.commands.run(options.command, {
      // Enable streaming callbacks if streaming option is provided
      onStdout: options.streaming ? (data: string) => {
        if (!streamingActive) {
          spinner.stop();
          streamingActive = true;
        }
        // Don't duplicate output - streaming callbacks are redundant with events
      } : undefined,
      onStderr: options.streaming ? (data: string) => {
        if (!streamingActive) {
          spinner.stop();
          streamingActive = true;
        }
        console.log(chalk.yellow('📤 STDERR:'), data);
      } : undefined
    });
    
    if (spinner.isSpinning) {
      spinner.succeed('Command completed');
    } else if (!streamingActive) {
      console.log(chalk.green('✅ Command completed'));
    }
    
    console.log(chalk.green('\n✅ Command executed successfully!'));
    console.log(chalk.cyan(`📦 Sandbox ID: ${sandbox.sandboxId}`));
    console.log(chalk.cyan(`🔢 Exit Code: ${result.exitCode}`));
    
    // Only show final output if not streaming (to avoid duplicates)
    if (!options.streaming && result.stdout) {
      console.log(chalk.blue('\n📤 STDOUT:'));
      console.log(result.stdout);
    }
    
    if (!options.streaming && result.stderr) {
      console.log(chalk.yellow('\n📤 STDERR:'));
      console.log(result.stderr);
    }

    // Clean up event listeners to ensure process exits cleanly
    if (options.streaming) {
      const streamingSandbox = sandbox as any;
      streamingSandbox.removeAllListeners('update');
      streamingSandbox.removeAllListeners('error');
    }
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Failed to run command: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

/**
 * Display help and tips for using the local provider
 */
export async function helpCommand() {
  console.log(chalk.blue('\n🔧 VibeKit Local Provider (Dagger-based)\n'));
  console.log('The local provider uses Dagger to create isolated sandbox instances.');
  console.log('Each sandbox is ephemeral and designed for specific tasks.\n');
  
  console.log(chalk.green('Available Commands:'));
  console.log('  create     Create a new sandbox instance');
  console.log('  list       List sandbox environments');
  console.log('  delete     Delete sandbox environments');
  console.log('  run        Run a command in a sandbox');
  console.log('  help       Show this help message\n');
  
  console.log(chalk.green('Agent Types:'));
  console.log('  claude     Claude-optimized environment');
  console.log('  codex      OpenAI Codex environment');
  console.log('  opencode   Open source model environment');
  console.log('  gemini     Google Gemini environment\n');
  
  console.log(chalk.green('Examples:'));
  console.log('  vibekit local create --agent claude --name my-claude-env');
  console.log('  vibekit local list --status running');
  console.log('  vibekit local delete --interactive');
  console.log('  vibekit local run --command "npm install" --agent codex');
  console.log('  vibekit local run --sandbox sandbox-id --command "ls -la"\n');
}

/**
 * Create the local command with all subcommands
 */
export function createLocalCommand(): Command {
  const localCmd = new Command('local');
  localCmd.description('Manage local Dagger-based sandbox instances');

  // Create subcommand
  localCmd
    .command('create')
    .description('Create a new sandbox instance')
    .option('--name <name>', 'Environment name')
    .option('--agent <type>', 'Agent type (claude, codex, opencode, gemini)')
    .option('--working-directory <path>', 'Working directory in sandbox', '/workspace')
    .option('--env <env>', 'Environment variables (key=value,key2=value2)')
    .action(createCommand);

  // List subcommand
  localCmd
    .command('list')
    .alias('ls')
    .description('List sandbox environments')
    .option('--status <status>', 'Filter by status (running, stopped, error)')
    .option('--agent <agent>', 'Filter by agent type')
    .option('--branch <branch>', 'Filter by branch')
    .option('--json', 'Output as JSON')
    .action(listCommand);

  // Delete subcommand
  localCmd
    .command('delete [names...]')
    .alias('rm')
    .description('Delete sandbox environments')
    .option('--force', 'Force deletion without confirmation')
    .option('--all', 'Delete all environments')
    .option('--interactive', 'Interactive selection mode')
    .action((names, options) => deleteCommand(options, names));

  // Run subcommand
  localCmd
    .command('run')
    .description('Run a command in a sandbox')
    .option('--sandbox <id>', 'Existing sandbox ID (creates new if not specified)')
    .option('--command <cmd>', 'Command to execute')
    .option('--agent <type>', 'Agent type for new sandbox (claude, codex, opencode, gemini)')
    .option('--streaming', 'Enable real-time output streaming')
    .action(runCommand);

  // Help subcommand
  localCmd
    .command('help')
    .description('Show detailed help and examples')
    .action(helpCommand);

  return localCmd;
} 