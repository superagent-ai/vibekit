/**
 * Execution History Manager
 * 
 * Comprehensive tracking system for agent executions with daily JSONL storage,
 * smart caching, and advanced querying capabilities.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { SafeFileWriter } from './safe-file-writer';
import { createSafeVibeKitPath, ValidationError } from './security-utils';
import { createLogger } from './structured-logger';

// ============================================================================
// Type Definitions
// ============================================================================

export interface ExecutionRecord {
  // Core identification
  executionId: string;          // Short UUID (12 chars)
  sessionId: string;            // Associated session ID
  projectId: string;            // Project identifier
  timestamp: number;            // Execution start time

  // Environment details
  agent: string;                // Agent type (claude, gemini, etc.)
  sandbox: string;              // Sandbox provider (dagger, e2b, etc.)
  branch: string;               // Git branch
  projectRoot: string;          // Project directory

  // Task information
  task: {
    id: number;
    title: string;
  };
  subtask: {
    id: number;
    title: string;
    description: string;
    details?: string;
    testStrategy?: string;
  };

  // Execution details
  prompt: string;               // AI prompt sent to agent
  status: 'started' | 'running' | 'completed' | 'failed' | 'abandoned';
  startTime: number;            // Execution start timestamp
  endTime?: number;             // Execution end timestamp
  duration?: number;            // Total duration in milliseconds
  exitCode?: number;            // Process exit code
  success?: boolean;            // Execution success flag

  // Output and updates
  stdout?: string;              // Standard output
  stderr?: string;              // Standard error
  updates?: string[];           // Real-time updates during execution

  // GitHub integration
  pullRequest?: {
    url: string;
    number: number;
    created: boolean;
  };
  github?: {
    repository?: string;
    hasToken: boolean;
    branch: string;
  };

  // Error information
  error?: string;               // Error message if failed
  errorDetails?: any;           // Structured error information

  // Analytics and metadata
  analyticsSessionId?: string;  // Associated analytics session
  metadata?: Record<string, any>; // Additional metadata
}

export interface ExecutionSummary {
  executionId: string;
  sessionId: string;
  projectId: string;
  timestamp: number;
  agent: string;
  sandbox: string;
  status: ExecutionRecord['status'];
  duration?: number;
  success?: boolean;
  taskTitle: string;
  subtaskTitle: string;
  pullRequestCreated?: boolean;
}

export interface ExecutionQuery {
  projectId?: string;
  agent?: string;
  sandbox?: string;
  status?: ExecutionRecord['status'];
  success?: boolean;
  dateFrom?: number;
  dateTo?: number;
  limit?: number;
  offset?: number;
}

export interface ExecutionStatistics {
  total: number;
  byStatus: Record<string, number>;
  byAgent: Record<string, number>;
  bySandbox: Record<string, number>;
  successRate: number;
  averageDuration: number;
  totalDuration: number;
  pullRequestsCreated: number;
  lastExecution?: number;
  activeExecutions: number;
}

// ============================================================================
// Main ExecutionHistoryManager Class
// ============================================================================

export class ExecutionHistoryManager {
  private static instance: ExecutionHistoryManager;
  private readonly logger = createLogger('ExecutionHistoryManager');
  private readonly historyRoot: string;
  private readonly cacheFile: string;
  private cache: Map<string, ExecutionSummary[]> = new Map();
  private cacheTimestamp = 0;
  private readonly cacheTtl = 30000; // 30 seconds

  private constructor() {
    this.historyRoot = createSafeVibeKitPath('execution-history');
    this.cacheFile = path.join(this.historyRoot, 'index.json');
  }

  static getInstance(): ExecutionHistoryManager {
    if (!ExecutionHistoryManager.instance) {
      ExecutionHistoryManager.instance = new ExecutionHistoryManager();
    }
    return ExecutionHistoryManager.instance;
  }

  /**
   * Initialize the execution history system
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.mkdir(this.historyRoot, { recursive: true });
      
      // Load cache if it exists
      await this.loadCache();
      
      this.logger.info('Execution history manager initialized', {
        historyRoot: this.historyRoot,
        cacheSize: this.cache.size
      });
    } catch (error) {
      this.logger.error('Failed to initialize execution history manager', error);
      throw new ValidationError('Failed to initialize execution history manager');
    }
  }

  /**
   * Start tracking a new execution
   */
  async startExecution(params: {
    sessionId: string;
    projectId: string;
    agent: string;
    sandbox: string;
    branch: string;
    projectRoot: string;
    task: { id: number; title: string };
    subtask: {
      id: number;
      title: string;
      description: string;
      details?: string;
      testStrategy?: string;
    };
    prompt: string;
    github?: {
      repository?: string;
      hasToken: boolean;
      branch: string;
    };
  }): Promise<string> {
    const executionId = this.generateExecutionId();
    const now = Date.now();

    const record: ExecutionRecord = {
      executionId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      timestamp: now,
      agent: params.agent,
      sandbox: params.sandbox,
      branch: params.branch,
      projectRoot: params.projectRoot,
      task: params.task,
      subtask: params.subtask,
      prompt: params.prompt,
      status: 'started',
      startTime: now,
      github: params.github
    };

    await this.writeExecution(record);
    await this.invalidateCache();

    this.logger.info('Execution started', {
      executionId,
      sessionId: params.sessionId,
      projectId: params.projectId,
      agent: params.agent,
      taskTitle: params.task.title
    });

    return executionId;
  }

  /**
   * Update an existing execution
   */
  async updateExecution(executionId: string, updates: Partial<ExecutionRecord>): Promise<void> {
    try {
      // Find the execution in daily files
      const execution = await this.findExecution(executionId);
      if (!execution) {
        throw new Error(`Execution ${executionId} not found`);
      }

      // Apply updates
      const updatedExecution = { ...execution, ...updates };
      
      // Calculate duration if endTime is provided
      if (updates.endTime && !updates.duration) {
        updatedExecution.duration = updates.endTime - execution.startTime;
      }

      // Update success flag based on exit code
      if (updates.exitCode !== undefined) {
        updatedExecution.success = updates.exitCode === 0;
      }

      await this.writeExecution(updatedExecution);
      await this.invalidateCache();

      this.logger.info('Execution updated', {
        executionId,
        status: updates.status,
        duration: updatedExecution.duration,
        success: updatedExecution.success
      });
    } catch (error) {
      this.logger.error('Failed to update execution', error, { executionId });
      throw error;
    }
  }

  /**
   * Query executions with filtering
   */
  async queryExecutions(query: ExecutionQuery = {}): Promise<{
    executions: ExecutionSummary[];
    count: number;
    query: ExecutionQuery;
  }> {
    try {
      const cacheKey = JSON.stringify(query);
      
      // Check cache first
      if (this.isCacheValid() && this.cache.has(cacheKey)) {
        const cached = this.cache.get(cacheKey)!;
        return {
          executions: this.paginateResults(cached, query.offset, query.limit),
          count: cached.length,
          query
        };
      }

      // Load executions from files
      const executions = await this.loadExecutions(query);
      
      // Cache results
      this.cache.set(cacheKey, executions);
      this.cacheTimestamp = Date.now();

      return {
        executions: this.paginateResults(executions, query.offset, query.limit),
        count: executions.length,
        query
      };
    } catch (error) {
      this.logger.error('Failed to query executions', error, { query });
      throw error;
    }
  }

  /**
   * Get detailed execution record
   */
  async getExecution(executionId: string): Promise<ExecutionRecord | null> {
    try {
      return await this.findExecution(executionId);
    } catch (error) {
      this.logger.error('Failed to get execution', error, { executionId });
      return null;
    }
  }

  /**
   * Generate execution statistics
   */
  async getStatistics(projectId?: string): Promise<ExecutionStatistics> {
    try {
      const query: ExecutionQuery = projectId ? { projectId } : {};
      const { executions } = await this.queryExecutions({ ...query, limit: 10000 });

      const stats: ExecutionStatistics = {
        total: executions.length,
        byStatus: {},
        byAgent: {},
        bySandbox: {},
        successRate: 0,
        averageDuration: 0,
        totalDuration: 0,
        pullRequestsCreated: 0,
        activeExecutions: 0
      };

      // Calculate statistics
      let totalDuration = 0;
      let successCount = 0;

      for (const execution of executions) {
        // Status breakdown
        stats.byStatus[execution.status] = (stats.byStatus[execution.status] || 0) + 1;
        
        // Agent breakdown
        stats.byAgent[execution.agent] = (stats.byAgent[execution.agent] || 0) + 1;
        
        // Sandbox breakdown
        stats.bySandbox[execution.sandbox] = (stats.bySandbox[execution.sandbox] || 0) + 1;
        
        // Duration calculation
        if (execution.duration) {
          totalDuration += execution.duration;
        }
        
        // Success counting
        if (execution.success) {
          successCount++;
        }
        
        // PR counting
        if (execution.pullRequestCreated) {
          stats.pullRequestsCreated++;
        }
        
        // Active executions
        if (execution.status === 'running' || execution.status === 'started') {
          stats.activeExecutions++;
        }
        
        // Track latest execution
        if (!stats.lastExecution || execution.timestamp > stats.lastExecution) {
          stats.lastExecution = execution.timestamp;
        }
      }

      stats.totalDuration = totalDuration;
      stats.averageDuration = executions.length > 0 ? totalDuration / executions.length : 0;
      stats.successRate = executions.length > 0 ? (successCount / executions.length) * 100 : 0;

      return stats;
    } catch (error) {
      this.logger.error('Failed to generate statistics', error, { projectId });
      throw error;
    }
  }

  /**
   * Export executions in various formats
   */
  async exportExecutions(query: ExecutionQuery = {}, format: 'json' | 'csv' | 'jsonl' = 'json'): Promise<string> {
    try {
      const { executions } = await this.queryExecutions({ ...query, limit: 10000 });

      switch (format) {
        case 'json':
          return JSON.stringify(executions, null, 2);
        
        case 'csv':
          return this.convertToCsv(executions);
        
        case 'jsonl':
          return executions.map(exec => JSON.stringify(exec)).join('\n');
        
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    } catch (error) {
      this.logger.error('Failed to export executions', error, { query, format });
      throw error;
    }
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private generateExecutionId(): string {
    // Generate a short, unique execution ID (12 characters)
    return Math.random().toString(36).substring(2, 14);
  }

  private getDailyFileName(timestamp: number): string {
    const date = new Date(timestamp);
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    return `${dateStr}.jsonl`;
  }

  private async writeExecution(record: ExecutionRecord): Promise<void> {
    const fileName = this.getDailyFileName(record.timestamp);
    const filePath = path.join(this.historyRoot, fileName);
    const line = JSON.stringify(record) + '\n';
    
    await SafeFileWriter.appendFile(filePath, line);
  }

  private async findExecution(executionId: string): Promise<ExecutionRecord | null> {
    // Search through recent daily files (last 30 days)
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    try {
      const files = await fs.readdir(this.historyRoot);
      const jsonlFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .reverse(); // Search newest files first

      for (const fileName of jsonlFiles) {
        const filePath = path.join(this.historyRoot, fileName);
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const record: ExecutionRecord = JSON.parse(line);
            if (record.executionId === executionId) {
              return record;
            }
          } catch (parseError) {
            // Skip malformed lines
            continue;
          }
        }
      }
    } catch (error) {
      this.logger.error('Error searching for execution', error, { executionId });
    }

    return null;
  }

  private async loadExecutions(query: ExecutionQuery): Promise<ExecutionSummary[]> {
    const executions: ExecutionSummary[] = [];
    const files = await fs.readdir(this.historyRoot);
    const jsonlFiles = files
      .filter(f => f.endsWith('.jsonl'))
      .sort()
      .reverse(); // Newest first

    for (const fileName of jsonlFiles) {
      const filePath = path.join(this.historyRoot, fileName);
      
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const record: ExecutionRecord = JSON.parse(line);
            
            // Apply filters
            if (!this.matchesQuery(record, query)) {
              continue;
            }

            // Convert to summary
            const summary: ExecutionSummary = {
              executionId: record.executionId,
              sessionId: record.sessionId,
              projectId: record.projectId,
              timestamp: record.timestamp,
              agent: record.agent,
              sandbox: record.sandbox,
              status: record.status,
              duration: record.duration,
              success: record.success,
              taskTitle: record.task.title,
              subtaskTitle: record.subtask.title,
              pullRequestCreated: record.pullRequest?.created
            };

            executions.push(summary);
          } catch (parseError) {
            // Skip malformed lines
            continue;
          }
        }
      } catch (fileError) {
        this.logger.warn('Failed to read execution file', fileError, { fileName });
        continue;
      }
    }

    return executions.sort((a, b) => b.timestamp - a.timestamp);
  }

  private matchesQuery(record: ExecutionRecord, query: ExecutionQuery): boolean {
    if (query.projectId && record.projectId !== query.projectId) return false;
    if (query.agent && record.agent !== query.agent) return false;
    if (query.sandbox && record.sandbox !== query.sandbox) return false;
    if (query.status && record.status !== query.status) return false;
    if (query.success !== undefined && record.success !== query.success) return false;
    if (query.dateFrom && record.timestamp < query.dateFrom) return false;
    if (query.dateTo && record.timestamp > query.dateTo) return false;

    return true;
  }

  private paginateResults<T>(results: T[], offset = 0, limit = 100): T[] {
    return results.slice(offset, offset + limit);
  }

  private convertToCsv(executions: ExecutionSummary[]): string {
    if (executions.length === 0) return '';

    const headers = [
      'executionId', 'sessionId', 'projectId', 'timestamp', 'agent', 
      'sandbox', 'status', 'duration', 'success', 'taskTitle', 'subtaskTitle'
    ];

    const csvRows = [headers.join(',')];
    
    for (const execution of executions) {
      const row = headers.map(header => {
        const value = execution[header as keyof ExecutionSummary];
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value?.toString() || '';
      });
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }

  private async loadCache(): Promise<void> {
    try {
      const content = await fs.readFile(this.cacheFile, 'utf8');
      const cacheData = JSON.parse(content);
      
      if (cacheData.timestamp && Date.now() - cacheData.timestamp < this.cacheTtl) {
        this.cache = new Map(cacheData.entries);
        this.cacheTimestamp = cacheData.timestamp;
      }
    } catch (error) {
      // Cache file doesn't exist or is invalid, start fresh
      this.cache.clear();
      this.cacheTimestamp = 0;
    }
  }

  private async invalidateCache(): Promise<void> {
    this.cache.clear();
    this.cacheTimestamp = 0;
    
    try {
      await fs.unlink(this.cacheFile);
    } catch (error) {
      // Cache file might not exist
    }
  }

  private isCacheValid(): boolean {
    return Date.now() - this.cacheTimestamp < this.cacheTtl;
  }
}

// Export singleton instance
export const executionHistoryManager = ExecutionHistoryManager.getInstance();