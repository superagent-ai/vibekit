import { EventEmitter } from 'events';
import { JSONLEventStore } from '../storage/jsonl-event-store';
import { Task } from '../types/task';

export interface TaskProgress {
  taskId: string;
  sessionId: string;
  currentStep: number;
  totalSteps: number;
  percentComplete: number;
  stepDescription: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'paused';
  logs: string[];
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
  artifacts: {
    files: string[];
    commits: string[];
    pullRequests?: number[];
  };
}

export interface ProgressUpdateOptions {
  step?: number;
  description?: string;
  status?: TaskProgress['status'];
  logEntry?: string;
  artifacts?: Partial<TaskProgress['artifacts']>;
  error?: string;
}

export class TaskProgressManager extends EventEmitter {
  private eventStore = new JSONLEventStore();
  private progressCache = new Map<string, TaskProgress>();

  constructor() {
    super();
  }

  async initializeTask(sessionId: string, taskId: string, task: Task, totalSteps: number = 6): Promise<TaskProgress> {
    const progress: TaskProgress = {
      taskId,
      sessionId,
      currentStep: 0,
      totalSteps,
      percentComplete: 0,
      stepDescription: 'Initializing task',
      status: 'pending',
      logs: [`Task initialized: ${task.title}`, `Description: ${task.description}`],
      startedAt: new Date(),
      updatedAt: new Date(),
      artifacts: {
        files: [],
        commits: [],
        pullRequests: []
      }
    };

    this.progressCache.set(`${sessionId}:${taskId}`, progress);

    // Log initialization
    await this.eventStore.appendEvent(`sessions/${sessionId}`, {
      id: this.generateEventId(),
      type: 'task.progress.initialized',
      timestamp: new Date().toISOString(),
      sessionId,
      data: {
        taskId,
        progress,
        task: {
          title: task.title,
          description: task.description,
          priority: task.priority
        }
      }
    });

    this.emit('progress', progress);
    return progress;
  }

  async updateProgress(sessionId: string, taskId: string, options: ProgressUpdateOptions): Promise<TaskProgress> {
    const key = `${sessionId}:${taskId}`;
    const currentProgress = this.progressCache.get(key);

    if (!currentProgress) {
      throw new Error(`Progress not found for task ${taskId} in session ${sessionId}`);
    }

    // Update progress fields
    if (options.step !== undefined) {
      currentProgress.currentStep = options.step;
      currentProgress.percentComplete = Math.round((options.step / currentProgress.totalSteps) * 100);
    }

    if (options.description) {
      currentProgress.stepDescription = options.description;
    }

    if (options.status) {
      currentProgress.status = options.status;
      
      if (options.status === 'completed') {
        currentProgress.completedAt = new Date();
        currentProgress.percentComplete = 100;
      } else if (options.status === 'in_progress' && currentProgress.status === 'pending') {
        // Starting the task
        currentProgress.startedAt = new Date();
      }
    }

    if (options.logEntry) {
      currentProgress.logs.push(`${new Date().toISOString()}: ${options.logEntry}`);
      
      // Keep only last 50 log entries to prevent memory issues
      if (currentProgress.logs.length > 50) {
        currentProgress.logs = currentProgress.logs.slice(-50);
      }
    }

    if (options.artifacts) {
      if (options.artifacts.files) {
        currentProgress.artifacts.files.push(...options.artifacts.files);
      }
      if (options.artifacts.commits) {
        currentProgress.artifacts.commits.push(...options.artifacts.commits);
      }
      if (options.artifacts.pullRequests) {
        currentProgress.artifacts.pullRequests = options.artifacts.pullRequests;
      }
    }

    if (options.error) {
      currentProgress.error = options.error;
      currentProgress.status = 'failed';
    }

    currentProgress.updatedAt = new Date();

    // Update cache
    this.progressCache.set(key, currentProgress);

    // Log progress update
    await this.eventStore.appendEvent(`sessions/${sessionId}`, {
      id: this.generateEventId(),
      type: 'task.progress.updated',
      timestamp: new Date().toISOString(),
      sessionId,
      data: {
        taskId,
        progress: {
          currentStep: currentProgress.currentStep,
          totalSteps: currentProgress.totalSteps,
          percentComplete: currentProgress.percentComplete,
          stepDescription: currentProgress.stepDescription,
          status: currentProgress.status,
          artifactCounts: {
            files: currentProgress.artifacts.files.length,
            commits: currentProgress.artifacts.commits.length,
            pullRequests: currentProgress.artifacts.pullRequests?.length || 0
          }
        },
        update: options
      }
    });

    this.emit('progress', currentProgress);
    this.emit(`progress:${taskId}`, currentProgress);
    return currentProgress;
  }

  async getProgress(sessionId: string, taskId: string): Promise<TaskProgress | null> {
    const key = `${sessionId}:${taskId}`;
    return this.progressCache.get(key) || null;
  }

  async getAllProgress(sessionId: string): Promise<TaskProgress[]> {
    const sessionProgress = [];
    for (const [key, progress] of this.progressCache) {
      if (key.startsWith(`${sessionId}:`)) {
        sessionProgress.push(progress);
      }
    }
    return sessionProgress.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  }

  async startTask(sessionId: string, taskId: string): Promise<TaskProgress> {
    return await this.updateProgress(sessionId, taskId, {
      status: 'in_progress',
      step: 1,
      description: 'Starting task execution',
      logEntry: 'Task execution started'
    });
  }

  async completeTask(sessionId: string, taskId: string, artifacts?: TaskProgress['artifacts']): Promise<TaskProgress> {
    const updateOptions: ProgressUpdateOptions = {
      status: 'completed',
      description: 'Task completed successfully',
      logEntry: 'Task execution completed successfully'
    };

    if (artifacts) {
      updateOptions.artifacts = artifacts;
    }

    return await this.updateProgress(sessionId, taskId, updateOptions);
  }

  async failTask(sessionId: string, taskId: string, error: string): Promise<TaskProgress> {
    return await this.updateProgress(sessionId, taskId, {
      status: 'failed',
      description: `Task failed: ${error}`,
      logEntry: `Task failed: ${error}`,
      error
    });
  }

  async pauseTask(sessionId: string, taskId: string): Promise<TaskProgress> {
    return await this.updateProgress(sessionId, taskId, {
      status: 'paused',
      description: 'Task paused by user',
      logEntry: 'Task execution paused'
    });
  }

  async resumeTask(sessionId: string, taskId: string): Promise<TaskProgress> {
    return await this.updateProgress(sessionId, taskId, {
      status: 'in_progress',
      description: 'Task resumed by user',
      logEntry: 'Task execution resumed'
    });
  }

  // Streaming interface for real-time progress updates
  createProgressStream(sessionId: string, taskId?: string) {
    const stream = new EventEmitter();
    
    const progressHandler = (progress: TaskProgress) => {
      if (progress.sessionId === sessionId) {
        if (!taskId || progress.taskId === taskId) {
          stream.emit('data', {
            type: 'progress',
            timestamp: new Date().toISOString(),
            data: progress
          });
        }
      }
    };

    const errorHandler = (error: Error) => {
      stream.emit('data', {
        type: 'error',
        timestamp: new Date().toISOString(),
        data: { error: error.message }
      });
    };

    this.on('progress', progressHandler);
    this.on('error', errorHandler);

    // Cleanup function
    const cleanup = () => {
      this.removeListener('progress', progressHandler);
      this.removeListener('error', errorHandler);
    };

    stream.on('close', cleanup);
    stream.on('end', cleanup);

    // Add cleanup method
    (stream as any).cleanup = cleanup;

    return stream;
  }

  // Cleanup old progress data
  async cleanup(olderThanDays: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    let cleanedCount = 0;
    for (const [key, progress] of this.progressCache) {
      if (progress.updatedAt < cutoffDate && 
          (progress.status === 'completed' || progress.status === 'failed')) {
        this.progressCache.delete(key);
        cleanedCount++;
      }
    }

    console.log(`🧹 Cleaned up ${cleanedCount} old progress entries`);
    return cleanedCount;
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}