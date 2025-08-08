import { spawn } from 'child_process';
import chalk from 'chalk';

/**
 * Utility functions for sandbox operations
 */
export class SandboxUtils {
  /**
   * Check if Docker is available and running
   */
  static async checkDockerAvailable() {
    return new Promise((resolve) => {
      const child = spawn('docker', ['info'], { stdio: 'ignore' });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  /**
   * Check if Podman is available
   */
  static async checkPodmanAvailable() {
    return new Promise((resolve) => {
      const child = spawn('podman', ['info'], { stdio: 'ignore' });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  /**
   * Detect best available container runtime
   */
  static async detectContainerRuntime() {
    if (await this.checkDockerAvailable()) {
      return 'docker';
    }
    if (await this.checkPodmanAvailable()) {
      return 'podman';
    }
    return null;
  }

  /**
   * Check if image exists
   */
  static async checkImageExists(runtime, imageName) {
    return new Promise((resolve) => {
      const child = spawn(runtime, ['image', 'inspect', imageName], { stdio: 'ignore' });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  /**
   * Parse sandbox flags from environment variable
   */
  static parseSandboxFlags(flagsString) {
    if (!flagsString) return [];
    
    // Simple parsing - split by spaces but handle quoted arguments
    const flags = [];
    const parts = flagsString.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    
    parts.forEach(part => {
      if (part.startsWith('"') && part.endsWith('"')) {
        flags.push(part.slice(1, -1));
      } else {
        flags.push(part);
      }
    });
    
    return flags;
  }

  /**
   * Log sandbox operation with consistent formatting
   */
  static logSandboxOperation(message, details = {}) {
    console.log(chalk.blue(`[sandbox] ${message}`));
    if (Object.keys(details).length > 0) {
      console.log(chalk.gray(`  ${JSON.stringify(details)}`));
    }
  }

  /**
   * Log sandbox warning
   */
  static logSandboxWarning(message) {
    console.log(chalk.yellow(`⚠️  [sandbox] ${message}`));
  }

  /**
   * Log sandbox error
   */
  static logSandboxError(message) {
    console.log(chalk.red(`❌ [sandbox] ${message}`));
  }
}

export default SandboxUtils;