import { spawn, exec as execCallback } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import SandboxUtils from './sandbox-utils.js';

const exec = promisify(execCallback);

/**
 * macOS sandbox-exec based sandbox implementation
 */
export class SandboxExecSandbox {
  constructor(projectRoot, logger, options = {}) {
    this.projectRoot = projectRoot;
    this.logger = logger;
    // Set defaults, but allow options to override
    this.options = { ...options };
    
    // If no specific profile configuration is provided, use our custom development profile
    if (!this.options.profile && !this.options.profileFile && !this.options.profileString) {
      this.options.profileString = this.createDevelopmentProfile();
    }
  }

  /**
   * Execute command in sandbox-exec
   */
  async executeCommand(command, args = [], options = {}) {
    const sandboxArgs = await this.buildSandboxArgs(command, args, options);
    
    // Prepare environment
    const sandboxEnv = {
      ...process.env,
      ...options.env
    };
    
    return new Promise((resolve, reject) => {
      const child = spawn('sandbox-exec', sandboxArgs, {
        stdio: options.stdio || 'inherit',
        cwd: this.projectRoot,
        env: {
          ...sandboxEnv,
          VIBEKIT_SANDBOX_ACTIVE: '1' // Mark that we're inside a sandbox
        }
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
   * Build sandbox-exec arguments
   */
  async buildSandboxArgs(command, args, options) {
    const sandboxArgs = [];

    // Use profile (either built-in or custom)
    if (this.options.profileFile) {
      sandboxArgs.push('-f', this.options.profileFile);
    } else if (this.options.profileString) {
      sandboxArgs.push('-p', this.options.profileString);
    } else {
      sandboxArgs.push('-n', this.options.profile);
    }

    // Add any profile parameters
    if (this.options.profileParams) {
      Object.entries(this.options.profileParams).forEach(([key, value]) => {
        sandboxArgs.push('-D', `${key}=${value}`);
      });
    }

    // Add command and arguments
    sandboxArgs.push(command);
    sandboxArgs.push(...args);

    return sandboxArgs;
  }

  /**
   * Check if sandbox-exec is available (macOS only)
   */
  async isAvailable() {
    // Check if we're on macOS
    if (os.platform() !== 'darwin') {
      return false;
    }

    try {
      // Check if sandbox-exec command exists
      await exec('which sandbox-exec');
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get sandbox status information
   */
  async getStatus() {
    const available = await this.isAvailable();

    return {
      available,
      runtime: 'sandbox-exec',
      profile: this.options.profile,
      profileFile: this.options.profileFile,
      profileString: this.options.profileString,
      ready: available
    };
  }

  /**
   * Get available built-in profiles
   */
  static getBuiltInProfiles() {
    return [
      'no-write',        // Default: Allows network, blocks file writes
      'pure-computation', // Restricts most operations but allows computation
      'no-network'       // Blocks all network access (more secure)
    ];
  }

  /**
   * Create a development-friendly profile with network access (similar to Gemini CLI's permissive-open)
   */
  createDevelopmentProfile() {
    return `
(version 1)
(debug deny)
(allow default)

; Allow network access for development needs
(allow network*)

; Allow file writes in workspace directory and common development locations
(allow file-write*
  (subpath "${this.projectRoot}")
  (subpath "/tmp/")
  (subpath "/private/tmp/")
  (subpath "/var/tmp/")
  (regex #"^/Users/[^/]+/\\.(npm|cache|config)/")
  (regex #"^/Users/[^/]+/node_modules/"))

; Deny writes to critical system areas
(deny file-write* 
  (subpath "/System/")
  (subpath "/usr/")
  (subpath "/bin/")
  (subpath "/sbin/")
  (subpath "/private/etc/")
  (literal "/etc/passwd")
  (literal "/etc/shadow"))

; Allow common development tools
(allow process-exec
  (subpath "/usr/bin/")
  (subpath "/bin/")
  (subpath "/usr/local/bin/"))

; Deny dangerous system operations
(deny process-exec 
  (literal "/usr/bin/sudo")
  (literal "/bin/su"))
`;
  }
}

export default SandboxExecSandbox;