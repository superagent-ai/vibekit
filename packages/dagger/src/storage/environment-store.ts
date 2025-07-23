/**
 * Environment Storage System
 * 
 * Provides persistent storage for sandbox environment metadata
 * to track environments across CLI sessions.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { homedir } from 'os';
import type { AgentType } from '../dagger/vibekit-dagger';

export interface EnvironmentRecord {
  id: string;
  name: string;
  status: 'running' | 'stopped' | 'paused' | 'error';
  agentType?: AgentType;
  branch?: string;
  created: Date;
  lastUsed: Date;
  sandboxId: string;
  workingDirectory: string;
  envVars: Record<string, string>;
  dockerImage?: string;
  pid?: number; // For tracking background processes
  githubToken?: string;
  model?: string;
  apiKey?: string;
}

export class EnvironmentStore {
  private storePath: string;
  private lockPath: string;

  constructor(customPath?: string) {
    const basePath = customPath || join(homedir(), '.vibekit');
    this.storePath = join(basePath, 'environments.json');
    this.lockPath = join(basePath, 'environments.lock');
  }

  /**
   * Ensure storage directory exists
   */
  private async ensureStorageDir(): Promise<void> {
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * Simple file-based locking for concurrent access
   */
  private async acquireLock(): Promise<void> {
    await this.ensureStorageDir();
    let attempts = 0;
    const maxAttempts = 50; // 5 seconds with 100ms intervals
    
    while (attempts < maxAttempts) {
      try {
        if (!existsSync(this.lockPath)) {
          await writeFile(this.lockPath, process.pid.toString());
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      } catch (error) {
        // File might have been deleted between check and write, try again
        attempts++;
      }
    }
    
    throw new Error('Could not acquire lock for environment storage');
  }

  /**
   * Release the file lock
   */
  private async releaseLock(): Promise<void> {
    try {
      if (existsSync(this.lockPath)) {
        const lockContent = await readFile(this.lockPath, 'utf-8');
        if (lockContent.trim() === process.pid.toString()) {
          await writeFile(this.lockPath, ''); // Clear lock file
        }
      }
    } catch (error) {
      // Lock file might have been removed by another process
    }
  }

  /**
   * Load all environments from storage
   */
  async load(): Promise<EnvironmentRecord[]> {
    await this.acquireLock();
    
    try {
      await this.ensureStorageDir();
      
      if (!existsSync(this.storePath)) {
        return [];
      }

      const content = await readFile(this.storePath, 'utf-8');
      const data = JSON.parse(content);
      
      // Convert date strings back to Date objects
      return data.map((env: any) => ({
        ...env,
        created: new Date(env.created),
        lastUsed: new Date(env.lastUsed)
      }));
    } catch (error) {
      if (error instanceof SyntaxError) {
        // Corrupted JSON, start fresh
        return [];
      }
      throw error;
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Save all environments to storage
   */
  private async saveAll(environments: EnvironmentRecord[]): Promise<void> {
    await this.ensureStorageDir();
    await writeFile(this.storePath, JSON.stringify(environments, null, 2));
  }

  /**
   * Save a new environment
   */
  async save(env: EnvironmentRecord): Promise<void> {
    await this.acquireLock();
    
    try {
      const environments = await this.load();
      
      // Check for duplicate names
      const existing = environments.find(e => e.name === env.name);
      if (existing) {
        throw new Error(`Environment with name '${env.name}' already exists`);
      }
      
      environments.push(env);
      await this.saveAll(environments);
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Update an existing environment
   */
  async update(id: string, updates: Partial<EnvironmentRecord>): Promise<void> {
    await this.acquireLock();
    
    try {
      const environments = await this.load();
      const index = environments.findIndex(env => env.id === id);
      
      if (index === -1) {
        throw new Error(`Environment with id '${id}' not found`);
      }
      
      environments[index] = { ...environments[index], ...updates };
      await this.saveAll(environments);
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Delete an environment by ID
   */
  async delete(id: string): Promise<void> {
    await this.acquireLock();
    
    try {
      const environments = await this.load();
      const filteredEnvironments = environments.filter(env => env.id !== id);
      
      if (filteredEnvironments.length === environments.length) {
        throw new Error(`Environment with id '${id}' not found`);
      }
      
      await this.saveAll(filteredEnvironments);
    } finally {
      await this.releaseLock();
    }
  }

  /**
   * Find environment by ID
   */
  async findById(id: string): Promise<EnvironmentRecord | null> {
    const environments = await this.load();
    return environments.find(env => env.id === id) || null;
  }

  /**
   * Find environment by name
   */
  async findByName(name: string): Promise<EnvironmentRecord | null> {
    const environments = await this.load();
    return environments.find(env => env.name === name) || null;
  }

  /**
   * Get environments filtered by status
   */
  async getByStatus(status: EnvironmentRecord['status']): Promise<EnvironmentRecord[]> {
    const environments = await this.load();
    return environments.filter(env => env.status === status);
  }

  /**
   * Get environments filtered by agent type
   */
  async getByAgentType(agentType: AgentType): Promise<EnvironmentRecord[]> {
    const environments = await this.load();
    return environments.filter(env => env.agentType === agentType);
  }

  /**
   * Clean up old environments (older than specified days)
   */
  async cleanup(olderThanDays: number = 30): Promise<string[]> {
    await this.acquireLock();
    
    try {
      const environments = await this.load();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
      
      const toRemove = environments.filter(env => 
        env.lastUsed < cutoffDate && env.status !== 'running'
      );
      
      const remaining = environments.filter(env => 
        env.lastUsed >= cutoffDate || env.status === 'running'
      );
      
      await this.saveAll(remaining);
      
      return toRemove.map(env => env.name);
    } finally {
      await this.releaseLock();
    }
  }
} 