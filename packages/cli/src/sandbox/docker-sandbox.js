import { spawn, exec as execCallback } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';
import crypto from 'crypto';
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
    this._projectId = null; // Cache for project ID
  }


  /**
   * Ensure sandbox image exists, build if necessary
   */
  async ensureImage() {
    const imageExists = await SandboxUtils.checkImageExists(this.runtime, this.imageName);
    
    if (!imageExists) {
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
    const searchedPaths = [packageRoot];
    
    // If not found in current directory, try packages/cli (for workspace root execution)
    if (!await fs.pathExists(dockerfilePath)) {
      packageRoot = path.join(process.cwd(), 'packages', 'cli');
      dockerfilePath = path.join(packageRoot, 'Dockerfile');
      searchedPaths.push(packageRoot);
    }
    
    // If still not found, try going up from current directory (for CLI directory execution)
    if (!await fs.pathExists(dockerfilePath) && process.cwd().endsWith('packages/cli')) {
      packageRoot = process.cwd();
      dockerfilePath = path.join(packageRoot, 'Dockerfile');
      searchedPaths.push(packageRoot);
    }
    
    // If still not found, try to find it relative to this module (for npm installed package)
    if (!await fs.pathExists(dockerfilePath)) {
      // Get the directory containing this module
      const moduleDir = path.dirname(fileURLToPath(import.meta.url));
      
      // For compiled JS in dist/, navigate up to the package root
      // dist/sandbox/docker-sandbox.js -> ../../Dockerfile
      if (moduleDir.includes('/dist/')) {
        packageRoot = path.resolve(moduleDir, '../../');
      } else {
        // For source files src/sandbox/docker-sandbox.js -> ../../Dockerfile  
        packageRoot = path.resolve(moduleDir, '../../');
      }
      
      dockerfilePath = path.join(packageRoot, 'Dockerfile');
      searchedPaths.push(packageRoot);
      
      // If still not found and we're in a node_modules directory, try finding the vibekit package
      if (!await fs.pathExists(dockerfilePath) && moduleDir.includes('node_modules')) {
        // Find the vibekit package in node_modules
        const nodeModulesMatch = moduleDir.match(/(.*\/node_modules)/);
        if (nodeModulesMatch) {
          packageRoot = path.join(nodeModulesMatch[1], 'vibekit');
          dockerfilePath = path.join(packageRoot, 'Dockerfile');
          searchedPaths.push(packageRoot);
        }
      }
    }
    
    if (!await fs.pathExists(dockerfilePath)) {
      throw new Error(`Dockerfile not found. Searched in: ${searchedPaths.join(', ')}`);
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
      ...options.env,
      VIBEKIT_SANDBOX_ACTIVE: '1' // Mark that we're inside a sandbox
    };
    
    return new Promise((resolve, reject) => {
      const child = spawn(this.runtime, containerArgs, {
        stdio: options.stdio || 'inherit',
        cwd: this.projectRoot,
        env: containerEnv
      });

      // Clean up temp injection file after a short delay (container has read it)
      if (this._injectionTempFile) {
        setTimeout(async () => {
          try {
            await fs.unlink(this._injectionTempFile);
            this._injectionTempFile = null;
          } catch (error) {
            // Ignore cleanup errors
          }
        }, 5000);
      }

      child.on('close', (code) => {
        resolve({ code });
      });

      child.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Generate consistent project ID from project root path
   * @returns {string} Project ID hash
   */
  getProjectId() {
    if (!this._projectId) {
      // Generate consistent project ID from project root path
      this._projectId = crypto
        .createHash('sha256')
        .update(this.projectRoot)
        .digest('hex')
        .substring(0, 12);
    }
    return this._projectId;
  }


  /**
   * Build container arguments
   * @returns {Promise<Array>} Container args array
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

    // Add any additional container arguments (e.g., for OAuth credentials) BEFORE image name
    if (options.additionalContainerArgs && Array.isArray(options.additionalContainerArgs)) {
      containerArgs.push(...options.additionalContainerArgs);
    }

    // Copy CLAUDE.md files and .claude/agents, commands directories into container during startup
    // This must happen AFTER additionalContainerArgs (which contain auth credentials)
    await this.injectClaudeFiles(containerArgs, os.homedir());

    // Inject environment variables dynamically from .mcp.json
    await this.injectEnvironmentVariables(containerArgs);

    // Mount authentication files if they exist (always enabled for persistence)
    // This works alongside OAuth injection to provide hybrid authentication:
    // 1. Files are mounted for base authentication and persistence
    // 2. OAuth credentials (via additionalContainerArgs above) enhance the mounted files
    const homeDir = os.homedir();
    const claudeAuthFile = path.join(homeDir, '.claude.json');
    const anthropicDir = path.join(homeDir, '.anthropic');
    const configDir = path.join(homeDir, '.config');

    // Note: We intentionally do NOT mount ~/.claude.json directly because:
    // 1. Mounting the user's file directly causes issues with first time Claude initialization
    //    and it wants to create it, but we can override settings as well using --settings
    //    so it merges with values we extract from the user's .claude.json
    // 2. Additionally, all the project data from the host would be included, which isn't
    //    accessible from the sandbox and thus would make no sense and even provide
    //    additional attack vectors to parts of the filesystem in the sandbox that should
    //    not be configured to do so.
    // Instead, OAuth credentials, settings, and user-scope MCP server configs are
    // extracted from the host file and injected via environment variables above.

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

    // Wrap command to execute file injection if present
    // This allows the VIBEKIT_FILE_INJECTION env var to be decoded and executed
    containerArgs.push('bash', '-c');

    // Escape arguments properly for shell execution
    const escapedArgs = args.map(arg => {
      // Escape single quotes by replacing ' with '\''
      const escaped = arg.replace(/'/g, "'\\''");
      return `'${escaped}'`;
    }).join(' ');

    const wrappedCommand = `
(
  if [ -f /tmp/vibekit-inject.sh ]; then
    bash /tmp/vibekit-inject.sh
  fi
) && exec ${command} ${escapedArgs}
`.trim();

    containerArgs.push(wrappedCommand);

    return containerArgs;
  }


  async injectEnvironmentVariables(containerArgs) {
    const projectMcpConfig = path.join(this.projectRoot, '.mcp.json');

    if (await fs.pathExists(projectMcpConfig)) {
      try {
        const mcpConfig = JSON.parse(await fs.readFile(projectMcpConfig, 'utf8'));
        const envVarsToInject = new Set();
        this.extractEnvVarsFromMcpConfig(mcpConfig, envVarsToInject);

        for (const envVar of envVarsToInject) {
          if (process.env[envVar]) {
            containerArgs.push('-e', `${envVar}=${process.env[envVar]}`);
          }
        }
      } catch (error) {
        console.warn(`[vibekit] Failed to parse .mcp.json: ${error.message}`);
      }
    }
  }

  extractEnvVarsFromMcpConfig(config, envVarsSet) {
    const extractFromValue = (value) => {
      if (typeof value === 'string') {
        const envMatches = value.match(/\$\{?([A-Z_][A-Z0-9_]*)\}?/g);
        if (envMatches) {
          envMatches.forEach(match => {
            const envVar = match.replace(/\$\{?([A-Z_][A-Z0-9_]*)\}?/, '$1');
            envVarsSet.add(envVar);
          });
        }
      } else if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(extractFromValue);
      } else if (Array.isArray(value)) {
        value.forEach(extractFromValue);
      }
    };

    extractFromValue(config);
  }

  async injectClaudeFiles(containerArgs, homeDir) {
    const filesToInject = [];

    // User scope: ~/.claude/
    const userClaudeMd = path.join(homeDir, '.claude', 'CLAUDE.md');
    if (await fs.pathExists(userClaudeMd)) {
      const content = await fs.readFile(userClaudeMd, 'utf8');
      filesToInject.push({
        content: content,
        targetPath: '/root/.claude/CLAUDE.md'
      });
    }

    const userDirs = ['agents', 'commands', 'scripts'];
    for (const dirName of userDirs) {
      const userDir = path.join(homeDir, '.claude', dirName);
      if (await fs.pathExists(userDir)) {
        const files = await this.readDirectoryRecursive(userDir);
        for (const file of files) {
          const relativePath = path.relative(userDir, file.path);
          filesToInject.push({
            content: file.content,
            targetPath: `/root/.claude/${dirName}/${relativePath}`
          });
        }
      }
    }

    // Project scope: project/.claude/ and project/CLAUDE.md
    const projectClaudeMd = path.join(this.projectRoot, 'CLAUDE.md');
    if (await fs.pathExists(projectClaudeMd)) {
      const content = await fs.readFile(projectClaudeMd, 'utf8');
      filesToInject.push({
        content: content,
        targetPath: '/workspace/CLAUDE.md'
      });
    }

    for (const dirName of userDirs) {
      const projectDir = path.join(this.projectRoot, '.claude', dirName);
      if (await fs.pathExists(projectDir)) {
        const files = await this.readDirectoryRecursive(projectDir);
        for (const file of files) {
          const relativePath = path.relative(projectDir, file.path);
          filesToInject.push({
            content: file.content,
            targetPath: `/workspace/.claude/${dirName}/${relativePath}`
          });
        }
      }
    }

    // Inject files if any exist
    if (filesToInject.length > 0) {
      const injectionScript = this.createFileInjectionScript(filesToInject);

      // Write script to temp file and mount it (avoids E2BIG error from large env vars)
      const tempFile = path.join(os.tmpdir(), `vibekit-inject-${Date.now()}.sh`);
      await fs.writeFile(tempFile, injectionScript, { mode: 0o755 });

      // Mount the injection script into container
      containerArgs.push('-v', `${tempFile}:/tmp/vibekit-inject.sh:ro`);

      // Store temp file path for cleanup after container starts
      this._injectionTempFile = tempFile;
    }
  }

  async readDirectoryRecursive(dir) {
    const files = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const subFiles = await this.readDirectoryRecursive(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath, 'utf8');
        files.push({ path: fullPath, content });
      }
    }

    return files;
  }

  createFileInjectionScript(filesToInject) {
    let script = '#!/bin/bash\n';

    for (const file of filesToInject) {
      const contentBase64 = Buffer.from(file.content).toString('base64');
      const targetDir = path.dirname(file.targetPath);

      script += `mkdir -p "${targetDir}"\n`;
      script += `echo '${contentBase64}' | base64 -d > "${file.targetPath}"\n`;

      // Set executable permission for scripts
      if (file.targetPath.endsWith('.sh') || file.targetPath.includes('/scripts/') || file.targetPath.includes('/commands/')) {
        script += `chmod +x "${file.targetPath}"\n`;
      }
    }

    return script;
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
      ready: available && imageExists,
      credentials: {
        enabled: true,
        type: 'oauth-with-settings'
      }
    };
  }
}

export default DockerSandbox;