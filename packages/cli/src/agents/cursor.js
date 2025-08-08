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
    
    try {
      return await this.createChildProcess(command, args, { cwd });
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