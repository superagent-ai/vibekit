/**
 * GitHub Container Registry (ghcr.io) Implementation
 * 
 * Provides GitHub Container Registry specific operations including image upload,
 * authentication, and registry management.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { DockerClient } from '../services/docker-client';
import { ConfigManager, type AgentType } from '../services/config-manager';
import { RegistryProvider, type RegistryResult, type ImageUploadResult } from './registry-manager';
import { AGENT_LIST } from '../constants';

const execAsync = promisify(exec);

export interface GitHubContainerRegistryConfig {
  retryAttempts?: number;
  retryDelayMs?: number;
  githubToken?: string;  // GitHub Personal Access Token
  logger?: {
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, error?: Error | any, meta?: any): void;
  };
}

// Default console logger
const defaultLogger = {
  debug: (msg: string, meta?: any) => console.debug(`[GHCR] ${msg}`, meta || ''),
  info: (msg: string, meta?: any) => console.log(`[GHCR] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[GHCR] ${msg}`, meta || ''),
  error: (msg: string, error?: any, meta?: any) => console.error(`[GHCR] ${msg}`, error, meta || ''),
};

export class GitHubContainerRegistry implements RegistryProvider {
  private dockerClient: DockerClient;
  private configManager: ConfigManager;
  private logger: typeof defaultLogger;
  private githubToken?: string;

  constructor(config: GitHubContainerRegistryConfig = {}) {
    this.logger = config.logger || defaultLogger;
    this.githubToken = config.githubToken || process.env.GITHUB_TOKEN;
    this.dockerClient = new DockerClient({
      retryAttempts: config.retryAttempts,
      retryDelayMs: config.retryDelayMs,
      logger: this.logger,
    });
    this.configManager = new ConfigManager({ logger: this.logger });
  }

  /**
   * Check if user is authenticated with GitHub Container Registry
   */
  async checkLogin(): Promise<{ isLoggedIn: boolean; username?: string | null; registry?: string }> {
    try {
      const { stdout } = await execAsync('docker system info --format json');
      const info = JSON.parse(stdout);
      
      // Check if ghcr.io is in the registry credentials
      if (info.RegistryConfig?.IndexConfigs) {
        const hasGhcr = Object.keys(info.RegistryConfig.IndexConfigs).some(key => 
          key.includes('ghcr.io')
        );
        
        if (hasGhcr) {
          // Try to get username from git config
          try {
            const { stdout: gitUser } = await execAsync('git config user.name');
            return {
              isLoggedIn: true,
              username: gitUser.trim().toLowerCase().replace(/\s+/g, '-'),
              registry: 'ghcr.io'
            };
          } catch {
            return { isLoggedIn: true, username: null, registry: 'ghcr.io' };
          }
        }
      }
      
      return { isLoggedIn: false, username: null, registry: 'ghcr.io' };
    } catch (error) {
      this.logger.debug('Failed to check GHCR login status', error);
      return { isLoggedIn: false, username: null, registry: 'ghcr.io' };
    }
  }

  /**
   * Login to GitHub Container Registry using token
   */
  async login(username: string): Promise<void> {
    if (!this.githubToken) {
      throw new Error('GitHub token required for GHCR login. Set GITHUB_TOKEN environment variable.');
    }

    try {
      await execAsync(`echo ${this.githubToken} | docker login ghcr.io -u ${username} --password-stdin`);
      this.logger.info(`Successfully logged into ghcr.io as ${username}`);
    } catch (error) {
      throw new Error(`Failed to login to ghcr.io: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get registry image name for an agent type
   */
  async getImageName(agentType: AgentType, username?: string): Promise<string | null> {
    // First check config file for custom images
    try {
      const customImage = await this.configManager.getRegistryImage(agentType);
      if (customImage && customImage.includes('ghcr.io')) {
        return customImage;
      }
    } catch {
      // Ignore config errors
    }

    // Use provided username or try to get from login
    let ghcrUser = username;
    if (!ghcrUser) {
      const loginInfo = await this.checkLogin();
      ghcrUser = loginInfo.username || undefined;
    }

    if (!ghcrUser) {
      return null;
    }

    return `ghcr.io/${ghcrUser}/vibekit-${agentType}:latest`;
  }

  /**
   * Upload images to GitHub Container Registry
   */
  async uploadImages(
    username: string,
    selectedAgents?: AgentType[]
  ): Promise<RegistryResult> {
    const agentTypes = selectedAgents?.length ? selectedAgents : AGENT_LIST;
    const results: ImageUploadResult[] = [];

    // Ensure we're logged in
    const loginInfo = await this.checkLogin();
    if (!loginInfo.isLoggedIn) {
      await this.login(username);
    }

    this.logger.info(`Uploading VibeKit images to ghcr.io/${username}`);

    for (const agentType of agentTypes) {
      try {
        this.logger.info(`Processing ${agentType} agent`);
        
        // Build local image first
        const localTag = `vibekit-${agentType}:latest`;
        const hasLocalImage = await this.dockerClient.checkLocalImage(localTag);
        
        if (!hasLocalImage) {
          throw new Error(`Local image ${localTag} not found. Build it first.`);
        }

        // Tag for GHCR
        const ghcrTag = `ghcr.io/${username}/vibekit-${agentType}:latest`;
        await this.dockerClient.tagImage(localTag, ghcrTag);
        
        // Push to GHCR
        await this.dockerClient.pushImage(ghcrTag);
        
        this.logger.info(`✓ Uploaded ${agentType} to ghcr.io/${username}`);
        results.push({
          agentType,
          success: true,
          imageUrl: ghcrTag,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to upload ${agentType}`, error);
        results.push({
          agentType,
          success: false,
          error: errorMessage,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    this.logger.info(`Upload complete: ${successCount}/${agentTypes.length} images uploaded to GHCR`);

    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Pull an image from GitHub Container Registry
   */
  async pullImage(imageName: string): Promise<void> {
    // Ensure the image name includes ghcr.io
    const fullImageName = imageName.includes('ghcr.io') ? imageName : `ghcr.io/${imageName}`;
    
    try {
      await execAsync(`docker pull ${fullImageName}`);
      this.logger.debug(`Successfully pulled ${fullImageName}`);
    } catch (error) {
      throw new Error(`Failed to pull from GHCR: ${error instanceof Error ? error.message : String(error)}`);
    }
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
    return 'ghcr.io';
  }

  /**
   * Get the registry name
   */
  getRegistryName(): string {
    return 'ghcr';
  }

  /**
   * Setup GitHub Container Registry for user
   */
  async setupRegistry(
    selectedAgents?: AgentType[]
  ): Promise<{ success: boolean; config?: any; error?: string }> {
    try {
      // Check if logged in
      const loginInfo = await this.checkLogin();
      if (!loginInfo.isLoggedIn || !loginInfo.username) {
        return {
          success: false,
          error: 'Not logged into ghcr.io. Please set GITHUB_TOKEN and provide username.',
        };
      }

      // Upload images
      const uploadResult = await this.uploadImages(loginInfo.username, selectedAgents);
      
      if (uploadResult.success) {
        // Save configuration
        const config = await this.configManager.getConfig();
        config.registryImages = config.registryImages || {};
        
        for (const result of uploadResult.results) {
          if (result.success && result.imageUrl) {
            config.registryImages[result.agentType] = result.imageUrl;
          }
        }
        
        config.preferRegistryImages = true;
        config.registryType = 'ghcr';
        config.registryUser = loginInfo.username;
        
        await this.configManager.saveConfig(config);
        
        return { success: true, config };
      }

      return {
        success: false,
        error: 'Failed to upload images to GHCR',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}