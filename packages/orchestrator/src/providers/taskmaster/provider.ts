import { EnhancedProjectProvider, ProviderCapabilities } from '../base';
import { Task, TaskEvent, TaskComplexity } from '../../types/task';
import { EventEmitter } from 'events';

export interface TaskmasterConfig {
  projectRoot: string;
  tasksFile?: string;
  autoExpand?: boolean;
  requestTimeout?: number;
}

export class TaskmasterProvider extends EnhancedProjectProvider {
  type = 'taskmaster';
  private mcpClient: any = null; // Lazy loaded
  private eventEmitter = new EventEmitter();
  private config: TaskmasterConfig;
  private lastSync: Date = new Date(0);
  private taskCache: Map<string, Task> = new Map();
  private isInitialized = false;
  private mcpClientPromise: Promise<any> | null = null;

  constructor(config: TaskmasterConfig) {
    super();
    this.config = {
      tasksFile: '.taskmaster/tasks.json',
      autoExpand: true,
      requestTimeout: 30000,
      ...config
    };
    
    // Don't initialize MCP client here - do it lazily
  }

  private async initializeMCPClient(): Promise<any> {
    if (this.mcpClientPromise) {
      return this.mcpClientPromise;
    }

    this.mcpClientPromise = this._initializeMCPClient();
    return this.mcpClientPromise;
  }

  private async _initializeMCPClient(): Promise<any> {
    try {
      // Dynamic import to avoid loading MCP dependencies at module load time
      const { MCPClient } = await import('@vibe-kit/mcp-client');
      
      // Create MCP server configuration for Taskmaster
      const mcpServer = {
        id: `taskmaster-${Date.now()}`,
        name: 'Taskmaster',
        description: 'Taskmaster project management MCP server',
        transport: 'stdio' as const,
        status: 'active' as const,
        config: {
          command: 'npx',
          args: ['@vibe-kit/taskmaster', 'mcp'],
          cwd: this.config.projectRoot,
          env: {
            NODE_ENV: 'production'
          }
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.mcpClient = new MCPClient(mcpServer, {
        clientName: 'vibekit-orchestrator'
      });

      this.setupMCPEventHandlers();
      return this.mcpClient;
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
      throw new Error(`MCP client initialization failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private setupMCPEventHandlers(): void {
    if (!this.mcpClient) return;

    this.mcpClient.on('connected', () => {
      this.isInitialized = true;
      console.log('Taskmaster MCP client connected');
    });

    this.mcpClient.on('disconnected', () => {
      this.isInitialized = false;
      console.log('Taskmaster MCP client disconnected');
    });

    this.mcpClient.on('error', (error: Error) => {
      console.error('Taskmaster MCP error:', error);
      this.isInitialized = false;
      this.eventEmitter.emit('error', error);
    });

    // Listen for tool discoveries and notifications
    this.mcpClient.on('tool:discovered', (tools: any[]) => {
      console.log('Taskmaster tools discovered:', tools.map((t: any) => t.name));
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      try {
        // Lazy load MCP client
        if (!this.mcpClient) {
          await this.initializeMCPClient();
        }
        
        await this.mcpClient.connect();
        // Wait a moment for connection to stabilize
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Auto-expand tasks if configured
        if (this.config.autoExpand) {
          try {
            await this.mcpClient.executeTool('expand_all', {});
          } catch (error) {
            console.warn('Auto-expand failed:', error);
          }
        }
      } catch (error) {
        throw new Error(`Failed to initialize Taskmaster provider: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  async getTasks(tag?: string): Promise<Task[]> {
    await this.ensureInitialized();
    
    try {
      const result = await this.mcpClient.executeTool('get_tasks', {});
      if (!result.success) {
        throw new Error(`MCP tool execution failed: ${result.error}`);
      }
      
      // Extract tasks from the MCP result
      const tasksData = this.extractTasksFromMCPResult(result.result);
      let tasks = this.mapTaskmasterTasks(tasksData || []);
      
      // Filter by tag if specified
      if (tag) {
        tasks = tasks.filter(task => 
          this.hasTagReference(task, tag)
        );
      }

      // Update cache
      tasks.forEach(task => this.taskCache.set(task.id, task));
      
      return tasks;
    } catch (error) {
      throw new Error(`Failed to get tasks: ${error instanceof Error ? error.message : error}`);
    }
  }

  async getTask(id: string): Promise<Task> {
    await this.ensureInitialized();
    
    // Check cache first
    if (this.taskCache.has(id)) {
      return this.taskCache.get(id)!;
    }

    try {
      const result = await this.mcpClient.executeTool('get_task', { id });
      if (!result.success) {
        throw new Error(`MCP tool execution failed: ${result.error}`);
      }
      
      const taskData = this.extractTaskFromMCPResult(result.result);
      const task = this.mapTaskmasterTask(taskData);
      
      // Update cache
      this.taskCache.set(task.id, task);
      
      return task;
    } catch (error) {
      throw new Error(`Failed to get task ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  async updateTaskStatus(id: string, status: Task['status']): Promise<void> {
    await this.ensureInitialized();
    
    try {
      const taskmasterStatus = this.mapToTaskmasterStatus(status);
      const result = await this.mcpClient.executeTool('set_task_status', { 
        id, 
        status: taskmasterStatus 
      });
      
      if (!result.success) {
        throw new Error(`MCP tool execution failed: ${result.error}`);
      }
      
      // Update cache
      const cachedTask = this.taskCache.get(id);
      if (cachedTask) {
        cachedTask.status = status;
        this.taskCache.set(id, cachedTask);
      }

      // Emit update event
      this.eventEmitter.emit('taskUpdated', { 
        type: 'task.updated' as const,
        taskId: id, 
        data: { status },
        timestamp: new Date()
      });
    } catch (error) {
      throw new Error(`Failed to update task ${id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  async createTask(task: Omit<Task, 'id'>): Promise<Task> {
    await this.ensureInitialized();
    
    try {
      const result = await this.mcpClient.executeTool('add_task', {
        title: task.title,
        description: task.description,
        details: task.details || '',
        priority: task.priority || 'medium',
        testStrategy: task.testStrategy || '',
        status: this.mapToTaskmasterStatus(task.status),
        fileScope: task.fileScope?.join(',') || ''
      });

      if (!result.success) {
        throw new Error(`MCP tool execution failed: ${result.error}`);
      }

      const taskData = this.extractTaskFromMCPResult(result.result);
      const newTask = this.mapTaskmasterTask(taskData);
      
      // Update cache
      this.taskCache.set(newTask.id, newTask);
      
      // Emit creation event
      this.eventEmitter.emit('taskCreated', {
        type: 'task.created' as const,
        taskId: newTask.id,
        data: newTask,
        timestamp: new Date()
      });

      return newTask;
    } catch (error) {
      throw new Error(`Failed to create task: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Task grouping operations
  async getTasksByTag(tag: string): Promise<Task[]> {
    await this.ensureInitialized();
    
    // Get all tasks and filter by tag
    const allTasks = await this.getTasks();
    return allTasks.filter(task => 
      task.tags?.includes(tag) || 
      this.hasTagReference(task, tag)
    );
  }

  async getTaskWithSubtasks(id: string): Promise<Task> {
    await this.ensureInitialized();
    
    const task = await this.getTask(id);
    // Taskmaster automatically includes subtasks in the task object
    return task;
  }

  async decomposeTask(taskId: string): Promise<Task[]> {
    await this.ensureInitialized();
    
    try {
      // Use expand_all to break down tasks into subtasks
      const result = await this.mcpClient.executeTool('expand_all', {});
      if (!result.success) {
        throw new Error(`MCP tool execution failed: ${result.error}`);
      }
      
      // Get the task with its decomposed subtasks
      const task = await this.getTask(taskId);
      return task.subtasks || [];
    } catch (error) {
      throw new Error(`Failed to decompose task ${taskId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  async analyzeTaskComplexity(taskId: string): Promise<TaskComplexity> {
    await this.ensureInitialized();
    
    try {
      const result = await this.mcpClient.executeTool('analyze_project_complexity', {});
      if (!result.success) {
        throw new Error(`MCP tool execution failed: ${result.error}`);
      }
      
      const complexityData = this.extractComplexityFromMCPResult(result.result);
      const taskComplexity = complexityData?.tasks?.[taskId];
      
      if (!taskComplexity) {
        // Fallback to basic analysis
        const task = await this.getTask(taskId);
        return this.inferTaskComplexity(task);
      }

      return {
        level: taskComplexity.level || 'moderate',
        estimatedHours: taskComplexity.estimatedHours || 2,
        suggestedAgentTypes: taskComplexity.suggestedAgentTypes || ['task-agent'],
        fileScopes: taskComplexity.fileScopes || this.inferFileScope(await this.getTask(taskId)),
        dependencies: taskComplexity.dependencies || [],
        risks: taskComplexity.risks || []
      };
    } catch (error) {
      console.warn('Complexity analysis failed, using fallback:', error);
      const task = await this.getTask(taskId);
      return this.inferTaskComplexity(task);
    }
  }

  async getSubtasks(parentId: string): Promise<Task[]> {
    await this.ensureInitialized();
    
    try {
      // Get all tasks and filter for subtasks of parent
      const allTasks = await this.getTasks();
      return allTasks.filter(task => 
        task.dependencies?.includes(parentId) ||
        this.isSubtaskOf(task, parentId)
      );
    } catch (error) {
      throw new Error(`Failed to get subtasks for ${parentId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  async createSubtask(parentId: string, subtask: Omit<Task, 'id'>): Promise<Task> {
    const taskWithDependency = {
      ...subtask,
      dependencies: [...(subtask.dependencies || []), parentId]
    };
    
    return this.createTask(taskWithDependency);
  }

  subscribe(callback: (event: TaskEvent) => void): () => void {
    const handler = (event: TaskEvent) => callback(event);
    this.eventEmitter.on('taskUpdated', handler);
    this.eventEmitter.on('taskCreated', handler);
    
    return () => {
      this.eventEmitter.off('taskUpdated', handler);
      this.eventEmitter.off('taskCreated', handler);
    };
  }

  async syncMetadata(id: string, metadata: any): Promise<void> {
    // Store metadata in task details or custom fields
    const task = await this.getTask(id);
    const updatedTask = {
      ...task,
      details: task.details ? `${task.details}\n\n---\nMetadata: ${JSON.stringify(metadata)}` : `Metadata: ${JSON.stringify(metadata)}`
    };
    
    // This would require extending the MCP client to support metadata updates
    console.warn('syncMetadata not fully implemented - metadata stored in details');
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsTagging: true, // Via tags
      supportsSubtasks: true,
      supportsDecomposition: true,
      supportsComplexityAnalysis: true,
      supportsRealTimeUpdates: true,
      maxConcurrentRequests: 10
    };
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; message?: string }> {
    try {
      // If MCP client not initialized, return basic health
      if (!this.mcpClient) {
        return { 
          status: 'healthy', 
          message: 'Provider configured, MCP client not initialized'
        };
      }

      if (!this.mcpClient.isConnected()) {
        return { status: 'unhealthy', message: 'MCP client not connected' };
      }

      // Test basic connectivity by getting project summary
      const result = await this.mcpClient.executeTool('get_project_summary', {});
      if (result.success) {
        return { status: 'healthy' };
      } else {
        return { status: 'unhealthy', message: result.error };
      }
    } catch (error) {
      return { 
        status: 'unhealthy', 
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async getRateLimitStatus(): Promise<{ remaining: number; resetAt: Date; limit: number; }> {
    // Taskmaster MCP doesn't have rate limiting, so return unlimited
    return {
      remaining: 1000,
      resetAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      limit: 1000
    };
  }

  // Private helper methods for extracting data from MCP results
  private extractTasksFromMCPResult(result: any): any[] {
    // MCP result can be in different formats depending on the tool
    if (Array.isArray(result)) {
      return result;
    }
    
    if (result && result.content) {
      // Handle structured MCP response
      if (Array.isArray(result.content)) {
        const textContent = result.content.find((c: any) => c.type === 'text');
        if (textContent && textContent.text) {
          try {
            const parsed = JSON.parse(textContent.text);
            return parsed.tasks || parsed || [];
          } catch {
            return [];
          }
        }
      }
    }
    
    if (result && result.tasks) {
      return result.tasks;
    }
    
    if (result && typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        return parsed.tasks || parsed || [];
      } catch {
        return [];
      }
    }
    
    return [];
  }

  private extractTaskFromMCPResult(result: any): any {
    // Similar to extractTasksFromMCPResult but for single task
    if (result && result.content) {
      if (Array.isArray(result.content)) {
        const textContent = result.content.find((c: any) => c.type === 'text');
        if (textContent && textContent.text) {
          try {
            const parsed = JSON.parse(textContent.text);
            return parsed.task || parsed;
          } catch {
            return {};
          }
        }
      }
    }
    
    if (result && result.task) {
      return result.task;
    }
    
    if (result && typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        return parsed.task || parsed;
      } catch {
        return {};
      }
    }
    
    return result || {};
  }

  private extractComplexityFromMCPResult(result: any): any {
    // Extract complexity analysis from MCP result
    if (result && result.content) {
      if (Array.isArray(result.content)) {
        const textContent = result.content.find((c: any) => c.type === 'text');
        if (textContent && textContent.text) {
          try {
            return JSON.parse(textContent.text);
          } catch {
            return {};
          }
        }
      }
    }
    
    if (result && typeof result === 'string') {
      try {
        return JSON.parse(result);
      } catch {
        return {};
      }
    }
    
    return result || {};
  }

  private mapTaskmasterTask(task: any): Task {
    return {
      id: task.id?.toString() || '',
      title: task.title || '',
      description: task.description || '',
      details: task.details || undefined,
      testStrategy: task.testStrategy || undefined,
      priority: this.mapPriority(task.priority),
      status: this.mapTaskmasterStatus(task.status),
      subtasks: task.subtasks?.map((st: any) => this.mapTaskmasterTask(st)),
      dependencies: task.dependencies?.map((d: number) => d.toString()) || [],
      fileScope: this.parseFileScope(task.fileScope),
      estimatedHours: task.estimatedHours || undefined
    };
  }

  private mapTaskmasterTasks(tasks: any[]): Task[] {
    return tasks.map(task => this.mapTaskmasterTask(task));
  }

  private mapTaskmasterStatus(status: string): Task['status'] {
    const statusMap: Record<string, Task['status']> = {
      'pending': 'pending',
      'in-progress': 'in_progress',
      'done': 'completed',
      'review': 'in_progress',
      'deferred': 'pending',
      'cancelled': 'failed'
    };
    return statusMap[status] || 'pending';
  }

  private mapToTaskmasterStatus(status: Task['status']): string {
    const statusMap: Record<Task['status'], string> = {
      'pending': 'pending',
      'in_progress': 'in-progress',
      'completed': 'done',
      'failed': 'cancelled'
    };
    return statusMap[status] || 'pending';
  }

  private mapPriority(priority: string | undefined): Task['priority'] {
    if (!priority) return 'medium';
    
    const priorityMap: Record<string, Task['priority']> = {
      'high': 'high',
      'medium': 'medium',
      'low': 'low',
      'urgent': 'high',
      'normal': 'medium'
    };
    
    return priorityMap[priority.toLowerCase()] || 'medium';
  }

  private parseFileScope(fileScope: string | undefined): string[] {
    if (!fileScope) return [];
    return fileScope.split(',').map(s => s.trim()).filter(s => s.length > 0);
  }

  private inferFileScope(task: Task): string[] {
    const details = (task.details?.toLowerCase() || '') + (task.description?.toLowerCase() || '');
    const scopes: string[] = [];

    if (details.includes('api') || details.includes('endpoint')) {
      scopes.push('src/api/**', 'app/api/**');
    }
    if (details.includes('component') || details.includes('ui')) {
      scopes.push('src/components/**', 'components/**');
    }
    if (details.includes('database') || details.includes('migration')) {
      scopes.push('src/db/**', 'migrations/**');
    }
    if (details.includes('test')) {
      scopes.push('test/**', 'tests/**', '**/*.test.ts', '**/*.test.tsx');
    }
    if (details.includes('style') || details.includes('css')) {
      scopes.push('**/*.css', '**/*.scss', 'styles/**');
    }
    if (details.includes('config') || details.includes('setting')) {
      scopes.push('config/**', '*.config.ts', '*.config.js');
    }

    return scopes.length > 0 ? scopes : ['src/**']; // Default scope
  }

  private inferTaskComplexity(task: Task): TaskComplexity {
    const details = (task.details || '') + (task.description || '');
    const hasSubtasks = (task.subtasks?.length || 0) > 0;
    const hasDependencies = (task.dependencies?.length || 0) > 0;
    
    let level: TaskComplexity['level'] = 'simple';
    let estimatedHours = 1;
    
    // Analyze complexity based on content
    const complexityIndicators = [
      details.includes('refactor'),
      details.includes('architecture'),
      details.includes('database'),
      details.includes('integration'),
      details.includes('performance'),
      details.includes('security'),
      hasSubtasks,
      hasDependencies
    ].filter(Boolean).length;

    if (complexityIndicators >= 3) {
      level = 'complex';
      estimatedHours = 16;
    } else if (complexityIndicators >= 2) {
      level = 'moderate';
      estimatedHours = 8;
    } else if (complexityIndicators >= 1) {
      level = 'moderate';
      estimatedHours = 4;
    }

    return {
      level,
      estimatedHours,
      suggestedAgentTypes: this.getSuggestedAgentTypes(level, details),
      fileScopes: this.inferFileScope(task),
      dependencies: task.dependencies || [],
      risks: this.identifyRisks(details)
    };
  }

  private getSuggestedAgentTypes(level: TaskComplexity['level'], details: string): string[] {
    const agents = ['task-agent'];
    
    if (level === 'complex') {
      agents.push('senior-agent', 'coordinator');
    }
    
    if (details.includes('review') || details.includes('test')) {
      agents.push('review-agent');
    }
    
    return agents;
  }

  private identifyRisks(details: string): string[] {
    const risks: string[] = [];
    
    if (details.includes('breaking change')) {
      risks.push('Potential breaking changes');
    }
    if (details.includes('performance')) {
      risks.push('Performance impact');
    }
    if (details.includes('database') || details.includes('migration')) {
      risks.push('Data migration risks');
    }
    if (details.includes('security')) {
      risks.push('Security implications');
    }
    
    return risks;
  }

  private hasTagReference(task: Task, tag: string): boolean {
    // Check if task has the specified tag in various ways
    if (task.tags?.includes(tag)) return true;
    
    // Also check content for tag references
    const content = `${task.title} ${task.description} ${task.details || ''}`.toLowerCase();
    return content.includes(tag.toLowerCase()) || content.includes(`tag:${tag.toLowerCase()}`);
  }

  private isSubtaskOf(task: Task, parentId: string): boolean {
    // Check if task is a subtask based on title pattern or dependencies
    return task.dependencies?.includes(parentId) || 
           task.title.toLowerCase().includes(`subtask of ${parentId}`.toLowerCase());
  }

  private handleTaskUpdate(params: any): void {
    const event: TaskEvent = {
      type: 'task.updated',
      taskId: params.taskId,
      data: params,
      timestamp: new Date()
    };
    
    // Invalidate cache for updated task
    this.taskCache.delete(params.taskId);
    
    this.eventEmitter.emit('taskUpdated', event);
  }

  private handleProjectChange(params: any): void {
    // Clear cache on project changes
    this.taskCache.clear();
    
    this.eventEmitter.emit('projectChanged', params);
  }

  // Cleanup method
  async disconnect(): Promise<void> {
    try {
      if (this.mcpClient) {
        await this.mcpClient.disconnect();
      }
      this.isInitialized = false;
      this.taskCache.clear();
      this.mcpClient = null;
      this.mcpClientPromise = null;
    } catch (error) {
      console.error('Error disconnecting Taskmaster provider:', error);
    }
  }
}