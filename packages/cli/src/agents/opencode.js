import BaseAgent from './base.js';
import { spawn } from 'child_process';
import chalk from 'chalk';

class OpenCodeAgent extends BaseAgent {
  constructor(logger, options = {}) {
    super('opencode', logger, options);
  }

  getAgentCommand() {
    return 'opencode';
  }

  async executeAgent(args, cwd) {
    const command = 'opencode';
    
    try {
      return await this.createChildProcess(command, args, { cwd });
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(chalk.red('Error: OpenCode CLI not found. Please install it first:'));
        console.error(chalk.yellow('  Visit: https://opencode.ai/'));
        console.error(chalk.yellow('  Or install via npm: npm install -g opencode'));
        process.exit(1);
      }
      throw error;
    }
  }

  async checkInstallation() {
    return new Promise((resolve) => {
      const child = spawn('opencode', ['--version'], { stdio: 'ignore' });
      child.on('close', (code) => {
        resolve(code === 0);
      });
      child.on('error', () => {
        resolve(false);
      });
    });
  }
}

export default OpenCodeAgent;