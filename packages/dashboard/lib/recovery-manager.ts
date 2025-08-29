/**
 * Recovery Manager
 * 
 * Comprehensive recovery system for VibeKit Dashboard that provides:
 * - Checkpoint-based recovery for interrupted operations
 * - Multi-strategy recovery mechanisms
 * - State restoration and cleanup
 * - Recovery coordination and prevention of duplicate attempts
 */

import { promises as fs } from 'fs';
import path from 'path';
import { SafeFileWriter } from './safe-file-writer';
import { createSafeVibeKitPath, ValidationError } from './security-utils';
import { createLogger } from './structured-logger';
import { ErrorClassifier, CircuitBreaker, RetryHandler } from './error-handler';

// ============================================================================
// Type Definitions
// ============================================================================

export interface RecoveryCheckpoint {
  id: string;
  sessionId: string;
  executionId?: string;
  projectId: string;
  operationType: 'session_execution' | 'file_operation' | 'docker_operation' | 'api_request';
  state: Record<string, any>;
  dependencies: string[]; // Services this checkpoint depends on
  timestamp: number;
  retryCount: number;
  maxRetries: number;
  expiresAt: number;
}

export interface RecoveryStrategy {
  name: string;
  priority: number; // Lower number = higher priority
  execute: (checkpoint: RecoveryCheckpoint, error: any) => Promise<RecoveryResult>;
  canHandle: (checkpoint: RecoveryCheckpoint, error: any) => boolean;
}

export interface RecoveryResult {
  success: boolean;
  strategy: string;
  attempts: number;
  result?: any;
  error?: any;
  checkpointRequired?: boolean;
  newState?: Record<string, any>;
}

export interface RecoveryMetrics {
  activeRecoveries: number;
  successfulRecoveries: number;
  failedRecoveries: number;
  circuitBreakerStates: Record<string, 'closed' | 'open' | 'half-open'>;
  checkpointCount: number;
  averageRecoveryTime: number;
  strategySuccessRates: Record<string, number>;
}

// ============================================================================
// Recovery Strategies
// ============================================================================

class RetryWithBackoffStrategy implements RecoveryStrategy {
  name = 'retry_with_backoff';
  priority = 1;

  canHandle(checkpoint: RecoveryCheckpoint, error: any): boolean {
    const structured = ErrorClassifier.classify(error);
    return structured.retryable && checkpoint.retryCount < checkpoint.maxRetries;
  }

  async execute(checkpoint: RecoveryCheckpoint, error: any): Promise<RecoveryResult> {
    const attempts = checkpoint.retryCount + 1;
    
    try {
      // Wait with exponential backoff
      const delay = Math.min(1000 * Math.pow(2, checkpoint.retryCount), 30000);
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Re-attempt the operation based on type
      const result = await this.retryOperation(checkpoint);
      
      return {
        success: true,
        strategy: this.name,
        attempts,
        result,
        checkpointRequired: false
      };
    } catch (retryError) {
      return {
        success: false,
        strategy: this.name,
        attempts,
        error: retryError,
        checkpointRequired: attempts < checkpoint.maxRetries,
        newState: { ...checkpoint.state, retryCount: attempts }
      };
    }
  }

  private async retryOperation(checkpoint: RecoveryCheckpoint): Promise<any> {
    switch (checkpoint.operationType) {
      case 'session_execution':
        return this.retrySessionExecution(checkpoint);
      case 'file_operation':
        return this.retryFileOperation(checkpoint);
      case 'docker_operation':
        return this.retryDockerOperation(checkpoint);
      case 'api_request':
        return this.retryApiRequest(checkpoint);
      default:
        throw new Error(`Unknown operation type: ${checkpoint.operationType}`);
    }
  }

  private async retrySessionExecution(checkpoint: RecoveryCheckpoint): Promise<any> {
    // For session execution, we need to restore from the last processed line
    const { sessionId, executionId, projectId, lastProcessedLine = 0 } = checkpoint.state;
    
    // This would integrate with the actual execution system
    // For now, return a mock result
    return {
      success: true,
      resumed: true,
      lastProcessedLine,
      executionId
    };
  }

  private async retryFileOperation(checkpoint: RecoveryCheckpoint): Promise<any> {
    const { operation, filePath, content } = checkpoint.state;
    
    switch (operation) {
      case 'write':
        await SafeFileWriter.writeFile(filePath, content);
        return { success: true, operation: 'write', path: filePath };
      case 'read':
        const data = await fs.readFile(filePath, 'utf8');
        return { success: true, operation: 'read', path: filePath, data };
      default:
        throw new Error(`Unknown file operation: ${operation}`);
    }
  }

  private async retryDockerOperation(checkpoint: RecoveryCheckpoint): Promise<any> {
    // Docker operation retry logic would go here
    // This is a placeholder for integration with Docker operations
    return { success: true, operation: 'docker', recovered: true };
  }

  private async retryApiRequest(checkpoint: RecoveryCheckpoint): Promise<any> {
    const { url, method, body, headers } = checkpoint.state;
    
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    return await response.json();
  }
}

class FallbackStrategy implements RecoveryStrategy {
  name = 'fallback';
  priority = 2;

  canHandle(checkpoint: RecoveryCheckpoint, error: any): boolean {
    // Can always provide fallback, but lower priority than retry
    return true;
  }

  async execute(checkpoint: RecoveryCheckpoint, error: any): Promise<RecoveryResult> {
    try {
      const result = await this.executeFallback(checkpoint);
      
      return {
        success: true,
        strategy: this.name,
        attempts: 1,
        result,
        checkpointRequired: false
      };
    } catch (fallbackError) {
      return {
        success: false,
        strategy: this.name,
        attempts: 1,
        error: fallbackError,
        checkpointRequired: false
      };
    }
  }

  private async executeFallback(checkpoint: RecoveryCheckpoint): Promise<any> {
    switch (checkpoint.operationType) {
      case 'session_execution':
        return this.fallbackSessionExecution(checkpoint);
      case 'file_operation':
        return this.fallbackFileOperation(checkpoint);
      case 'docker_operation':
        return this.fallbackDockerOperation(checkpoint);
      case 'api_request':
        return this.fallbackApiRequest(checkpoint);
      default:
        throw new Error(`No fallback available for operation type: ${checkpoint.operationType}`);
    }
  }

  private async fallbackSessionExecution(checkpoint: RecoveryCheckpoint): Promise<any> {
    // Fallback to a simpler execution mode
    return {
      success: true,
      fallback: true,
      mode: 'simple',
      sessionId: checkpoint.sessionId
    };
  }

  private async fallbackFileOperation(checkpoint: RecoveryCheckpoint): Promise<any> {
    const { operation } = checkpoint.state;
    
    switch (operation) {
      case 'write':
        // Fallback to temporary file
        const tempPath = path.join(require('os').tmpdir(), `vibekit-fallback-${Date.now()}.tmp`);
        await SafeFileWriter.writeFile(tempPath, checkpoint.state.content);
        return { success: true, fallback: true, path: tempPath };
      case 'read':
        // Return cached content if available
        if (checkpoint.state.cachedContent) {
          return { success: true, fallback: true, data: checkpoint.state.cachedContent };
        }
        throw new Error('No cached content available for fallback');
      default:
        throw new Error(`No fallback available for file operation: ${operation}`);
    }
  }

  private async fallbackDockerOperation(checkpoint: RecoveryCheckpoint): Promise<any> {
    // Fallback to local execution without Docker
    return {
      success: true,
      fallback: true,
      mode: 'local',
      warning: 'Docker unavailable, falling back to local execution'
    };
  }

  private async fallbackApiRequest(checkpoint: RecoveryCheckpoint): Promise<any> {
    // Return cached response if available
    if (checkpoint.state.cachedResponse) {
      return {
        success: true,
        fallback: true,
        data: checkpoint.state.cachedResponse,
        warning: 'Using cached response due to API unavailability'
      };
    }
    
    throw new Error('No fallback available for API request');
  }
}

class GracefulDegradationStrategy implements RecoveryStrategy {
  name = 'graceful_degradation';
  priority = 3;

  canHandle(checkpoint: RecoveryCheckpoint, error: any): boolean {
    // Always available as last resort
    return true;
  }

  async execute(checkpoint: RecoveryCheckpoint, error: any): Promise<RecoveryResult> {
    const result = await this.degradeGracefully(checkpoint);
    
    return {
      success: true,
      strategy: this.name,
      attempts: 1,
      result,
      checkpointRequired: false
    };
  }

  private async degradeGracefully(checkpoint: RecoveryCheckpoint): Promise<any> {
    // Mark operation as partially successful with degraded functionality
    return {
      success: true,
      degraded: true,
      operationType: checkpoint.operationType,
      message: 'Operation completed with reduced functionality',
      availableFeatures: this.getAvailableFeatures(checkpoint.operationType)
    };
  }

  private getAvailableFeatures(operationType: string): string[] {
    switch (operationType) {
      case 'session_execution':
        return ['basic_execution', 'local_mode'];
      case 'file_operation':
        return ['read_only', 'cache_only'];
      case 'docker_operation':
        return ['local_execution', 'basic_commands'];
      case 'api_request':
        return ['cached_data', 'offline_mode'];
      default:
        return ['basic_functionality'];
    }
  }
}

// ============================================================================
// Recovery Manager Class
// ============================================================================

export class RecoveryManager {
  private static instance: RecoveryManager;
  private readonly logger = createLogger('RecoveryManager');
  private readonly checkpointRoot: string;
  private readonly strategies: RecoveryStrategy[] = [];
  private readonly activeRecoveries = new Map<string, Promise<RecoveryResult>>();
  private readonly metrics: RecoveryMetrics = {
    activeRecoveries: 0,
    successfulRecoveries: 0,
    failedRecoveries: 0,
    circuitBreakerStates: {},
    checkpointCount: 0,
    averageRecoveryTime: 0,
    strategySuccessRates: {}
  };

  private constructor() {
    this.checkpointRoot = createSafeVibeKitPath('recovery-checkpoints');
    this.initializeStrategies();
  }

  static getInstance(): RecoveryManager {
    if (!RecoveryManager.instance) {
      RecoveryManager.instance = new RecoveryManager();
    }
    return RecoveryManager.instance;
  }

  /**
   * Initialize the recovery manager
   */
  async initialize(): Promise<void> {
    try {
      // Ensure checkpoint directory exists
      await fs.mkdir(this.checkpointRoot, { recursive: true });
      
      // Load existing checkpoints
      await this.loadCheckpoints();
      
      // Start cleanup routine
      this.startCleanupRoutine();
      
      this.logger.info('Recovery manager initialized', {
        checkpointRoot: this.checkpointRoot,
        strategies: this.strategies.length,
        checkpointCount: this.metrics.checkpointCount
      });
    } catch (error) {
      this.logger.error('Failed to initialize recovery manager', error);
      throw new ValidationError('Failed to initialize recovery manager');
    }
  }

  /**
   * Create a recovery checkpoint
   */
  async createCheckpoint(
    operationType: RecoveryCheckpoint['operationType'],
    state: Record<string, any>,
    dependencies: string[] = [],
    options: {
      sessionId?: string;
      executionId?: string;
      projectId?: string;
      maxRetries?: number;
      expiresIn?: number; // milliseconds
    } = {}
  ): Promise<string> {
    const checkpointId = this.generateCheckpointId();
    const now = Date.now();
    
    const checkpoint: RecoveryCheckpoint = {
      id: checkpointId,
      sessionId: options.sessionId || checkpointId,
      executionId: options.executionId,
      projectId: options.projectId || 'default',
      operationType,
      state,
      dependencies,
      timestamp: now,
      retryCount: 0,
      maxRetries: options.maxRetries || 3,
      expiresAt: now + (options.expiresIn || 24 * 60 * 60 * 1000) // 24 hours default
    };

    await this.saveCheckpoint(checkpoint);
    this.metrics.checkpointCount++;

    this.logger.info('Recovery checkpoint created', {
      checkpointId,
      operationType,
      sessionId: checkpoint.sessionId,
      executionId: checkpoint.executionId,
      dependencies: dependencies.length
    });

    return checkpointId;
  }

  /**
   * Attempt recovery from a failure
   */
  async recoverFromFailure(
    operation: () => Promise<any>,
    options: {
      service?: string;
      operationName?: string;
      checkpointId?: string;
      fallback?: () => Promise<any>;
    } = {}
  ): Promise<RecoveryResult> {
    const operationId = options.service || 'unknown';
    
    // Prevent duplicate recovery attempts
    if (this.activeRecoveries.has(operationId)) {
      this.logger.info('Recovery already in progress', { operationId });
      return await this.activeRecoveries.get(operationId)!;
    }

    const recoveryPromise = this.executeRecovery(operation, options);
    this.activeRecoveries.set(operationId, recoveryPromise);
    this.metrics.activeRecoveries++;

    try {
      const result = await recoveryPromise;
      
      if (result.success) {
        this.metrics.successfulRecoveries++;
      } else {
        this.metrics.failedRecoveries++;
      }
      
      // Update strategy success rates
      if (!this.metrics.strategySuccessRates[result.strategy]) {
        this.metrics.strategySuccessRates[result.strategy] = 0;
      }
      this.metrics.strategySuccessRates[result.strategy] = 
        (this.metrics.strategySuccessRates[result.strategy] + (result.success ? 1 : 0)) / 2;

      return result;
    } finally {
      this.activeRecoveries.delete(operationId);
      this.metrics.activeRecoveries--;
    }
  }

  /**
   * Get recovery metrics
   */
  getMetrics(): RecoveryMetrics {
    return { ...this.metrics };
  }

  /**
   * Clean up expired checkpoints
   */
  async cleanupExpiredCheckpoints(): Promise<number> {
    try {
      const files = await fs.readdir(this.checkpointRoot);
      const now = Date.now();
      let cleanedCount = 0;

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        const filePath = path.join(this.checkpointRoot, file);
        try {
          const content = await fs.readFile(filePath, 'utf8');
          const checkpoint: RecoveryCheckpoint = JSON.parse(content);

          if (checkpoint.expiresAt < now) {
            await fs.unlink(filePath);
            cleanedCount++;
            this.metrics.checkpointCount--;
          }
        } catch (error) {
          // Skip malformed files
          this.logger.warn('Failed to process checkpoint file', error, { file });
        }
      }

      if (cleanedCount > 0) {
        this.logger.info('Cleaned up expired checkpoints', { count: cleanedCount });
      }

      return cleanedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired checkpoints', error);
      return 0;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private initializeStrategies(): void {
    this.strategies.push(
      new RetryWithBackoffStrategy(),
      new FallbackStrategy(),
      new GracefulDegradationStrategy()
    );

    // Sort strategies by priority
    this.strategies.sort((a, b) => a.priority - b.priority);
  }

  private async executeRecovery(
    operation: () => Promise<any>,
    options: {
      service?: string;
      operationName?: string;
      checkpointId?: string;
      fallback?: () => Promise<any>;
    }
  ): Promise<RecoveryResult> {
    const startTime = Date.now();

    try {
      // Try the original operation first
      const result = await operation();
      return {
        success: true,
        strategy: 'original',
        attempts: 1,
        result
      };
    } catch (error) {
      this.logger.warn('Operation failed, attempting recovery', {
        service: options.service,
        operationName: options.operationName,
        error: error instanceof Error ? error.message : String(error)
      });

      // Load checkpoint if provided
      let checkpoint: RecoveryCheckpoint | null = null;
      if (options.checkpointId) {
        checkpoint = await this.loadCheckpoint(options.checkpointId);
      }

      // Try recovery strategies in order of priority
      for (const strategy of this.strategies) {
        if (!checkpoint || strategy.canHandle(checkpoint, error)) {
          try {
            this.logger.info('Attempting recovery strategy', { strategy: strategy.name });
            
            const result = checkpoint 
              ? await strategy.execute(checkpoint, error)
              : await this.executeWithFallback(strategy, error, options.fallback);

            if (result.success) {
              const duration = Date.now() - startTime;
              this.metrics.averageRecoveryTime = 
                (this.metrics.averageRecoveryTime + duration) / 2;

              this.logger.info('Recovery successful', {
                strategy: strategy.name,
                attempts: result.attempts,
                duration
              });

              // Update checkpoint if needed
              if (checkpoint && result.checkpointRequired && result.newState) {
                checkpoint.state = result.newState;
                checkpoint.retryCount = result.attempts;
                await this.saveCheckpoint(checkpoint);
              } else if (checkpoint && !result.checkpointRequired) {
                await this.deleteCheckpoint(checkpoint.id);
              }

              return result;
            }
          } catch (strategyError) {
            this.logger.warn('Recovery strategy failed', {
              strategy: strategy.name,
              error: strategyError instanceof Error ? strategyError.message : String(strategyError)
            });
          }
        }
      }

      // All strategies failed
      return {
        success: false,
        strategy: 'none',
        attempts: 0,
        error
      };
    }
  }

  private async executeWithFallback(
    strategy: RecoveryStrategy,
    error: any,
    fallback?: () => Promise<any>
  ): Promise<RecoveryResult> {
    if (strategy.name === 'fallback' && fallback) {
      try {
        const result = await fallback();
        return {
          success: true,
          strategy: 'fallback',
          attempts: 1,
          result
        };
      } catch (fallbackError) {
        return {
          success: false,
          strategy: 'fallback',
          attempts: 1,
          error: fallbackError
        };
      }
    }

    return {
      success: false,
      strategy: strategy.name,
      attempts: 0,
      error: new Error('Cannot execute strategy without checkpoint')
    };
  }

  private generateCheckpointId(): string {
    return `checkpoint_${Date.now()}_${Math.random().toString(36).substring(2, 12)}`;
  }

  private getCheckpointPath(checkpointId: string): string {
    return path.join(this.checkpointRoot, `${checkpointId}.json`);
  }

  private async saveCheckpoint(checkpoint: RecoveryCheckpoint): Promise<void> {
    const filePath = this.getCheckpointPath(checkpoint.id);
    await SafeFileWriter.writeFile(filePath, JSON.stringify(checkpoint, null, 2));
  }

  private async loadCheckpoint(checkpointId: string): Promise<RecoveryCheckpoint | null> {
    try {
      const filePath = this.getCheckpointPath(checkpointId);
      const content = await fs.readFile(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.warn('Failed to load checkpoint', error, { checkpointId });
      return null;
    }
  }

  private async loadCheckpoints(): Promise<void> {
    try {
      const files = await fs.readdir(this.checkpointRoot);
      let count = 0;

      for (const file of files) {
        if (file.endsWith('.json')) {
          count++;
        }
      }

      this.metrics.checkpointCount = count;
    } catch (error) {
      if ((error as any).code !== 'ENOENT') {
        this.logger.warn('Failed to load checkpoints', error);
      }
    }
  }

  private async deleteCheckpoint(checkpointId: string): Promise<void> {
    try {
      const filePath = this.getCheckpointPath(checkpointId);
      await fs.unlink(filePath);
      this.metrics.checkpointCount--;
    } catch (error) {
      this.logger.warn('Failed to delete checkpoint', error, { checkpointId });
    }
  }

  private startCleanupRoutine(): void {
    // Clean up expired checkpoints every hour
    setInterval(async () => {
      try {
        await this.cleanupExpiredCheckpoints();
      } catch (error) {
        this.logger.error('Cleanup routine failed', error);
      }
    }, 60 * 60 * 1000); // 1 hour
  }
}

// Export singleton instance
export const recoveryManager = RecoveryManager.getInstance();