import SandboxUtils from './sandbox-utils.js';

/**
 * Handles sandbox configuration with precedence: CLI flags > Environment variables > Settings file
 */
export class SandboxConfig {
  /**
   * Resolve sandbox configuration following CLI precedence model
   */
  static async resolveSandboxConfig(cliOptions = {}, settings = {}) {
    let sandboxEnabled = false;
    let sandboxType = 'none';
    let source = 'default';

    // 1. Check CLI flags (highest priority)
    if (cliOptions.sandbox || cliOptions.sandboxType) {
      sandboxEnabled = true;
      sandboxType = cliOptions.sandboxType || 'docker';
      source = 'cli';
    }
    // 2. Check environment variables
    else if (process.env.VIBEKIT_SANDBOX === 'true' || process.env.VIBEKIT_SANDBOX === '1') {
      sandboxEnabled = true;
      sandboxType = process.env.VIBEKIT_SANDBOX_TYPE || 'docker';
      source = 'env';
    }
    else if (process.env.VIBEKIT_SANDBOX && process.env.VIBEKIT_SANDBOX !== 'false' && process.env.VIBEKIT_SANDBOX !== '0') {
      // Support direct type specification like VIBEKIT_SANDBOX=docker
      sandboxEnabled = true;
      sandboxType = process.env.VIBEKIT_SANDBOX;
      source = 'env';
    }
    // 3. Check settings file (lowest priority)
    else if (settings.sandbox?.enabled) {
      // Legacy format support
      sandboxEnabled = true;
      sandboxType = settings.sandbox?.type || 'docker';
      source = 'settings';
    }
    else if (settings.sandbox?.type && settings.sandbox.type !== 'none') {
      // New format
      sandboxEnabled = true;
      sandboxType = settings.sandbox.type;
      source = 'settings';
    }

    // Validate sandbox type
    if (sandboxEnabled && !['docker', 'podman', 'sandbox-exec', 'none'].includes(sandboxType)) {
      SandboxUtils.logSandboxWarning(`Unknown sandbox type '${sandboxType}', falling back to 'docker'`);
      sandboxType = 'docker';
    }

    // Auto-detect container runtime if needed
    if (sandboxEnabled && (sandboxType === 'docker' || sandboxType === 'podman')) {
      const availableRuntime = await SandboxUtils.detectContainerRuntime();
      
      if (!availableRuntime) {
        SandboxUtils.logSandboxWarning('No container runtime available, disabling sandbox');
        sandboxEnabled = false;
        sandboxType = 'none';
      } else if (sandboxType !== availableRuntime) {
        // If user specified docker but only podman available (or vice versa), auto-switch
        if (source !== 'cli') {
          sandboxType = availableRuntime;
        }
      }
    }

    const config = {
      enabled: sandboxEnabled,
      type: sandboxEnabled ? sandboxType : 'none',
      source,
      runtime: sandboxEnabled && (sandboxType === 'docker' || sandboxType === 'podman') ? sandboxType : null
    };

    // Add sandbox-exec specific configuration
    if (sandboxEnabled && sandboxType === 'sandbox-exec') {
      // Get configuration from CLI options, environment, or settings
      const sandboxExecConfig = 
        cliOptions.sandboxExec ||
        SandboxConfig.parseSandboxExecEnv() ||
        settings.sandbox?.sandboxExec ||
        {};

      // Default to custom profile if no specific profile is set
      config.profile = sandboxExecConfig.profile;
      config.profileFile = sandboxExecConfig.profileFile;
      config.profileString = sandboxExecConfig.profileString;
      config.profileParams = sandboxExecConfig.profileParams;
    }

    return config;
  }


  /**
   * Get sandbox flags from environment
   */
  static getSandboxFlags() {
    return SandboxUtils.parseSandboxFlags(process.env.VIBEKIT_SANDBOX_FLAGS);
  }

  /**
   * Get sandbox image name
   */
  static getSandboxImageName() {
    return process.env.VIBEKIT_SANDBOX_IMAGE || 'vibekit-sandbox:latest';
  }

  /**
   * Parse sandbox-exec configuration from environment variables
   */
  static parseSandboxExecEnv() {
    const config = {};
    
    if (process.env.VIBEKIT_SANDBOX_EXEC_PROFILE) {
      config.profile = process.env.VIBEKIT_SANDBOX_EXEC_PROFILE;
    }
    
    if (process.env.VIBEKIT_SANDBOX_EXEC_PROFILE_FILE) {
      config.profileFile = process.env.VIBEKIT_SANDBOX_EXEC_PROFILE_FILE;
    }
    
    if (process.env.VIBEKIT_SANDBOX_EXEC_PROFILE_STRING) {
      config.profileString = process.env.VIBEKIT_SANDBOX_EXEC_PROFILE_STRING;
    }

    if (process.env.VIBEKIT_SANDBOX_EXEC_PARAMS) {
      try {
        config.profileParams = JSON.parse(process.env.VIBEKIT_SANDBOX_EXEC_PARAMS);
      } catch (error) {
        SandboxUtils.logSandboxWarning('Invalid JSON in VIBEKIT_SANDBOX_EXEC_PARAMS, ignoring');
      }
    }
    
    return Object.keys(config).length > 0 ? config : null;
  }
}

export default SandboxConfig;