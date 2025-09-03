import { DevServerManager } from '../manager/DevServerManager.js';
import { DevServerInstance, DevServerLog } from '../types/index.js';
import { createLogger } from '@vibe-kit/logger';

const logger = createLogger('PreviewService');

/**
 * High-level service for managing preview servers
 * Provides a clean API for external packages to use
 */
export class PreviewService {
  private manager: DevServerManager;

  constructor() {
    this.manager = DevServerManager.getInstance();
  }

  /**
   * Start a development server for a project
   */
  async startServer(projectId: string, projectRoot: string, customPort?: number): Promise<DevServerInstance> {
    try {
      logger.info('Starting preview server', { projectId, projectRoot, customPort });
      const instance = await this.manager.startDevServer(projectId, projectRoot, customPort);
      logger.info('Preview server started successfully', { 
        projectId,
        instanceId: instance.id,
        previewUrl: instance.previewUrl 
      });
      return instance;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to start preview server', { projectId, error: errorMessage });
      throw new Error(`Failed to start preview server: ${errorMessage}`);
    }
  }

  /**
   * Stop a development server
   */
  async stopServer(projectId: string): Promise<void> {
    try {
      logger.info('Stopping preview server', { projectId });
      await this.manager.stopDevServer(projectId);
      logger.info('Preview server stopped successfully', { projectId });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to stop preview server', { projectId, error: errorMessage });
      throw new Error(`Failed to stop preview server: ${errorMessage}`);
    }
  }

  /**
   * Get the status of a development server
   */
  async getServerStatus(projectId: string): Promise<DevServerInstance | null> {
    try {
      const status = await this.manager.getServerStatus(projectId);
      if (!status) return null;
      
      // getServerInstance returns the full instance
      return await this.manager.getServerInstance(projectId);
    } catch (error) {
      logger.error('Failed to get server status', { 
        projectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Get logs for a development server
   */
  async getServerLogs(projectId: string, limit?: number): Promise<DevServerLog[]> {
    try {
      const logs = this.manager.getLogs(projectId);
      return limit ? logs.slice(0, limit) : logs;
    } catch (error) {
      logger.error('Failed to get server logs', { 
        projectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return [];
    }
  }

  /**
   * Update last activity timestamp for a server
   */
  async updateActivity(projectId: string): Promise<void> {
    try {
      this.manager.updateServerActivity(projectId);
    } catch (error) {
      logger.error('Failed to update activity', { 
        projectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Stop all active development servers
   */
  async stopAllServers(): Promise<void> {
    try {
      logger.info('Stopping all preview servers');
      await this.manager.shutdown();
      logger.info('All preview servers stopped successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to stop all preview servers', { error: errorMessage });
      throw new Error(`Failed to stop all preview servers: ${errorMessage}`);
    }
  }

  /**
   * Clean up stale lock files on startup
   */
  async cleanupStaleLocks(): Promise<void> {
    try {
      logger.info('Cleaning up stale lock files');
      // This is done automatically on startup via cleanupIdleServers
      logger.info('Stale lock files cleaned up successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to cleanup stale locks', { error: errorMessage });
    }
  }

  /**
   * Get server instance details
   */
  async getServerInstance(projectId: string): Promise<DevServerInstance | null> {
    try {
      return await this.manager.getServerInstance(projectId);
    } catch (error) {
      logger.error('Failed to get server instance', { 
        projectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  /**
   * Get logs since a specific time
   */
  getLogs(projectId: string, since?: Date): DevServerLog[] {
    try {
      return this.manager.getLogs(projectId, since);
    } catch (error) {
      logger.error('Failed to get logs', { 
        projectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return [];
    }
  }

  /**
   * Clear logs for a project
   */
  clearLogs(projectId: string): void {
    try {
      this.manager.clearLogs(projectId);
    } catch (error) {
      logger.error('Failed to clear logs', { 
        projectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }

  /**
   * Update server activity (legacy method name)
   */
  updateServerActivity(projectId: string): void {
    try {
      this.manager.updateServerActivity(projectId);
    } catch (error) {
      logger.error('Failed to update server activity', { 
        projectId, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
    }
  }
}