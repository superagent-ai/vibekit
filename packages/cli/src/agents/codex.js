import BaseAgent from './base.js';
import { spawn } from 'child_process';
import chalk from 'chalk';

class CodexAgent extends BaseAgent {
  constructor(logger, options = {}) {
    super('codex', logger, options);
  }

  getAgentCommand() {
    return 'codex';
  }

  async executeAgent(args, cwd) {
    const command = 'codex';
    
    try {
      return await this.createChildProcess(command, args, { cwd });
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.error(chalk.red('Error: Codex CLI not found. Please install it first:'));
        console.error(chalk.yellow('  npm install -g @openai/codex'));
        console.error(chalk.yellow('  or visit: https://github.com/openai/codex'));
        process.exit(1);
      }
      throw error;
    }
  }

  async checkInstallation() {
    return new Promise((resolve) => {
      const child = spawn('codex', ['--version'], { stdio: 'ignore' });
      child.on('close', (code) => {
        resolve(code === 0);
      });
      child.on('error', () => {
        resolve(false);
      });
    });
  }
}

export default CodexAgent;