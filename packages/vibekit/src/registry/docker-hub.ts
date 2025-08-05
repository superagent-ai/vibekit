/**
 * Docker Hub Registry Implementation
 * 
 * Provides Docker Hub specific operations including image upload,
 * user account management, and registry setup.
 */

import { DockerClient, type DockerLoginInfo } from '../services/docker-client';
import { ConfigManager, type AgentType, type VibeKitConfig } from '../services/config-manager';
import { RegistryProvider, type RegistryResult, type ImageUploadResult } from './registry-manager';
import { AGENT_LIST } from '../constants';

export interface DockerHubConfig {
  retryAttempts?: number;
  retryDelayMs?: number;
  logger?: {
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, error?: Error | any, meta?: any): void;
  };
}

// Default console logger
const defaultLogger = {
  debug: (msg: string, meta?: any) => console.debug(`[DockerHub] ${msg}`, meta || ''),
  info: (msg: string, meta?: any) => console.log(`[DockerHub] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[DockerHub] ${msg}`, meta || ''),
  error: (msg: string, error?: any, meta?: any) => console.error(`[DockerHub] ${msg}`, error, meta || ''),
};

export class DockerHubRegistry implements RegistryProvider {
  private dockerClient: DockerClient;
  private configManager: ConfigManager;
  private logger: typeof defaultLogger;

  constructor(config: DockerHubConfig = {}) {
    this.logger = config.logger || defaultLogger;
    this.dockerClient = new DockerClient({
      retryAttempts: config.retryAttempts,
      retryDelayMs: config.retryDelayMs,
      logger: this.logger,
    });
    this.configManager = new ConfigManager({ logger: this.logger });
  }

  /**
   * Check if user is logged into Docker Hub
   */
  async checkLogin(): Promise<DockerLoginInfo> {
    return await this.dockerClient.checkDockerLogin();
  }

  /**
   * Get registry image name for an agent type
   */
  async getImageName(agentType: AgentType, username?: string): Promise<string | null> {
    // First check config file for custom images
    try {
      const customImage = await this.configManager.getRegistryImage(agentType);
      if (customImage) {
        return customImage;
      }
    } catch {
      // Ignore config errors
    }

    // Use provided username or get from config/login
    let dockerHubUser = username;
    if (!dockerHubUser) {
      dockerHubUser = await this.configManager.getDockerHubUser();
    }
    if (!dockerHubUser) {
      const loginInfo = await this.checkLogin();
      dockerHubUser = loginInfo.username || undefined;
    }

    if (!dockerHubUser) {
      return null;
    }

    return `${dockerHubUser}/vibekit-${agentType}:latest`;
  }

  /**
   * Upload images to user's Docker Hub account
   */
  async uploadImages(
    dockerHubUser: string,
    selectedAgents?: AgentType[]
  ): Promise<RegistryResult> {
    const defaultAgentTypes = AGENT_LIST;
    const agentTypes = selectedAgents?.length ? selectedAgents : defaultAgentTypes;
    const results: ImageUploadResult[] = [];

    this.logger.info(`Uploading VibeKit images to ${dockerHubUser}'s Docker Hub account`);

    for (const agentType of agentTypes) {
      try {
        this.logger.info(`Processing ${agentType} agent`);

        // Check if local image exists
        const localTag = `vibekit-${agentType}:latest`;
        const imageExists = await this.dockerClient.checkLocalImage(localTag);
        
        if (!imageExists) {
          this.logger.warn(`Local image ${localTag} not found, skipping upload`);
          results.push({ 
            agentType, 
            success: false, 
            error: `Local image ${localTag} not found` 
          });
          continue;
        }
        
        // Tag for user's account
        const userImageTag = `${dockerHubUser}/vibekit-${agentType}:latest`;
        
        await this.dockerClient.tagImage(localTag, userImageTag);
        this.logger.info(`Tagged as ${userImageTag}`);

        // Push to user's Docker Hub
        this.logger.info(`Pushing ${userImageTag} to Docker Hub`);
        await this.dockerClient.pushImage(userImageTag);
        
        this.logger.info(`Successfully pushed ${userImageTag}`);

        results.push({
          agentType,
          success: true,
          imageUrl: userImageTag,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to upload ${agentType} image`, error);
        results.push({ agentType, success: false, error: errorMessage });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info(`Upload complete: ${successCount}/${agentTypes.length} images uploaded`);

    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Setup user's Docker Hub registry integration
   */
  async setupRegistry(selectedAgents?: AgentType[]): Promise<{
    success: boolean;
    config?: VibeKitConfig;
    error?: string;
  }> {
    try {
      this.logger.info("Setting up VibeKit Docker Registry Integration");

      // Check Docker login
      const loginInfo = await this.checkLogin();
      
      if (!loginInfo.isLoggedIn || !loginInfo.username) {
        return {
          success: false,
          error: 'Not logged into Docker Hub. Please run "docker login" first.',
        };
      }

      this.logger.info(`Logged in as: ${loginInfo.username}`);

      // Upload images to user's account
      const uploadResult = await this.uploadImages(loginInfo.username, selectedAgents);

      if (!uploadResult.success) {
        return {
          success: false,
          error: "Failed to upload images to Docker Hub",
        };
      }

      // Update configuration
      const config: VibeKitConfig = {
        dockerHubUser: loginInfo.username,
        lastImageBuild: new Date().toISOString(),
        registryImages: {},
      };

      // Map successful uploads to registry images
      for (const result of uploadResult.results) {
        if (result.success && result.imageUrl) {
          config.registryImages![result.agentType] = result.imageUrl;
        }
      }

      await this.configManager.saveConfig(config);
      this.logger.info("Configuration saved");

      return { success: true, config };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error("Failed to setup Docker registry", error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Pull an image from the registry
   */
  async pullImage(imageName: string): Promise<void> {
    await this.dockerClient.pullImage(imageName);
  }

  /**
   * Check if an image exists locally
   */
  async checkLocalImage(imageName: string): Promise<boolean> {
    return await this.dockerClient.checkLocalImage(imageName);
  }

  /**
   * Get the registry URL/identifier
   */
  getRegistryUrl(): string {
    return "https://index.docker.io/v1/";
  }

  /**
   * Get the registry name
   */
  getRegistryName(): string {
    return "Docker Hub";
  }
}