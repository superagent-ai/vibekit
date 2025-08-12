/**
 * Registry Integration Bridge
 * 
 * Provides backward compatibility by bridging Dagger package functions
 * to the new shared registry infrastructure.
 */

import { Configuration } from "./vibekit-dagger";

// Import types and classes dynamically to avoid circular dependencies
type DockerLoginInfo = {
  isLoggedIn: boolean;
  username?: string | null;
  registry?: string;
};

type VibeKitConfig = {
  dockerHubUser?: string;
  lastImageBuild?: string;
  registryImages?: Partial<Record<AgentType, string>>;
  privateRegistry?: string;
  preferRegistryImages?: boolean;
  pushImages?: boolean;
  [key: string]: any;
};

type AgentType = "codex" | "claude" | "opencode" | "gemini" | "grok";

// Dynamic imports to avoid circular dependencies
let DockerClient: any = null;
let ConfigManager: any = null;
let DockerHubRegistry: any = null;
let RegistryManager: any = null;

async function getDockerClient() {
  if (!DockerClient) {
    // Import from services module
    const servicesPath = '@vibe-kit/sdk/services';
    const servicesModule = await import(servicesPath).catch(() => null);
    if (servicesModule) {
      DockerClient = servicesModule.DockerClient;
    }
  }
  
  if (!DockerClient) {
    throw new Error("DockerClient not available. Please ensure @vibe-kit/sdk is properly installed.");
  }
  
  const config = Configuration.getInstance().get();
  const logger = Configuration.getInstance().getLogger();
  
  return new DockerClient({
    retryAttempts: config.retryAttempts,
    retryDelayMs: config.retryDelayMs,
    logger,
  });
}

async function getConfigManager() {
  if (!ConfigManager) {
    // Import from services module
    const servicesPath = '@vibe-kit/sdk/services';
    const servicesModule = await import(servicesPath).catch(() => null);
    if (servicesModule) {
      ConfigManager = servicesModule.ConfigManager;
    }
  }
  
  if (!ConfigManager) {
    throw new Error("ConfigManager not available. Please ensure @vibe-kit/sdk is properly installed.");
  }
  
  const config = Configuration.getInstance().get();
  const logger = Configuration.getInstance().getLogger();
  
  return new ConfigManager({
    configPath: config.configPath,
    logger,
  });
}

async function getRegistryManager() {
  if (!DockerHubRegistry || !RegistryManager) {
    const registryPath = '@vibe-kit/sdk/registry';
    const registryModule = await import(registryPath).catch(() => null);
    if (registryModule) {
      DockerHubRegistry = registryModule.DockerHubRegistry;
      RegistryManager = registryModule.RegistryManager;
    }
  }
  
  if (!DockerHubRegistry || !RegistryManager) {
    throw new Error("Registry modules not available. Please ensure @vibe-kit/sdk is properly installed.");
  }
  
  const logger = Configuration.getInstance().getLogger();
  const dockerHubRegistry = new DockerHubRegistry({ logger });
  
  const registryManager = new RegistryManager({
    defaultRegistry: 'dockerhub',
    logger,
  });
  
  registryManager.registerRegistry('dockerhub', dockerHubRegistry);
  return registryManager;
}

/**
 * Check if user is logged into Docker Hub
 */
export async function checkDockerLogin(): Promise<DockerLoginInfo> {
  const dockerClient = await getDockerClient();
  return await dockerClient.checkDockerLogin();
}

/**
 * Get or create VibeKit configuration
 */
export async function getVibeKitConfig(): Promise<VibeKitConfig> {
  const configManager = await getConfigManager();
  return await configManager.getConfig();
}

/**
 * Save VibeKit configuration
 */
export async function saveVibeKitConfig(config: VibeKitConfig): Promise<void> {
  const configManager = await getConfigManager();
  await configManager.saveConfig(config);
}

/**
 * Upload images to user's Docker Hub account
 */
export async function uploadImagesToUserAccount(
  dockerHubUser: string,
  selectedAgents?: AgentType[]
): Promise<{
  success: boolean;
  results: Array<{
    agentType: AgentType;
    success: boolean;
    error?: string;
    imageUrl?: string;
  }>;
}> {
  const registryManager = await getRegistryManager();
  return await registryManager.uploadImages(dockerHubUser, selectedAgents, 'dockerhub');
}

/**
 * Docker registry setup utilities
 */
export async function setupUserDockerRegistry(
  selectedAgents?: AgentType[]
): Promise<{
  success: boolean;
  config?: VibeKitConfig;
  error?: string;
}> {
  const registryManager = await getRegistryManager();
  return await registryManager.setupRegistry(selectedAgents, 'dockerhub');
}