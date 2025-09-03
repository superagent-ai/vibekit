import { Task, TaskEvent, TaskComplexity } from '../types/task';
import * as fs from 'fs/promises';

// Re-export types for external use
export type { Task, TaskEvent, TaskComplexity } from '../types/task';

export abstract class ProjectProvider {
  abstract type: string;

  // Core task operations
  abstract getTasks(tag?: string): Promise<Task[]>;
  abstract getTask(id: string): Promise<Task>;
  abstract updateTaskStatus(id: string, status: Task['status']): Promise<void>;
  abstract createTask(task: Omit<Task, 'id'>): Promise<Task>;
  
  // Task grouping operations
  abstract getTasksByTag?(tag: string): Promise<Task[]>;
  abstract getTaskWithSubtasks?(id: string): Promise<Task>;

  // Subtask operations
  abstract getSubtasks?(parentId: string): Promise<Task[]>;
  abstract createSubtask?(parentId: string, subtask: Omit<Task, 'id'>): Promise<Task>;

  // Metadata & sync operations
  abstract syncMetadata?(id: string, metadata: any): Promise<void>;
  abstract subscribe?(callback: (event: TaskEvent) => void): () => void;

  // Decomposition and analysis
  abstract decomposeTask?(taskId: string): Promise<Task[]>;
  abstract analyzeTaskComplexity?(taskId: string): Promise<TaskComplexity>;
}

// Provider registry for dynamic loading
export class ProviderRegistry {
  private providers: Map<string, ProjectProvider> = new Map();
  private configs: Map<string, any> = new Map();

  register(name: string, provider: ProjectProvider, config?: any): void {
    this.providers.set(name, provider);
    if (config) {
      this.configs.set(name, config);
    }
  }

  get(name: string): ProjectProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  async detectFromContext(projectPath: string): Promise<ProjectProvider> {
    // Auto-detect based on files in project
    
    try {
      // Check for taskmaster
      await fs.access(`${projectPath}/.taskmaster/tasks.json`);
      return this.get('taskmaster');
    } catch {}

    try {
      // Check for Linear config
      await fs.access(`${projectPath}/.linear/config.json`);
      return this.get('linear');
    } catch {}

    try {
      // Check for JIRA config
      await fs.access(`${projectPath}/.jira/config.json`);
      return this.get('jira');
    } catch {}

    // Default to GitHub Issues
    return this.get('github-issues');
  }

  listProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  getConfig(providerName: string): any {
    return this.configs.get(providerName);
  }

  // Check if a provider is available
  hasProvider(name: string): boolean {
    return this.providers.has(name);
  }

  // Clear all providers (useful for testing)
  clear(): void {
    this.providers.clear();
    this.configs.clear();
  }

  // Get provider metadata
  getProviderInfo(name: string): { type: string; hasConfig: boolean } | null {
    const provider = this.providers.get(name);
    if (!provider) return null;

    return {
      type: provider.type,
      hasConfig: this.configs.has(name)
    };
  }
}

// Provider factory interface for dynamic loading
export interface ProviderFactory {
  createProvider(config: any): Promise<ProjectProvider>;
  validateConfig(config: any): boolean;
  getRequiredConfigFields(): string[];
}

// Default provider configurations
export const DEFAULT_PROVIDER_CONFIGS = {
  taskmaster: {
    projectRoot: process.cwd(),
    tasksFile: '.taskmaster/tasks.json'
  },
  linear: {
    apiKey: '',
    workspace: ''
  },
  jira: {
    url: '',
    username: '',
    apiToken: ''
  },
  'github-issues': {
    owner: '',
    repo: '',
    token: ''
  }
};

// Provider capabilities interface
export interface ProviderCapabilities {
  supportsTagging: boolean; // Replaces supportsEpics
  supportsSubtasks: boolean;
  supportsDecomposition: boolean;
  supportsComplexityAnalysis: boolean;
  supportsRealTimeUpdates: boolean;
  maxConcurrentRequests: number;
}

// Enhanced provider interface with capabilities
export abstract class EnhancedProjectProvider extends ProjectProvider {
  abstract getCapabilities(): ProviderCapabilities;
  
  // Health check
  abstract healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; message?: string }>;
  
  // Rate limiting info
  abstract getRateLimitStatus?(): Promise<{
    remaining: number;
    resetAt: Date;
    limit: number;
  }>;
}