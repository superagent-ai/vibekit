/**
 * @vibe-kit/dagger - Local Sandbox Provider
 *
 * Main entry point for the local provider package.
 * Exports all public APIs for Dagger integration and setup utilities.
 */

// Environment type for compatibility with other packages
export interface Environment {
  id: string;
  name: string;
  status: "running" | "stopped" | "pending" | "error";
  agentType?: string;
  createdAt?: Date;
  lastUsed?: Date;
  branch?: string;
  environment?: {
    VIBEKIT_AGENT_TYPE?: string;
    AGENT_TYPE?: string;
    [key: string]: string | undefined;
  };
}

// Dagger integration - matching other providers' interface pattern
export {
  LocalSandboxProvider,
  createLocalProvider,
  prebuildAgentImages,
  // Docker registry setup functions
  setupUserDockerRegistry,
  checkDockerLogin,
  uploadImagesToUserAccount,
  getVibeKitConfig,
  saveVibeKitConfig,
  type LocalConfig,
  type AgentType,
  type SandboxInstance,
  type SandboxProvider,
  type SandboxCommands,
  type SandboxExecutionResult,
  type SandboxCommandOptions,
  // Docker registry types
  type DockerLoginInfo,
  type VibeKitConfig,
} from "./dagger/vibekit-dagger";

// Alias for backwards compatibility - keep the old Dagger names available
export { LocalSandboxProvider as LocalDaggerSandboxProvider } from "./dagger/vibekit-dagger";
export type { LocalConfig as LocalDaggerConfig } from "./dagger/vibekit-dagger";

// Setup and installation utilities
export {
  setupLocalProvider,
  prebuildSpecificAgents,
  validateDependencies,
  checkSetupStatus,
  cleanupPreBuiltImages,
  type SetupOptions,
  type SetupResult,
} from "./setup/installer";

// Environment storage
export {
  EnvironmentStore,
  type EnvironmentRecord,
} from "./storage/environment-store";

// Import the types we need for the provider function
import { LocalSandboxProvider, type LocalConfig } from "./dagger/vibekit-dagger";

// Main provider creation function - consistent with other providers
export function createDaggerProvider(config: LocalConfig = {}): LocalSandboxProvider {
  return new LocalSandboxProvider(config);
}

// Alias for backward compatibility
export const dagger = createDaggerProvider;
