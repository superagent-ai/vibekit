import DockerSandbox from './docker-sandbox.js';
import SandboxExecSandbox from './sandbox-exec.js';
import SandboxConfig from './sandbox-config.js';
import SandboxUtils from './sandbox-utils.js';
import AuthHelperFactory from '../auth/auth-helper-factory.js';

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
      
      case 'sandbox-exec':
        return new SandboxExecSandbox(this.projectRoot, this.logger, {
          ...this.options,
          profile: sandboxConfig.profile,
          profileFile: sandboxConfig.profileFile,
          profileString: sandboxConfig.profileString,
          profileParams: sandboxConfig.profileParams
        });
      
      case 'none':
      default:
        return null;
    }
  }

  /**
   * Execute command with sandbox if enabled, otherwise direct execution
   */
  async executeWithSandbox(command, args, cliOptions = {}, settings = {}, agentName = null) {
    // Resolve sandbox configuration
    const sandboxConfig = await SandboxConfig.resolveSandboxConfig(cliOptions, settings);

    // Early detection: Skip auth logic entirely if not supported or no sandbox
    if (!sandboxConfig.enabled || sandboxConfig.type !== 'docker' || !agentName) {
      return await this.executeWithoutAuth(command, args, sandboxConfig);
    }

    // Early detection: Check if agent supports auth and has credentials
    const authHelper = await AuthHelperFactory.getAuthHelper(agentName);
    if (!authHelper) {
      // No auth available - proceed without credentials
      return await this.executeWithoutAuth(command, args, sandboxConfig);
    }

    // Auth is available - proceed with credential injection
    return await this.executeWithAuth(command, args, sandboxConfig, authHelper, agentName);
  }

  /**
   * Execute without authentication
   */
  async executeWithoutAuth(command, args, sandboxConfig) {
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

    // Create and execute sandbox without auth
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
   * Execute with authentication
   */
  async executeWithAuth(command, args, sandboxConfig, authHelper, agentName) {
    await this.logger.log('info', `Sandbox enabled with ${agentName} authentication: ${sandboxConfig.type}`, {
      source: sandboxConfig.source,
      runtime: sandboxConfig.runtime
    });

    // Create sandbox instance
    const sandbox = await this.createSandbox(sandboxConfig);
    if (!sandbox) {
      SandboxUtils.logSandboxWarning('Failed to create sandbox, falling back to direct execution');
      return null;
    }

    // Check if sandbox is available
    const isAvailable = await sandbox.isAvailable();
    if (!isAvailable) {
      SandboxUtils.logSandboxWarning(`${sandboxConfig.type} is not available, falling back to direct execution`);
      const helpMessage = sandboxConfig.type === 'sandbox-exec' 
        ? 'sandbox-exec is only available on macOS'
        : 'To use sandbox mode, ensure Docker or Podman is installed and running';
      SandboxUtils.logSandboxOperation(helpMessage);
      return null;
    }

    try {
      // Prepare container arguments for credential injection
      const containerArgs = [];
      let finalCommand = command;
      let finalArgs = args;
      
      // Inject credentials using agent-specific helper
      const commandModification = await authHelper.injectCredentials(
        containerArgs,
        command,
        args
      );
      
      if (commandModification) {
        await this.logger.log('info', `Credentials injected for ${agentName}`, {
          sandboxType: sandboxConfig.type
        });
        
        // Use modified command if provided
        if (commandModification.command) {
          finalCommand = commandModification.command;
          finalArgs = commandModification.args;
        }
      }
      
      // Execute in sandbox with credentials
      const result = await sandbox.executeCommand(finalCommand, finalArgs, {
        stdio: 'inherit',
        env: this.options.env,
        additionalContainerArgs: containerArgs
      });

      await this.logger.log('info', 'Command completed in sandbox with auth', {
        exitCode: result.code,
        sandboxType: sandboxConfig.type
      });

      return result;
    } catch (error) {
      await this.logger.log('error', 'Authenticated sandbox execution failed', {
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