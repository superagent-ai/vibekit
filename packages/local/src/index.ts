/**
 * @vibekit/local - Local Sandbox Provider
 * 
 * Main entry point for the local provider package.
 * Exports all public APIs for Dagger integration and setup utilities.
 */

// Dagger integration - matching other providers' interface pattern
export { 
  LocalDaggerSandboxProvider, 
  createLocalProvider, 
  prebuildAgentImages,
  // Docker registry setup functions
  setupUserDockerRegistry,
  checkDockerLogin,
  uploadImagesToUserAccount,
  getVibeKitConfig,
  saveVibeKitConfig,
  type LocalDaggerConfig,
  type AgentType,
  type SandboxInstance,
  type SandboxProvider,
  type SandboxCommands,
  type SandboxExecutionResult,
  type SandboxCommandOptions,
  // Docker registry types
  type DockerLoginInfo,
  type VibeKitConfig
} from './dagger/vibekit-dagger';

// Setup and installation utilities
export {
  setupLocalProvider,
  prebuildSpecificAgents,
  validateDependencies,
  checkSetupStatus,
  cleanupPreBuiltImages,
  type SetupOptions,
  type SetupResult
} from './setup/installer'; 