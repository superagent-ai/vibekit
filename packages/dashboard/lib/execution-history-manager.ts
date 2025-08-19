import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { createLogger } from './structured-logger';
import { SafeFileWriter } from './safe-file-writer';
import { createSafeVibeKitPath, validateSessionId } from './security-utils';

const logger = createLogger('ExecutionHistoryManager');

export interface ExecutionRecord {
  id: string;
  sessionId: string;
  projectId?: string;
  projectRoot?: string;
  taskId?: string;
  subtaskId?: string;
  agent: string;
  sandbox: string;
  status: 'started' | 'running' | 'completed' | 'failed' | 'abandoned';
  timestamp: number;
  startTime: number;
  endTime?: number;
  duration?: number;
  success?: boolean;
  exitCode?: number;
  prompt?: string;
  promptLength?: number;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  error?: string;
  stdoutLines?: number;
  stderrLines?: number;
  updateCount?: number;
}

export interface ExecutionStatistics {
  total: number;
  completed: number;
  failed: number;
  running: number;
  successRate: number;
  averageDuration: number;
  pullRequestsCreated: number;
  byAgent: Record<string, number>;
  bySandbox: Record<string, number>;
  byStatus: Record<string, number>;
  lastExecution?: number;
}

export interface SystemHealth {
  isHealthy: boolean;
  totalExecutions: number;
  activeExecutions: number;
  failedExecutions: number;
  lastExecution?: number;
  lastError?: string;
  databaseSize: number;
  averageResponseTime: number;
}

export interface QueryOptions {
  projectId?: string;
  sessionId?: string;
  agent?: string;
  sandbox?: string;
  status?: ExecutionRecord['status'];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

/**
 * ExecutionHistoryManager manages execution records and provides analytics
 * 
 * Features:
 * - Persistent storage of execution records
 * - Query and analytics capabilities
 * - Health monitoring
 * - Resource limits and cleanup
 */
export class ExecutionHistoryManager {
  private static readonly EXECUTION_HISTORY_DIR = createSafeVibeKitPath('', 'execution-history');
  private static readonly MAX_RECORDS_PER_FILE = 1000;
  private static readonly MAX_TOTAL_RECORDS = 50000;
  private static readonly CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  
  private static isInitialized = false;
  private static cleanupTimer?: NodeJS.Timeout;
  
  /**
   * Initialize the execution history manager
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    try {
      // Ensure directory exists
      await fs.mkdir(this.EXECUTION_HISTORY_DIR, { recursive: true });
      
      // Start cleanup timer
      if (!this.cleanupTimer) {
        this.cleanupTimer = setInterval(() => {
          this.cleanup().catch(error => {
            logger.logError('Cleanup failed', error as Error);
          });
        }, this.CLEANUP_INTERVAL);
      }
      
      this.isInitialized = true;
      logger.info('ExecutionHistoryManager initialized');
      
    } catch (error) {
      logger.logError('Failed to initialize ExecutionHistoryManager', error as Error);
      throw error;
    }
  }
  
  /**
   * Record the start of an execution
   */
  static async recordExecutionStart(data: {
    sessionId: string;
    projectId?: string;
    projectRoot?: string;
    taskId?: string;
    subtaskId?: string;
    agent: string;
    sandbox: string;
    prompt?: string;
  }): Promise<string> {
    await this.initialize();
    
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const record: ExecutionRecord = {
      id: executionId,
      sessionId: data.sessionId,
      projectId: data.projectId,
      projectRoot: data.projectRoot,
      taskId: data.taskId,
      subtaskId: data.subtaskId,
      agent: data.agent,
      sandbox: data.sandbox,
      status: 'started',
      timestamp: Date.now(),
      startTime: Date.now(),
      promptLength: data.prompt?.length,
      stdoutLines: 0,
      stderrLines: 0,
      updateCount: 0
    };
    
    await this.writeRecord(record);
    logger.debug('Recorded execution start', { executionId, sessionId: data.sessionId });
    
    return executionId;
  }
  
  /**
   * Update an execution record
   */
  static async updateExecution(executionId: string, updates: Partial<ExecutionRecord>): Promise<void> {
    await this.initialize();
    
    try {
      const record = await this.getExecution(executionId);
      if (!record) {
        logger.warn('Execution not found for update', { executionId });
        return;
      }
      
      const updatedRecord = { ...record, ...updates };
      
      // Calculate duration if endTime is provided
      if (updates.endTime && !updates.duration) {
        updatedRecord.duration = updates.endTime - record.startTime;
      }
      
      // Update success flag based on status/exitCode
      if (updates.status === 'completed' && updates.exitCode !== undefined) {
        updatedRecord.success = updates.exitCode === 0;
      } else if (updates.status === 'failed') {
        updatedRecord.success = false;
      }
      
      updatedRecord.timestamp = Date.now(); // Update last modified time
      
      await this.writeRecord(updatedRecord);
      logger.debug('Updated execution record', { executionId, updates });
      
    } catch (error) {
      logger.logError('Failed to update execution', error as Error, { executionId });
    }
  }
  
  /**
   * Get a specific execution record
   */
  static async getExecution(executionId: string): Promise<ExecutionRecord | null> {
    await this.initialize();
    
    try {
      const files = await fs.readdir(this.EXECUTION_HISTORY_DIR);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort().reverse(); // Start with most recent
      
      for (const file of jsonlFiles) {
        try {
          const filePath = path.join(this.EXECUTION_HISTORY_DIR, file);
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            const record = JSON.parse(line) as ExecutionRecord;
            if (record.id === executionId) {
              return record;
            }
          }
        } catch (error) {
          logger.warn('Failed to read execution file', { file, error });
        }
      }
      
      return null;
      
    } catch (error) {
      logger.logError('Failed to get execution', error as Error, { executionId });
      return null;
    }
  }
  
  /**
   * Query execution records
   */
  static async queryExecutions(options: QueryOptions = {}): Promise<ExecutionRecord[]> {
    await this.initialize();
    
    try {
      const files = await fs.readdir(this.EXECUTION_HISTORY_DIR);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort().reverse(); // Most recent first
      
      const results: ExecutionRecord[] = [];
      const limit = options.limit || 100;
      let count = 0;
      let skip = options.offset || 0;
      
      for (const file of jsonlFiles) {
        if (count >= limit) break;
        
        try {
          const filePath = path.join(this.EXECUTION_HISTORY_DIR, file);
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());
          
          // Process lines in reverse order (most recent first)
          for (let i = lines.length - 1; i >= 0; i--) {
            if (count >= limit) break;
            
            const record = JSON.parse(lines[i]) as ExecutionRecord;
            
            // Apply filters
            if (options.projectId && record.projectId !== options.projectId) continue;
            if (options.sessionId && record.sessionId !== options.sessionId) continue;
            if (options.agent && record.agent !== options.agent) continue;
            if (options.sandbox && record.sandbox !== options.sandbox) continue;
            if (options.status && record.status !== options.status) continue;
            if (options.dateFrom && record.timestamp < options.dateFrom.getTime()) continue;
            if (options.dateTo && record.timestamp > options.dateTo.getTime()) continue;
            
            if (skip > 0) {
              skip--;
              continue;
            }
            
            results.push(record);
            count++;
          }
        } catch (error) {
          logger.warn('Failed to read execution file for query', { file, error });
        }
      }
      
      return results;
      
    } catch (error) {
      logger.logError('Failed to query executions', error as Error, { options });
      return [];
    }
  }
  
  /**
   * Get execution statistics
   */
  static async getStatistics(projectId?: string): Promise<ExecutionStatistics> {
    await this.initialize();
    
    try {
      const executions = await this.queryExecutions({ 
        projectId, 
        limit: 10000 // Get more records for accurate statistics
      });
      
      const stats: ExecutionStatistics = {
        total: executions.length,
        completed: 0,
        failed: 0,
        running: 0,
        successRate: 0,
        averageDuration: 0,
        pullRequestsCreated: 0,
        byAgent: {},
        bySandbox: {},
        byStatus: {},
        lastExecution: 0
      };
      
      let totalDuration = 0;
      let durationCount = 0;
      
      for (const execution of executions) {
        // Count by status
        stats.byStatus[execution.status] = (stats.byStatus[execution.status] || 0) + 1;
        
        if (execution.status === 'completed') stats.completed++;
        if (execution.status === 'failed') stats.failed++;
        if (execution.status === 'running' || execution.status === 'started') stats.running++;
        
        // Count by agent
        stats.byAgent[execution.agent] = (stats.byAgent[execution.agent] || 0) + 1;
        
        // Count by sandbox
        stats.bySandbox[execution.sandbox] = (stats.bySandbox[execution.sandbox] || 0) + 1;
        
        // Calculate duration
        if (execution.duration) {
          totalDuration += execution.duration;
          durationCount++;
        }
        
        // Count pull requests
        if (execution.pullRequestUrl) {
          stats.pullRequestsCreated++;
        }
        
        // Track latest execution
        if (execution.timestamp > stats.lastExecution) {
          stats.lastExecution = execution.timestamp;
        }
      }
      
      // Calculate averages
      stats.successRate = stats.total > 0 ? (stats.completed / (stats.completed + stats.failed)) * 100 : 0;
      stats.averageDuration = durationCount > 0 ? totalDuration / durationCount : 0;
      
      return stats;
      
    } catch (error) {
      logger.logError('Failed to get statistics', error as Error, { projectId });
      return {
        total: 0,
        completed: 0,
        failed: 0,
        running: 0,
        successRate: 0,
        averageDuration: 0,
        pullRequestsCreated: 0,
        byAgent: {},
        bySandbox: {},
        byStatus: {}
      };
    }
  }
  
  /**
   * Get system health information
   */
  static async getSystemHealth(): Promise<SystemHealth> {
    await this.initialize();
    
    try {
      const stats = await this.getStatistics();
      const startTime = Date.now();
      
      // Test database performance
      const testQuery = await this.queryExecutions({ limit: 10 });
      const responseTime = Date.now() - startTime;
      
      // Calculate database size
      const databaseSize = await this.getDatabaseSize();
      
      const health: SystemHealth = {
        isHealthy: true,
        totalExecutions: stats.total,
        activeExecutions: stats.running,
        failedExecutions: stats.failed,
        lastExecution: stats.lastExecution,
        databaseSize,
        averageResponseTime: responseTime
      };
      
      // Health checks
      if (stats.successRate < 50) health.isHealthy = false;
      if (responseTime > 5000) health.isHealthy = false; // 5 second threshold
      if (stats.running > 20) health.isHealthy = false; // Too many concurrent executions
      
      return health;
      
    } catch (error) {
      logger.logError('Failed to get system health', error as Error);
      return {
        isHealthy: false,
        totalExecutions: 0,
        activeExecutions: 0,
        failedExecutions: 0,
        databaseSize: 0,
        averageResponseTime: 0,
        lastError: error instanceof Error ? error.message : String(error)
      };
    }
  }
  
  /**
   * Write a record to disk
   */
  private static async writeRecord(record: ExecutionRecord): Promise<void> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `executions-${today}.jsonl`;
    const filePath = path.join(this.EXECUTION_HISTORY_DIR, filename);
    
    const recordLine = JSON.stringify(record) + '\n';
    await SafeFileWriter.appendFile(filePath, recordLine);
  }
  
  /**
   * Calculate database size
   */
  private static async getDatabaseSize(): Promise<number> {
    try {
      const files = await fs.readdir(this.EXECUTION_HISTORY_DIR);
      let totalSize = 0;
      
      for (const file of files) {
        try {
          const filePath = path.join(this.EXECUTION_HISTORY_DIR, file);
          const stats = await fs.stat(filePath);
          totalSize += stats.size;
        } catch (error) {
          // Skip files that can't be accessed
        }
      }
      
      return totalSize;
      
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * Cleanup old records to manage disk space
   */
  private static async cleanup(): Promise<void> {
    try {
      const files = await fs.readdir(this.EXECUTION_HISTORY_DIR);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort();
      
      // Remove files older than 90 days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
      const cutoffString = cutoffDate.toISOString().split('T')[0];
      
      for (const file of jsonlFiles) {
        if (file.includes('-') && file.split('-')[1] < cutoffString) {
          try {
            const filePath = path.join(this.EXECUTION_HISTORY_DIR, file);
            await fs.unlink(filePath);
            logger.info('Cleaned up old execution file', { file });
          } catch (error) {
            logger.warn('Failed to cleanup file', { file, error });
          }
        }
      }
      
      // Check total record count and cleanup if needed
      const totalRecords = await this.getTotalRecordCount();
      if (totalRecords > this.MAX_TOTAL_RECORDS) {
        await this.cleanupOldestRecords(totalRecords - this.MAX_TOTAL_RECORDS);
      }
      
    } catch (error) {
      logger.logError('Cleanup operation failed', error as Error);
    }
  }
  
  /**
   * Get total record count across all files
   */
  private static async getTotalRecordCount(): Promise<number> {
    try {
      const files = await fs.readdir(this.EXECUTION_HISTORY_DIR);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl'));
      
      let totalCount = 0;
      
      for (const file of jsonlFiles) {
        try {
          const filePath = path.join(this.EXECUTION_HISTORY_DIR, file);
          const content = await fs.readFile(filePath, 'utf8');
          const lines = content.split('\n').filter(line => line.trim());
          totalCount += lines.length;
        } catch (error) {
          // Skip files that can't be read
        }
      }
      
      return totalCount;
      
    } catch (error) {
      return 0;
    }
  }
  
  /**
   * Remove oldest records to stay within limits
   */
  private static async cleanupOldestRecords(recordsToRemove: number): Promise<void> {
    try {
      const files = await fs.readdir(this.EXECUTION_HISTORY_DIR);
      const jsonlFiles = files.filter(f => f.endsWith('.jsonl')).sort(); // Oldest first
      
      let removedCount = 0;
      
      for (const file of jsonlFiles) {
        if (removedCount >= recordsToRemove) break;
        
        const filePath = path.join(this.EXECUTION_HISTORY_DIR, file);
        try {
          await fs.unlink(filePath);
          
          // Estimate removed records (assume average file size)
          const stats = await fs.stat(filePath).catch(() => null);
          const estimatedRecords = stats ? Math.floor(stats.size / 500) : 100; // Rough estimate
          removedCount += estimatedRecords;
          
          logger.info('Removed old execution file for cleanup', { file, estimatedRecords });
          
        } catch (error) {
          // File might not exist anymore
        }
      }
      
    } catch (error) {
      logger.logError('Failed to cleanup oldest records', error as Error);
    }
  }
  
  /**
   * Shutdown the execution history manager
   */
  static async shutdown(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    this.isInitialized = false;
    logger.info('ExecutionHistoryManager shutdown');
  }
}