/**
 * Registry Manager
 * 
 * Provides a generic interface for container registry operations,
 * supporting multiple registry providers (Docker Hub, ECR, GCR, etc.)
 */

import { type AgentType } from '../infra/config-manager';

export interface ImageUploadResult {
  agentType: AgentType;
  success: boolean;
  error?: string;
  imageUrl?: string;
}

export interface RegistryResult {
  success: boolean;
  results: ImageUploadResult[];
}

export interface RegistryProvider {
  /**
   * Check if user is authenticated with the registry
   */
  checkLogin(): Promise<{ isLoggedIn: boolean; username?: string | null; registry?: string }>;

  /**
   * Get the full image name for an agent type in this registry
   */
  getImageName(agentType: AgentType, username?: string): Promise<string | null>;

  /**
   * Upload multiple images to the registry
   */
  uploadImages(username: string, selectedAgents?: AgentType[]): Promise<RegistryResult>;

  /**
   * Pull an image from the registry
   */
  pullImage(imageName: string): Promise<void>;

  /**
   * Check if an image exists locally
   */
  checkLocalImage(imageName: string): Promise<boolean>;

  /**
   * Get the registry URL/identifier
   */
  getRegistryUrl(): string;

  /**
   * Get a human-readable registry name
   */
  getRegistryName(): string;
}

export interface RegistryManagerConfig {
  defaultRegistry?: 'dockerhub' | 'ecr' | 'gcr' | 'github';
  registries?: Record<string, RegistryProvider>;
  logger?: {
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, error?: Error | any, meta?: any): void;
  };
}

// Default console logger
const defaultLogger = {
  debug: (msg: string, meta?: any) => console.debug(`[RegistryManager] ${msg}`, meta || ''),
  info: (msg: string, meta?: any) => console.log(`[RegistryManager] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[RegistryManager] ${msg}`, meta || ''),
  error: (msg: string, error?: any, meta?: any) => console.error(`[RegistryManager] ${msg}`, error, meta || ''),
};

export class RegistryManager {
  private registries: Record<string, RegistryProvider> = {};
  private defaultRegistry: string;
  private logger: typeof defaultLogger;

  constructor(config: RegistryManagerConfig = {}) {
    this.defaultRegistry = config.defaultRegistry || 'dockerhub';
    this.logger = config.logger || defaultLogger;
    
    if (config.registries) {
      this.registries = { ...config.registries };
    }
  }

  /**
   * Register a new registry provider
   */
  registerRegistry(name: string, provider: RegistryProvider): void {
    this.registries[name] = provider;
    this.logger.debug(`Registered registry provider: ${name}`);
  }

  /**
   * Get a registry provider by name
   */
  getRegistry(name?: string): RegistryProvider {
    const registryName = name || this.defaultRegistry;
    const registry = this.registries[registryName];
    
    if (!registry) {
      throw new Error(`Registry provider '${registryName}' not found. Available: ${Object.keys(this.registries).join(', ')}`);
    }
    
    return registry;
  }

  /**
   * Get list of available registry names
   */
  getAvailableRegistries(): string[] {
    return Object.keys(this.registries);
  }

  /**
   * Set the default registry
   */
  setDefaultRegistry(name: string): void {
    if (!this.registries[name]) {
      throw new Error(`Cannot set default registry to '${name}' - registry not found`);
    }
    this.defaultRegistry = name;
    this.logger.info(`Default registry set to: ${name}`);
  }

  /**
   * Check login status for a specific registry
   */
  async checkLogin(registryName?: string): Promise<{ isLoggedIn: boolean; username?: string | null; registry?: string }> {
    const registry = this.getRegistry(registryName);
    return await registry.checkLogin();
  }

  /**
   * Get image name for an agent type from a specific registry
   */
  async getImageName(agentType: AgentType, registryName?: string, username?: string): Promise<string | null> {
    const registry = this.getRegistry(registryName);
    return await registry.getImageName(agentType, username);
  }

  /**
   * Upload images to a specific registry
   */
  async uploadImages(
    username: string, 
    selectedAgents?: AgentType[], 
    registryName?: string
  ): Promise<RegistryResult> {
    const registry = this.getRegistry(registryName);
    this.logger.info(`Uploading images to ${registry.getRegistryName()}`);
    return await registry.uploadImages(username, selectedAgents);
  }

  /**
   * Pull an image from a specific registry
   */
  async pullImage(imageName: string, registryName?: string): Promise<void> {
    const registry = this.getRegistry(registryName);
    await registry.pullImage(imageName);
  }

  /**
   * Check if an image exists locally
   */
  async checkLocalImage(imageName: string, registryName?: string): Promise<boolean> {
    const registry = this.getRegistry(registryName);
    return await registry.checkLocalImage(imageName);
  }

  /**
   * Setup registry integration for a user
   */
  async setupRegistry(
    selectedAgents?: AgentType[], 
    registryName?: string
  ): Promise<{
    success: boolean;
    config?: any;
    error?: string;
  }> {
    const registry = this.getRegistry(registryName);
    
    // Check if the registry has a setup method
    if ('setupRegistry' in registry && typeof registry.setupRegistry === 'function') {
      return await (registry as any).setupRegistry(selectedAgents);
    }
    
    // Generic setup - just upload images if logged in
    const loginInfo = await registry.checkLogin();
    if (!loginInfo.isLoggedIn || !loginInfo.username) {
      return {
        success: false,
        error: `Not logged into ${registry.getRegistryName()}`,
      };
    }

    const uploadResult = await registry.uploadImages(loginInfo.username, selectedAgents);
    return {
      success: uploadResult.success,
      error: uploadResult.success ? undefined : "Failed to upload images to registry",
    };
  }

  /**
   * Get registry information
   */
  getRegistryInfo(registryName?: string): { name: string; url: string } {
    const registry = this.getRegistry(registryName);
    return {
      name: registry.getRegistryName(),
      url: registry.getRegistryUrl(),
    };
  }
}