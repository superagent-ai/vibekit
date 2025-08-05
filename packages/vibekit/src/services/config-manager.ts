/**
 * Configuration Manager
 * 
 * Provides provider-agnostic configuration management for VibeKit,
 * including Docker Hub user settings and registry image mappings.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { AgentType } from '../constants';

export { AgentType };

export interface VibeKitConfig {
  dockerHubUser?: string;
  lastImageBuild?: string;
  registryImages?: Partial<Record<AgentType, string>>;
  privateRegistry?: string;
  preferRegistryImages?: boolean;
  pushImages?: boolean;
  [key: string]: any; // Allow for additional config properties
}

export interface ConfigManagerOptions {
  configPath?: string;
  logger?: {
    debug(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    error(message: string, error?: Error | any, meta?: any): void;
  };
}

// Default console logger
const defaultLogger = {
  debug: (msg: string, meta?: any) => console.debug(`[ConfigManager] ${msg}`, meta || ''),
  info: (msg: string, meta?: any) => console.log(`[ConfigManager] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[ConfigManager] ${msg}`, meta || ''),
  error: (msg: string, error?: any, meta?: any) => console.error(`[ConfigManager] ${msg}`, error, meta || ''),
};

export class ConfigManager {
  private configPath: string;
  private configDir: string;
  private logger: typeof defaultLogger;

  constructor(options: ConfigManagerOptions = {}) {
    this.configDir = options.configPath || join(homedir(), ".vibekit");
    this.configPath = join(this.configDir, "config.json");
    this.logger = options.logger || defaultLogger;
  }

  /**
   * Get the current VibeKit configuration
   */
  async getConfig(): Promise<VibeKitConfig> {
    if (!existsSync(this.configPath)) {
      this.logger.debug(`Config file not found at ${this.configPath}, returning empty config`);
      return {};
    }

    try {
      const content = await readFile(this.configPath, "utf-8");
      const config = JSON.parse(content);
      this.logger.debug(`Loaded config from ${this.configPath}`);
      return config;
    } catch (error) {
      this.logger.warn(`Failed to read config file: ${error instanceof Error ? error.message : String(error)}`);
      return {};
    }
  }

  /**
   * Save the VibeKit configuration
   */
  async saveConfig(config: VibeKitConfig): Promise<void> {
    try {
      // Ensure directory exists
      if (!existsSync(this.configDir)) {
        await mkdir(this.configDir, { recursive: true });
        this.logger.debug(`Created config directory: ${this.configDir}`);
      }
      
      await writeFile(this.configPath, JSON.stringify(config, null, 2));
      this.logger.debug(`Saved config to ${this.configPath}`);
    } catch (error) {
      this.logger.error(`Failed to save config: ${error instanceof Error ? error.message : String(error)}`, error);
      throw error;
    }
  }

  /**
   * Update specific configuration values
   */
  async updateConfig(updates: Partial<VibeKitConfig>): Promise<VibeKitConfig> {
    const currentConfig = await this.getConfig();
    const newConfig = { ...currentConfig, ...updates };
    await this.saveConfig(newConfig);
    return newConfig;
  }

  /**
   * Get Docker Hub user from config
   */
  async getDockerHubUser(): Promise<string | undefined> {
    const config = await this.getConfig();
    return config.dockerHubUser;
  }

  /**
   * Set Docker Hub user in config
   */
  async setDockerHubUser(username: string): Promise<void> {
    await this.updateConfig({ dockerHubUser: username });
  }

  /**
   * Get registry image URL for a specific agent type
   */
  async getRegistryImage(agentType: AgentType): Promise<string | undefined> {
    const config = await this.getConfig();
    return config.registryImages?.[agentType];
  }

  /**
   * Set registry image URL for a specific agent type
   */
  async setRegistryImage(agentType: AgentType, imageUrl: string): Promise<void> {
    const config = await this.getConfig();
    const registryImages = config.registryImages || {};
    registryImages[agentType] = imageUrl;
    await this.updateConfig({ registryImages });
  }

  /**
   * Set multiple registry images at once
   */
  async setRegistryImages(images: Partial<Record<AgentType, string>>): Promise<void> {
    const config = await this.getConfig();
    const registryImages = { ...config.registryImages, ...images };
    await this.updateConfig({ registryImages });
  }

  /**
   * Check if registry images are preferred over local builds
   */
  async preferRegistryImages(): Promise<boolean> {
    const config = await this.getConfig();
    return config.preferRegistryImages ?? true;
  }

  /**
   * Check if images should be pushed to registry after building
   */
  async shouldPushImages(): Promise<boolean> {
    const config = await this.getConfig();
    return config.pushImages ?? true;
  }

  /**
   * Get the configuration file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Get the configuration directory path
   */
  getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Check if configuration file exists
   */
  configExists(): boolean {
    return existsSync(this.configPath);
  }

  /**
   * Delete the configuration file
   */
  async deleteConfig(): Promise<void> {
    if (existsSync(this.configPath)) {
      const { unlink } = await import("fs/promises");
      await unlink(this.configPath);
      this.logger.debug(`Deleted config file: ${this.configPath}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  async resetConfig(): Promise<void> {
    const defaultConfig: VibeKitConfig = {
      preferRegistryImages: true,
      pushImages: true,
    };
    await this.saveConfig(defaultConfig);
    this.logger.info("Configuration reset to defaults");
  }
}