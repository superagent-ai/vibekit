import { spawn, exec as execCallback } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import { fileURLToPath } from 'url';
import SandboxUtils from './sandbox-utils.js';
import SandboxConfig from './sandbox-config.js';

const exec = promisify(execCallback);

/**
 * Docker-based sandbox implementation
 */
export class DockerSandbox {
  constructor(projectRoot, logger, options = {}) {
    this.projectRoot = projectRoot;
    this.logger = logger;
    this.runtime = options.runtime || 'docker';
    this.imageName = SandboxConfig.getSandboxImageName();
    this.options = {
      networkMode: 'bridge',
      memoryLimit: '1g',
      cpuLimit: '1.0',
      ...options
    };
  }


  /**
   * Ensure sandbox image exists, build if necessary
   */
  async ensureImage() {
    const imageExists = await SandboxUtils.checkImageExists(this.runtime, this.imageName);
    
    if (!imageExists) {
      SandboxUtils.logSandboxOperation('Building sandbox image...');
      await this.buildImage();
    }
    
    return true;
  }

  /**
   * Build sandbox image from existing Dockerfile
   */
  async buildImage() {
    // Find the CLI package root by looking for the Dockerfile
    let packageRoot = process.cwd();
    let dockerfilePath = path.join(packageRoot, 'Dockerfile');
    
    // If not found in current directory, try packages/cli (for workspace root execution)
    if (!await fs.pathExists(dockerfilePath)) {
      packageRoot = path.join(process.cwd(), 'packages', 'cli');
      dockerfilePath = path.join(packageRoot, 'Dockerfile');
    }
    
    // If still not found, try going up from current directory (for CLI directory execution)
    if (!await fs.pathExists(dockerfilePath) && process.cwd().endsWith('packages/cli')) {
      packageRoot = process.cwd();
      dockerfilePath = path.join(packageRoot, 'Dockerfile');
    }
    
    if (!await fs.pathExists(dockerfilePath)) {
      throw new Error(`Dockerfile not found at ${dockerfilePath}. Searched in: ${process.cwd()}, ${path.join(process.cwd(), 'packages', 'cli')}`);
    }

    return new Promise((resolve, reject) => {
      const buildArgs = [
        'build',
        '-t', this.imageName,
        '-f', dockerfilePath,
        packageRoot
      ];

      const buildProcess = spawn(this.runtime, buildArgs, {
        stdio: 'inherit',
        cwd: this.projectRoot
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          SandboxUtils.logSandboxOperation('Sandbox image built successfully');
          resolve();
        } else {
          reject(new Error(`${this.runtime} build failed with code ${code}`));
        }
      });

      buildProcess.on('error', (error) => {
        reject(new Error(`${this.runtime} build process error: ${error.message}`));
      });
    });
  }

  /**
   * Execute command in sandbox container
   */
  async executeCommand(command, args = [], options = {}) {
    await this.ensureImage();

    const containerArgs = await this.buildContainerArgs(command, args, options);
    
    // Prepare environment
    const containerEnv = {
      ...process.env,
      ...options.env
    };
    
    if (!containerEnv.ANTHROPIC_API_KEY) {
      SandboxUtils.logSandboxWarning('No Claude API key found in environment. Set ANTHROPIC_API_KEY environment variable.');
    }
    
    return new Promise((resolve, reject) => {
      const child = spawn(this.runtime, containerArgs, {
        stdio: options.stdio || 'inherit',
        cwd: this.projectRoot,
        env: containerEnv
      });

      child.on('close', (code) => {
        resolve({ code });
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Build container arguments
   */
  async buildContainerArgs(command, args, options) {
    const containerArgs = [
      'run',
      '--rm', // Remove container after execution
      '--interactive',
      '--workdir', '/workspace'
    ];

    // Add TTY if stdin is a TTY
    if (process.stdin.isTTY && options.stdio === 'inherit') {
      containerArgs.push('--tty');
    }

    // Add resource limits
    containerArgs.push('--memory', this.options.memoryLimit);
    containerArgs.push('--cpus', this.options.cpuLimit);

    // Add network configuration
    containerArgs.push('--network', this.options.networkMode);

    // Add custom sandbox flags from environment
    const customFlags = SandboxConfig.getSandboxFlags();
    containerArgs.push(...customFlags);

    // Mount project directory
    containerArgs.push('-v', `${this.projectRoot}:/workspace`);

    // Mount authentication files if they exist
    const homeDir = os.homedir();
    const claudeAuthFile = path.join(homeDir, '.claude.json');
    const anthropicDir = path.join(homeDir, '.anthropic');
    const configDir = path.join(homeDir, '.config');

    // Mount Claude auth file if it exists (read-write so Claude can update it)
    if (await fs.pathExists(claudeAuthFile)) {
      containerArgs.push('-v', `${claudeAuthFile}:/root/.claude.json`);
    }

    // Mount .anthropic directory if it exists
    if (await fs.pathExists(anthropicDir)) {
      containerArgs.push('-v', `${anthropicDir}:/root/.anthropic`);
    }

    // Mount .config directory if it exists (for potential Claude config)
    const claudeConfigDir = path.join(configDir, 'claude');
    if (await fs.pathExists(claudeConfigDir)) {
      containerArgs.push('-v', `${claudeConfigDir}:/root/.config/claude`);
    }

    // Add security options
    containerArgs.push('--security-opt', 'no-new-privileges');

    // Add image name
    containerArgs.push(this.imageName);

    // Add command and arguments
    containerArgs.push(command);
    containerArgs.push(...args);

    return containerArgs;
  }

  /**
   * Check if sandbox is available
   */
  async isAvailable() {
    return await SandboxUtils.checkDockerAvailable();
  }

  /**
   * Get sandbox status information
   */
  async getStatus() {
    const available = await this.isAvailable();
    const imageExists = available ? await SandboxUtils.checkImageExists(this.runtime, this.imageName) : false;

    return {
      available,
      runtime: this.runtime,
      imageName: this.imageName,
      imageExists,
      ready: available && imageExists
    };
  }
}

export default DockerSandbox;