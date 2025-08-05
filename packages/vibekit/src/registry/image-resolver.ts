/**
 * Image Resolver
 * 
 * Provides provider-agnostic image resolution strategy that can be used
 * by any sandbox provider (Dagger, E2B, Northflank, etc.)
 */

import { existsSync } from "fs";
import { DockerClient } from '../services/docker-client';
import { ConfigManager, type AgentType } from '../services/config-manager';
import { RegistryManager } from './registry-manager';
import { AGENT_LIST, AGENT_TYPES } from '../constants';

export interface ImageResolverConfig {
  preferRegistryImages?: boolean;
  pushImages?: boolean;
  privateRegistry?: string;
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
  debug: (msg: string, meta?: any) => console.debug(`[ImageResolver] ${msg}`, meta || ''),
  info: (msg: string, meta?: any) => console.log(`[ImageResolver] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[ImageResolver] ${msg}`, meta || ''),
  error: (msg: string, error?: any, meta?: any) => console.error(`[ImageResolver] ${msg}`, error, meta || ''),
};

// Helper function to get Dockerfile path based on agent type
const getDockerfilePathFromAgentType = (agentType?: AgentType): string | undefined => {
  if (!agentType) return undefined;
  
  const dockerfileMap: Record<AgentType, string> = {
    [AGENT_TYPES.CLAUDE]: "assets/dockerfiles/Dockerfile.claude",
    [AGENT_TYPES.CODEX]: "assets/dockerfiles/Dockerfile.codex",
    [AGENT_TYPES.OPENCODE]: "assets/dockerfiles/Dockerfile.opencode",
    [AGENT_TYPES.GEMINI]: "assets/dockerfiles/Dockerfile.gemini",
    [AGENT_TYPES.GROK]: "assets/dockerfiles/Dockerfile.grok"
  };
  
  return dockerfileMap[agentType];
};

export class ImageResolver {
  private dockerClient: DockerClient;
  private configManager: ConfigManager;
  private registryManager: RegistryManager;
  private config: Required<ImageResolverConfig>;

  constructor(
    config: ImageResolverConfig = {},
    registryManager?: RegistryManager
  ) {
    this.config = {
      preferRegistryImages: config.preferRegistryImages ?? true,
      pushImages: config.pushImages ?? true,
      privateRegistry: config.privateRegistry ?? "",
      retryAttempts: config.retryAttempts ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      logger: config.logger ?? defaultLogger,
    };

    this.dockerClient = new DockerClient({
      retryAttempts: this.config.retryAttempts,
      retryDelayMs: this.config.retryDelayMs,
      logger: this.config.logger,
    });

    this.configManager = new ConfigManager({ logger: this.config.logger });
    
    // Use provided registry manager or create a default one
    this.registryManager = registryManager || new RegistryManager({
      defaultRegistry: 'dockerhub',
      logger: this.config.logger,
    });
  }

  /**
   * Resolve the best available image for an agent type
   * 
   * Strategy:
   * 1. Check local cache
   * 2. Try to pull from user's registry
   * 3. Build locally and push to registry (if configured)
   * 4. Fallback to base image
   */
  async resolveImage(agentType?: AgentType): Promise<string> {
    if (!agentType) {
      return "ubuntu:24.04";
    }

    const localTag = this.getLocalImageTag(agentType);
    
    // Step 1: Check local cache
    try {
      const hasLocalImage = await this.dockerClient.checkLocalImage(localTag);
      if (hasLocalImage) {
        this.config.logger.debug(`Using cached local image: ${localTag}`);
        return localTag;
      }
    } catch (error) {
      this.config.logger.debug(`Local image check failed: ${error}`);
    }

    // Step 2: Try to pull from user's registry
    if (this.config.preferRegistryImages) {
      try {
        const registryImage = await this.registryManager.getImageName(agentType);
        if (registryImage) {
          await this.registryManager.pullImage(registryImage);
          this.config.logger.info(`Successfully pulled image from registry: ${registryImage}`);
          
          // Tag it locally for cache
          await this.dockerClient.tagImage(registryImage, localTag);
          return localTag;
        }
      } catch (error) {
        this.config.logger.debug(`Registry image not found, will build locally`);
      }
    }

    // Step 3: Build locally and push to registry
    const dockerfilePath = getDockerfilePathFromAgentType(agentType);
    if (dockerfilePath && existsSync(dockerfilePath)) {
      try {
        // Validate path doesn't contain directory traversal
        if (dockerfilePath.includes('..') || dockerfilePath.includes('~')) {
          throw new Error(`Invalid dockerfile path: ${dockerfilePath}`);
        }
        // Build the image
        await this.dockerClient.buildImage(dockerfilePath, localTag);
        this.config.logger.info(`✓ Built ${agentType} agent`);

        // Push to registry if configured
        if (this.config.pushImages) {
          try {
            const registryImage = await this.registryManager.getImageName(agentType);
            if (registryImage) {
              await this.dockerClient.tagImage(localTag, registryImage);
              await this.dockerClient.pushImage(registryImage);
              this.config.logger.debug(`Pushed image to registry: ${registryImage}`);
            }
          } catch (pushError) {
            this.config.logger.warn(`Failed to push to registry, continuing with local image`, pushError);
          }
        }

        return localTag;
      } catch (buildError) {
        this.config.logger.error(`Failed to build image from Dockerfile`, buildError);
        throw new Error(`Failed to resolve image for ${agentType}: ${buildError instanceof Error ? buildError.message : String(buildError)}`);
      }
    }

    // Final fallback
    this.config.logger.warn(`No image available for ${agentType}, using fallback`);
    return "ubuntu:24.04";
  }

  /**
   * Get the local image tag for an agent type
   */
  private getLocalImageTag(agentType: AgentType): string {
    return `vibekit-${agentType}:latest`;
  }

  /**
   * Pre-build multiple agent images
   */
  async prebuildImages(selectedAgents?: AgentType[]): Promise<{
    success: boolean;
    results: Array<{
      agentType: AgentType;
      success: boolean;
      error?: string;
      source: "registry" | "dockerfile" | "cached";
    }>;
  }> {
    const agentTypes = selectedAgents?.length ? selectedAgents : AGENT_LIST;
    const results: Array<{
      agentType: AgentType;
      success: boolean;
      error?: string;
      source: "registry" | "dockerfile" | "cached";
    }> = [];

    // Only show pre-build message if not all images are cached
    const needsBuild = agentTypes.length > 0;
    if (needsBuild) {
      this.config.logger.info("Preparing agent images...");
    }

    for (const agentType of agentTypes) {
      try {
        await this.resolveImage(agentType);
        results.push({ agentType, success: true, source: "cached" });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.config.logger.error(`Failed to pre-build image for ${agentType}`, error);
        results.push({ agentType, success: false, error: errorMessage, source: "dockerfile" });
      }
    }

    const successCount = results.filter(r => r.success).length;
    if (successCount === agentTypes.length) {
      this.config.logger.info(`✓ All agent images ready`);
    } else if (successCount > 0) {
      this.config.logger.info(`Images prepared: ${successCount}/${agentTypes.length} successful`);
    }

    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Get available agent types that have Dockerfiles
   */
  getAvailableAgentTypes(): AgentType[] {
    return AGENT_LIST.filter(type => {
      const dockerfilePath = getDockerfilePathFromAgentType(type);
      return dockerfilePath && existsSync(dockerfilePath);
    });
  }

  /**
   * Check if an agent type has a local image
   */
  async hasLocalImage(agentType: AgentType): Promise<boolean> {
    const localTag = this.getLocalImageTag(agentType);
    return await this.dockerClient.checkLocalImage(localTag);
  }

  /**
   * Remove local image for an agent type
   */
  async removeLocalImage(agentType: AgentType, force: boolean = false): Promise<void> {
    const localTag = this.getLocalImageTag(agentType);
    await this.dockerClient.removeImage(localTag, force);
    this.config.logger.info(`Removed local image: ${localTag}`);
  }
}