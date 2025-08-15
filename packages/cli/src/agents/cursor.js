import BaseAgent from './base.js';
import { spawn } from 'child_process';
import chalk from 'chalk';

class CursorAgent extends BaseAgent {
  constructor(logger, options = {}) {
    super('cursor', logger, options);
  }

  getAgentCommand() {
    return 'cursor-agent';
  }

  async executeAgent(args, cwd) {
    const command = 'cursor-agent';
    
    // Modify args to append proxy URL to --endpoint flag if proxy is enabled
    const modifiedArgs = this.modifyArgsForProxy(args);
    
    try {
      return await this.createChildProcess(command, modifiedArgs, { cwd });
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(chalk.red('Error: Cursor Agent not found. Please install it first:'));
        console.error(chalk.yellow('  npm install -g cursor-agent'));
        console.error(chalk.yellow('  or visit: https://cursor.com/agent'));
        process.exit(1);
      }
      throw error;
    }
  }

  modifyArgsForProxy(args) {
    // If proxy is not enabled, return args unchanged
    if (!this.proxy || !this.settings?.proxy?.enabled) {
      console.log('[cursor-agent] Proxy not enabled:', { 
        proxy: this.proxy, 
        proxyEnabled: this.settings?.proxy?.enabled 
      });
      return args;
    }

    console.log('[cursor-agent] Modifying args for proxy:', this.proxy);

    const modifiedArgs = [...args];
    let endpointIndex = -1;
    
    // Find --endpoint flag
    for (let i = 0; i < modifiedArgs.length; i++) {
      if (modifiedArgs[i] === '--endpoint' || modifiedArgs[i].startsWith('--endpoint=')) {
        endpointIndex = i;
        break;
      }
    }
    
    if (endpointIndex !== -1) {
      // --endpoint flag found, replace with proxy URL
      if (modifiedArgs[endpointIndex].startsWith('--endpoint=')) {
        // Format: --endpoint=value
        modifiedArgs[endpointIndex] = `--endpoint=${this.proxy}`;
      } else {
        // Format: --endpoint value (next argument)
        if (endpointIndex + 1 < modifiedArgs.length) {
          modifiedArgs[endpointIndex + 1] = this.proxy;
        } else {
          // --endpoint flag exists but no value provided, add proxy as value
          modifiedArgs.push(this.proxy);
        }
      }
    } else {
      // --endpoint flag not found, add it with proxy URL
      modifiedArgs.push('--endpoint', this.proxy);
    }
    
    console.log('[cursor-agent] Final args:', modifiedArgs);
    return modifiedArgs;
  }

  async checkInstallation() {
    return new Promise((resolve) => {
      const child = spawn('cursor-agent', ['--version'], { stdio: 'ignore' });
      child.on('close', (code) => {
        resolve(code === 0);
      });
      child.on('error', () => {
        resolve(false);
      });
    });
  }
}

export default CursorAgent;