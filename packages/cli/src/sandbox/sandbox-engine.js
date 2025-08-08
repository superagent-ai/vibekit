import DockerSandbox from './docker-sandbox.js';
import SandboxConfig from './sandbox-config.js';
import SandboxUtils from './sandbox-utils.js';

/**
 * Main sandbox orchestrator - handles sandbox selection and execution
 */
export class SandboxEngine {
  constructor(projectRoot, logger, options = {}) {
    this.projectRoot = projectRoot;
    this.logger = logger;
    this.options = options;
  }

  /**
   * Create appropriate sandbox instance based on configuration
   */
  async createSandbox(sandboxConfig) {
    const { type, runtime } = sandboxConfig;

    switch (type) {
      case 'docker':
      case 'podman':
        return new DockerSandbox(this.projectRoot, this.logger, {
          ...this.options,
          runtime: runtime || type
        });
      
      case 'none':
      default:
        return null;
    }
  }

  /**
   * Execute command with sandbox if enabled, otherwise direct execution
   */
  async executeWithSandbox(command, args, cliOptions = {}, settings = {}) {
    // Resolve sandbox configuration
    const sandboxConfig = await SandboxConfig.resolveSandboxConfig(cliOptions, settings);

    // Log sandbox decision for transparency
    if (sandboxConfig.enabled) {
      await this.logger.log('info', `Sandbox enabled: ${sandboxConfig.type}`, {
        source: sandboxConfig.source,
        runtime: sandboxConfig.runtime
      });
    }

    // If sandbox not enabled, return null to indicate direct execution
    if (!sandboxConfig.enabled) {
      return null;
    }

    // Create sandbox instance
    const sandbox = await this.createSandbox(sandboxConfig);
    if (!sandbox) {
      SandboxUtils.logSandboxWarning('Failed to create sandbox, falling back to direct execution');
      return null;
    }

    // Check if sandbox is available
    const isAvailable = await sandbox.isAvailable();
    if (!isAvailable) {
      SandboxUtils.logSandboxWarning(`${sandboxConfig.runtime} is not available, falling back to direct execution`);
      SandboxUtils.logSandboxOperation('To use sandbox mode, ensure Docker or Podman is installed and running');
      return null;
    }

    try {
      // Execute in sandbox
      const result = await sandbox.executeCommand(command, args, {
        stdio: 'inherit',
        env: this.options.env
      });

      await this.logger.log('info', 'Command completed in sandbox', {
        exitCode: result.code,
        sandboxType: sandboxConfig.type
      });

      return result;
    } catch (error) {
      await this.logger.log('error', 'Sandbox execution failed', {
        error: error.message,
        sandboxType: sandboxConfig.type
      });
      
      SandboxUtils.logSandboxError(`Execution failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get sandbox status for management commands
   */
  async getStatus(cliOptions = {}, settings = {}) {
    const sandboxConfig = await SandboxConfig.resolveSandboxConfig(cliOptions, settings);
    
    if (!sandboxConfig.enabled) {
      return {
        enabled: false,
        type: 'none',
        available: false
      };
    }

    const sandbox = await this.createSandbox(sandboxConfig);
    if (!sandbox) {
      return {
        enabled: true,
        type: sandboxConfig.type,
        available: false,
        error: 'Failed to create sandbox instance'
      };
    }

    const status = await sandbox.getStatus();
    
    return {
      enabled: true,
      type: sandboxConfig.type,
      source: sandboxConfig.source,
      ...status
    };
  }
}

export default SandboxEngine;