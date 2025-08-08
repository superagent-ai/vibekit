import SandboxUtils from './sandbox-utils.js';

/**
 * Handles sandbox configuration with precedence: CLI flags > Environment variables > Settings file
 */
export class SandboxConfig {
  /**
   * Resolve sandbox configuration following Gemini CLI precedence model
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
      sandboxEnabled = true;
      sandboxType = settings.sandbox?.type || 'docker';
      source = 'settings';
    }

    // Validate sandbox type
    if (sandboxEnabled && !['docker', 'podman', 'none'].includes(sandboxType)) {
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
          SandboxUtils.logSandboxOperation(`Auto-detected container runtime: ${availableRuntime}`);
        }
      }
    }

    return {
      enabled: sandboxEnabled,
      type: sandboxEnabled ? sandboxType : 'none',
      source,
      runtime: sandboxEnabled && (sandboxType === 'docker' || sandboxType === 'podman') ? sandboxType : null
    };
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
}

export default SandboxConfig;