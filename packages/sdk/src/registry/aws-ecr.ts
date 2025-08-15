/**
 * AWS Elastic Container Registry (ECR) Implementation
 * 
 * Provides AWS ECR specific operations including image upload,
 * authentication, and registry management.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { DockerClient } from '../services/docker-client';
import { ConfigManager, type AgentType } from '../services/config-manager';
import { RegistryProvider, type RegistryResult, type ImageUploadResult } from './registry-manager';
import { AGENT_LIST } from '../constants';

const execAsync = promisify(exec);

export interface AWSECRConfig {
  retryAttempts?: number;
  retryDelayMs?: number;
  awsRegion?: string;  // AWS region (e.g., us-east-1)
  awsAccountId?: string;  // AWS account ID
  logger?: {
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, error?: Error | any, meta?: any): void;
  };
}

// Default console logger
const defaultLogger = {
  debug: (msg: string, meta?: any) => console.debug(`[ECR] ${msg}`, meta || ''),
  info: (msg: string, meta?: any) => console.log(`[ECR] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[ECR] ${msg}`, meta || ''),
  error: (msg: string, error?: any, meta?: any) => console.error(`[ECR] ${msg}`, error, meta || ''),
};

export class AWSECRRegistry implements RegistryProvider {
  private dockerClient: DockerClient;
  private configManager: ConfigManager;
  private logger: typeof defaultLogger;
  private awsRegion: string;
  private awsAccountId?: string;

  constructor(config: AWSECRConfig = {}) {
    this.logger = config.logger || defaultLogger;
    this.awsRegion = config.awsRegion || process.env.AWS_REGION || 'us-east-1';
    this.awsAccountId = config.awsAccountId || process.env.AWS_ACCOUNT_ID;
    this.dockerClient = new DockerClient({
      retryAttempts: config.retryAttempts,
      retryDelayMs: config.retryDelayMs,
      logger: this.logger,
    });
    this.configManager = new ConfigManager({ logger: this.logger });
  }

  /**
   * Get ECR registry URL (internal helper)
   */
  private getEcrUrl(): string {
    if (!this.awsAccountId) {
      throw new Error('AWS Account ID required for ECR operations');
    }
    return `${this.awsAccountId}.dkr.ecr.${this.awsRegion}.amazonaws.com`;
  }

  /**
   * Check if user is authenticated with AWS ECR
   */
  async checkLogin(): Promise<{ isLoggedIn: boolean; username?: string | null; registry?: string }> {
    try {
      const registryUrl = this.getEcrUrl();
      const { stdout } = await execAsync('docker system info --format json');
      const info = JSON.parse(stdout);
      
      // Check if ECR is in the registry credentials
      if (info.RegistryConfig?.IndexConfigs) {
        const hasEcr = Object.keys(info.RegistryConfig.IndexConfigs).some(key => 
          key.includes('.dkr.ecr.') && key.includes('.amazonaws.com')
        );
        
        if (hasEcr) {
          return {
            isLoggedIn: true,
            username: this.awsAccountId || null,
            registry: registryUrl
          };
        }
      }
      
      return { isLoggedIn: false, username: null, registry: registryUrl };
    } catch (error) {
      this.logger.debug('Failed to check ECR login status', error);
      return { isLoggedIn: false, username: null, registry: 'ecr' };
    }
  }

  /**
   * Login to AWS ECR using AWS CLI
   */
  async login(): Promise<void> {
    if (!this.awsAccountId) {
      throw new Error('AWS Account ID required for ECR login');
    }

    try {
      // Use AWS CLI to get login token
      const loginCommand = `aws ecr get-login-password --region ${this.awsRegion} | docker login --username AWS --password-stdin ${this.getEcrUrl()}`;
      await execAsync(loginCommand);
      this.logger.info(`Successfully logged into ECR in region ${this.awsRegion}`);
    } catch (error) {
      throw new Error(`Failed to login to ECR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create ECR repository if it doesn't exist
   */
  private async ensureRepository(repositoryName: string): Promise<void> {
    try {
      await execAsync(`aws ecr describe-repositories --repository-names ${repositoryName} --region ${this.awsRegion}`);
      this.logger.debug(`Repository ${repositoryName} already exists`);
    } catch {
      // Repository doesn't exist, create it
      try {
        await execAsync(`aws ecr create-repository --repository-name ${repositoryName} --region ${this.awsRegion}`);
        this.logger.info(`Created ECR repository: ${repositoryName}`);
      } catch (error) {
        throw new Error(`Failed to create ECR repository: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Get registry image name for an agent type
   */
  async getImageName(agentType: AgentType, username?: string): Promise<string | null> {
    // First check config file for custom images
    try {
      const customImage = await this.configManager.getRegistryImage(agentType);
      if (customImage && customImage.includes('.dkr.ecr.')) {
        return customImage;
      }
    } catch {
      // Ignore config errors
    }

    if (!this.awsAccountId) {
      return null;
    }

    const repositoryName = `vibekit-${agentType}`;
    return `${this.getEcrUrl()}/${repositoryName}:latest`;
  }

  /**
   * Upload images to AWS ECR
   */
  async uploadImages(
    username: string,  // In ECR context, this would be the AWS account ID
    selectedAgents?: AgentType[]
  ): Promise<RegistryResult> {
    const agentTypes = selectedAgents?.length ? selectedAgents : AGENT_LIST;
    const results: ImageUploadResult[] = [];

    // Set account ID if provided
    if (username && !this.awsAccountId) {
      this.awsAccountId = username;
    }

    // Ensure we're logged in
    const loginInfo = await this.checkLogin();
    if (!loginInfo.isLoggedIn) {
      await this.login();
    }

    this.logger.info(`Uploading VibeKit images to ECR in region ${this.awsRegion}`);

    for (const agentType of agentTypes) {
      try {
        this.logger.info(`Processing ${agentType} agent`);
        
        // Build local image first
        const localTag = `vibekit-${agentType}:latest`;
        const hasLocalImage = await this.dockerClient.checkLocalImage(localTag);
        
        if (!hasLocalImage) {
          throw new Error(`Local image ${localTag} not found. Build it first.`);
        }

        // Ensure repository exists
        const repositoryName = `vibekit-${agentType}`;
        await this.ensureRepository(repositoryName);

        // Tag for ECR
        const ecrTag = `${this.getEcrUrl()}/${repositoryName}:latest`;
        await this.dockerClient.tagImage(localTag, ecrTag);
        
        // Push to ECR
        await this.dockerClient.pushImage(ecrTag);
        
        this.logger.info(`✓ Uploaded ${agentType} to ECR`);
        results.push({
          agentType,
          success: true,
          imageUrl: ecrTag,
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
    this.logger.info(`Upload complete: ${successCount}/${agentTypes.length} images uploaded to ECR`);

    return {
      success: successCount > 0,
      results,
    };
  }

  /**
   * Pull an image from AWS ECR
   */
  async pullImage(imageName: string): Promise<void> {
    // Ensure we're logged in
    const loginInfo = await this.checkLogin();
    if (!loginInfo.isLoggedIn) {
      await this.login();
    }

    // Ensure the image name includes ECR URL
    const fullImageName = imageName.includes('.dkr.ecr.') ? imageName : `${this.getEcrUrl()}/${imageName}`;
    
    try {
      await execAsync(`docker pull ${fullImageName}`);
      this.logger.debug(`Successfully pulled ${fullImageName}`);
    } catch (error) {
      throw new Error(`Failed to pull from ECR: ${error instanceof Error ? error.message : String(error)}`);
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
    if (!this.awsAccountId) {
      return 'ecr';
    }
    return `${this.awsAccountId}.dkr.ecr.${this.awsRegion}.amazonaws.com`;
  }

  /**
   * Get the registry name
   */
  getRegistryName(): string {
    return 'ecr';
  }

  /**
   * Setup AWS ECR for user
   */
  async setupRegistry(
    selectedAgents?: AgentType[]
  ): Promise<{ success: boolean; config?: any; error?: string }> {
    try {
      if (!this.awsAccountId) {
        return {
          success: false,
          error: 'AWS Account ID required. Set AWS_ACCOUNT_ID environment variable.',
        };
      }

      // Check AWS CLI is configured
      try {
        await execAsync('aws sts get-caller-identity');
      } catch {
        return {
          success: false,
          error: 'AWS CLI not configured. Run "aws configure" first.',
        };
      }

      // Upload images
      const uploadResult = await this.uploadImages(this.awsAccountId, selectedAgents);
      
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
        config.registryType = 'ecr';
        config.registryUser = this.awsAccountId;
        config.awsRegion = this.awsRegion;
        
        await this.configManager.saveConfig(config);
        
        return { success: true, config };
      }

      return {
        success: false,
        error: 'Failed to upload images to ECR',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}