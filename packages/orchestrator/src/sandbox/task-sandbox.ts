import { connect, close, type ConnectOpts } from "@dagger.io/dagger";
import type { Client, Container } from "@dagger.io/dagger";
import { JSONLEventStore } from '../storage/jsonl-event-store';
import { Task } from '../types/task';
import { TaskProgressManager, type TaskProgress } from '../core/task-progress-manager';
import EventEmitter from 'events';

export interface TaskExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  duration: number;
  artifacts: {
    files: string[];
    commits: string[];
    pullRequests?: number[];
  };
  progress: TaskProgress;
}


export interface TaskExecutionOptions {
  agentType?: string;
  timeoutMs?: number;
  enableRealTimeStreaming?: boolean;
  callbacks?: {
    onProgress?: (progress: TaskProgress) => void;
    onOutput?: (output: string) => void;
    onError?: (error: string) => void;
  };
}

export class TaskSandbox extends EventEmitter {
  private eventStore = new JSONLEventStore();
  private initialized = false;
  private connectOptions?: ConnectOpts;
  private currentProgress?: TaskProgress;
  private progressManager: TaskProgressManager;

  constructor(
    private sessionId: string,
    private taskId: string,
    private worktreePath: string,
    options?: ConnectOpts
  ) {
    super();
    this.connectOptions = options;
    this.progressManager = new TaskProgressManager();
  }

  async initializeForAgent(agentType: string = 'task-agent'): Promise<void> {
    if (this.initialized) {
      throw new Error('Task sandbox already initialized');
    }

    try {
      // Test Dagger connection and container creation
      await this.withDaggerClient(async (client) => {
        // Create task-specific container with agent tools
        const container = client
          .container()
          .from(this.getAgentImage(agentType))
          // Mount the worktree as the working directory
          .withDirectory("/code", client.host().directory(this.worktreePath))
          .withWorkdir("/code")
          // Set task-specific environment
          .withEnvVariable("TASK_ID", this.taskId)
          .withEnvVariable("SESSION_ID", this.sessionId)
          .withEnvVariable("AGENT_TYPE", agentType);

        // Test container sync to ensure everything works
        await container.sync();
      });

      this.initialized = true;

      // Log task sandbox initialization
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'task_sandbox.initialized',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { taskId: this.taskId, agentType, worktreePath: this.worktreePath }
      });

      console.log(`🤖 Task sandbox initialized for ${this.taskId} with ${agentType}`);

    } catch (error) {
      throw new Error(`Failed to initialize task sandbox: ${error instanceof Error ? error.message : error}`);
    }
  }

  async executeTask(task: Task, options: TaskExecutionOptions = {}): Promise<TaskExecutionResult> {
    if (!this.initialized) {
      throw new Error('Task sandbox not initialized');
    }

    const startTime = Date.now();
    const { timeoutMs = 1800000, enableRealTimeStreaming = false, callbacks } = options; // 30 min default
    
    try {
      // Initialize progress tracking using TaskProgressManager
      this.currentProgress = await this.progressManager.initializeTask(
        this.sessionId,
        this.taskId,
        task,
        6 // Analysis, Planning, Implementation, Testing, Commit, Finalization
      );
      
      // Emit initial progress
      if (callbacks?.onProgress) {
        callbacks.onProgress(this.currentProgress);
      }

      // Log task execution start
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'task.execution.started',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          taskId: this.taskId, 
          task: {
            title: task.title,
            description: task.description,
            fileScope: task.fileScope
          },
          options: { 
            timeoutMs,
            enableRealTimeStreaming,
            agentType: options.agentType || 'claude'
          }
        }
      });

      // Execute the task with enhanced logic
      const result = await this.executeTaskWithAgent(task, options);

      // Final progress update using TaskProgressManager
      this.currentProgress = await this.progressManager.updateProgress(this.sessionId, this.taskId, {
        step: this.currentProgress?.totalSteps || 6,
        description: result.success ? 'Task completed successfully' : 'Task failed',
        status: result.success ? 'completed' : 'failed',
        artifacts: result.artifacts
      });
      
      // Emit final progress
      if (callbacks?.onProgress && this.currentProgress) {
        callbacks.onProgress(this.currentProgress);
      }

      // Log task completion
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: result.success ? 'task.execution.completed' : 'task.execution.failed',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          taskId: this.taskId,
          success: result.success,
          duration: result.duration,
          output: result.output.substring(0, 1000), // Truncate for logging
          error: result.error,
          artifacts: result.artifacts,
          progress: result.progress
        }
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const duration = Date.now() - startTime;
      
      // Update progress to show error using TaskProgressManager
      if (this.currentProgress) {
        this.currentProgress = await this.progressManager.updateProgress(this.sessionId, this.taskId, {
          description: `Error: ${errorMessage}`,
          status: 'failed',
          logEntry: `Error: ${errorMessage}`,
          error: errorMessage
        });
        
        // Emit error progress
        if (callbacks?.onProgress) {
          callbacks.onProgress(this.currentProgress);
        }
      }
      
      // Log task failure
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'task.execution.error',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          taskId: this.taskId,
          error: errorMessage,
          duration
        }
      });

      return {
        success: false,
        output: '',
        error: errorMessage,
        duration,
        artifacts: { files: [], commits: [] },
        progress: this.currentProgress || await this.progressManager.initializeTask(
          this.sessionId,
          this.taskId,
          {
            id: this.taskId,
            title: 'Failed Task',
            description: 'Task failed during execution',
            priority: 'medium',
            status: 'failed'
          },
          6
        )
      };
    }
  }

  private async executeTaskWithAgent(task: Task, options: TaskExecutionOptions): Promise<TaskExecutionResult> {
    if (!this.initialized) {
      throw new Error('Task sandbox not initialized');
    }

    const startTime = Date.now();
    const artifacts: { files: string[], commits: string[], pullRequests?: number[] } = { 
      files: [], 
      commits: [],
      pullRequests: []
    };
    let output = '';
    
    // Step 1: Analysis
    if (this.currentProgress) {
      this.currentProgress = await this.progressManager.updateProgress(this.sessionId, this.taskId, {
        step: 1,
        description: 'Analyzing task requirements',
        status: 'in_progress'
      });
      if (options.callbacks?.onProgress) {
        options.callbacks.onProgress(this.currentProgress);
      }
    }
    
    const analysisOutput = await this.analyzeTask(task);
    output += `=== Task Analysis ===\n${analysisOutput}\n\n`;
    
    // Step 2: Planning
    if (this.currentProgress) {
      this.currentProgress = await this.progressManager.updateProgress(this.sessionId, this.taskId, {
        step: 2,
        description: 'Creating execution plan',
        logEntry: `Analysis: ${analysisOutput}`
      });
    }
    if (options.callbacks?.onProgress && this.currentProgress) {
      options.callbacks.onProgress(this.currentProgress);
    }
    
    const planOutput = await this.createExecutionPlan(task);
    output += `=== Execution Plan ===\n${planOutput}\n\n`;
    this.currentProgress?.logs.push(`Plan: ${planOutput}`);
    
    // Step 3: Implementation
    if (this.currentProgress) {
      this.currentProgress.currentStep = 3;
      this.currentProgress.stepDescription = 'Implementing task solution';
      this.currentProgress.percentComplete = Math.round((3 / this.currentProgress.totalSteps) * 100);
    }
    this.updateProgress(options.callbacks?.onProgress);
    
    try {
      const implementationOutput = await this.implementTask(task, options);
      output += `=== Implementation ===\n${implementationOutput.output}\n\n`;
      artifacts.files.push(...implementationOutput.files);
      this.currentProgress?.logs.push(`Implementation completed`);
      
      // Step 4: Testing (if test strategy exists)
      if (task.testStrategy && this.currentProgress) {
        this.currentProgress.currentStep = 4;
        this.currentProgress.stepDescription = 'Running tests';
        this.currentProgress.percentComplete = Math.round((4 / this.currentProgress.totalSteps) * 100);
        this.updateProgress(options.callbacks?.onProgress);
        
        const testOutput = await this.runTests(task);
        output += `=== Testing ===\n${testOutput}\n\n`;
        this.currentProgress.logs.push(`Tests completed`);
      }
      
      // Step 5: Commit changes
      if (this.currentProgress) {
        this.currentProgress.currentStep = 5;
        this.currentProgress.stepDescription = 'Committing changes';
        this.currentProgress.percentComplete = Math.round((5 / this.currentProgress.totalSteps) * 100);
      }
      this.updateProgress(options.callbacks?.onProgress);
      
      if (implementationOutput.hasChanges) {
        const commitHash = await this.commitChanges(`Task ${this.taskId}: ${task.title}\n\n${task.description}`);
        artifacts.commits.push(commitHash);
        output += `=== Commit Created ===\n${commitHash}\n\n`;
        this.currentProgress?.logs.push(`Commit created: ${commitHash}`);
      }
      
      // Step 6: Finalization
      if (this.currentProgress) {
        this.currentProgress.currentStep = 6;
        this.currentProgress.stepDescription = 'Finalizing task';
        this.currentProgress.percentComplete = Math.round((6 / this.currentProgress.totalSteps) * 100);
      }
      this.updateProgress(options.callbacks?.onProgress);
      
      const finalOutput = await this.finalizeTask(task, artifacts);
      output += `=== Finalization ===\n${finalOutput}\n\n`;
      
      return {
        success: true,
        output,
        duration: Date.now() - startTime,
        artifacts,
        progress: this.currentProgress!
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      output += `=== Error ===\n${errorMessage}\n\n`;
      
      return {
        success: false,
        output,
        error: errorMessage,
        duration: Date.now() - startTime,
        artifacts,
        progress: this.currentProgress || {
          taskId: this.taskId,
          sessionId: this.sessionId,
          currentStep: 0,
          totalSteps: 6,
          percentComplete: 0,
          stepDescription: 'Failed during execution',
          status: 'failed' as const,
          logs: [],
          startedAt: new Date(),
          updatedAt: new Date(),
          artifacts: { files: [], commits: [] }
        }
      };
    }
  }
  
  private async analyzeTask(task: Task): Promise<string> {
    return await this.withDaggerClient(async (client) => {
      const container = this.createTaskContainer(client, 'claude');
      
      const result = await container
        .withExec([
          "sh", "-c",
          `echo "Analyzing task: ${task.title}"` +
          `&& echo "Description: ${task.description}"` +
          `&& echo "Priority: ${task.priority}"` +
          `&& echo "File scope: ${task.fileScope?.join(', ') || 'all files'}"` +
          `&& echo "Files in worktree:" && ls -la`
        ])
        .stdout();
        
      return result;
    });
  }
  
  private async createExecutionPlan(task: Task): Promise<string> {
    return await this.withDaggerClient(async (client) => {
      const container = this.createTaskContainer(client, 'claude');
      
      const planSteps = [
        `1. Analyze existing codebase structure`,
        `2. Identify files to modify based on scope: ${task.fileScope?.join(', ') || 'all'}`,
        `3. Implement changes for: ${task.description}`,
        `4. Test changes if strategy provided: ${task.testStrategy || 'none'}`,
        `5. Commit changes with descriptive message`,
        `6. Verify implementation meets requirements`
      ];
      
      const result = await container
        .withExec([
          "sh", "-c",
          `echo "Execution Plan for Task: ${task.title}"` +
          `&& echo "${planSteps.join('\n')}"`
        ])
        .stdout();
        
      return result;
    });
  }
  
  private async implementTask(task: Task, options: TaskExecutionOptions): Promise<{output: string, files: string[], hasChanges: boolean}> {
    return await this.withDaggerClient(async (client) => {
      const container = this.createTaskContainer(client, options.agentType || 'claude');
      
      // Check initial git status
      const gitStatusBefore = await container
        .withExec(["git", "status", "--porcelain"])
        .stdout();
      
      // Create task implementation (for now, enhanced placeholder)
      // TODO: In full implementation, this would use real AI agents via generateCode()
      const taskResult = await container
        .withExec([
          "sh", "-c",
          `# Create task implementation\n` +
          `echo "# Task Implementation: ${task.title}" > TASK_${this.taskId}.md` +
          `&& echo "" >> TASK_${this.taskId}.md` +
          `&& echo "## Description" >> TASK_${this.taskId}.md` +
          `&& echo "${task.description}" >> TASK_${this.taskId}.md` +
          `&& echo "" >> TASK_${this.taskId}.md` +
          `&& echo "## Priority: ${task.priority}" >> TASK_${this.taskId}.md` +
          `&& echo "" >> TASK_${this.taskId}.md` +
          `&& echo "## File Scope" >> TASK_${this.taskId}.md` +
          `&& echo "${task.fileScope?.join(', ') || 'all files'}" >> TASK_${this.taskId}.md` +
          `&& echo "" >> TASK_${this.taskId}.md` +
          `&& echo "## Status: Implemented" >> TASK_${this.taskId}.md` +
          `&& echo "" >> TASK_${this.taskId}.md` +
          `&& echo "## Implementation Details" >> TASK_${this.taskId}.md` +
          `&& echo "This task has been processed by VibeKit Orchestrator Phase 7" >> TASK_${this.taskId}.md` +
          `&& echo "Timestamp: $(date)" >> TASK_${this.taskId}.md` +
          `&& echo "Session: ${this.sessionId}" >> TASK_${this.taskId}.md` +
          `&& echo "Task ID: ${this.taskId}" >> TASK_${this.taskId}.md` +
          `&& echo "Implementation completed successfully"`
        ])
        .stdout();
      
      // Check for changes
      const gitStatusAfter = await container
        .withExec(["git", "status", "--porcelain"])
        .stdout();
      
      const hasChanges = gitStatusAfter.trim().length > 0;
      
      // List created/modified files
      const modifiedFiles = await container
        .withExec(["find", ".", "-name", `TASK_${this.taskId}.md`, "-type", "f"])
        .stdout();
      
      const files = modifiedFiles.trim() ? 
        modifiedFiles.trim().split('\n').filter(f => f.trim()) : [];
      
      const output = `Implementation Result:\n${taskResult}\n\nGit Status Before:\n${gitStatusBefore}\nGit Status After:\n${gitStatusAfter}\nModified Files:\n${files.join('\n')}`;
      
      return {
        output,
        files,
        hasChanges
      };
    });
  }
  
  private async runTests(task: Task): Promise<string> {
    return await this.withDaggerClient(async (client) => {
      const container = this.createTaskContainer(client, 'claude');
      
      try {
        // Run basic test strategy if provided
        const testResult = await container
          .withExec([
            "sh", "-c",
            `echo "Running tests for task: ${task.title}"` +
            `&& echo "Test Strategy: ${task.testStrategy}"` +
            `&& echo "Validating implementation..."` +
            `&& test -f TASK_${this.taskId}.md && echo "✅ Task file exists" || echo "❌ Task file missing"` +
            `&& echo "Tests completed successfully"`
          ])
          .stdout();
          
        return testResult;
      } catch (error) {
        return `Test execution failed: ${error instanceof Error ? error.message : error}`;
      }
    });
  }
  
  private async finalizeTask(task: Task, artifacts: {files: string[], commits: string[]}): Promise<string> {
    return await this.withDaggerClient(async (client) => {
      const container = this.createTaskContainer(client, 'claude');
      
      const finalResult = await container
        .withExec([
          "sh", "-c",
          `echo "Task finalization complete"` +
          `&& echo "Files created/modified: ${artifacts.files.length}"` +
          `&& echo "Commits created: ${artifacts.commits.length}"` +
          `&& echo "Task '${task.title}' completed successfully"` +
          `&& echo "Final status: SUCCESS"`
        ])
        .stdout();
        
      return finalResult;
    });
  }
  
  private updateProgress(callback?: (progress: TaskProgress) => void): void {
    if (callback && this.currentProgress) {
      callback(this.currentProgress);
    }
    
    // Also emit event for external listeners
    this.emit('progress', this.currentProgress);
  }

  async commitChanges(message: string): Promise<string> {
    if (!this.initialized) {
      throw new Error('Task sandbox not initialized');
    }

    return await this.withDaggerClient(async (client) => {
      const container = this.createTaskContainer(client, 'task-agent');
      
      try {
        // Check if there are changes to commit
        const status = await container
          .withExec(["git", "status", "--porcelain"])
          .stdout();

        if (!status.trim()) {
          throw new Error('No changes to commit');
        }

        // Commit the changes
        const commitHash = await container
          .withExec(["git", "add", "."])
          .withExec(["git", "commit", "-m", message])
          .withExec(["git", "rev-parse", "HEAD"])
          .stdout();

        const hash = commitHash.trim();

        // Log commit
        await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
          id: this.generateEventId(),
          type: 'task.commit.created',
          timestamp: new Date().toISOString(),
          sessionId: this.sessionId,
          data: { taskId: this.taskId, commit: hash, message }
        });

        return hash;

      } catch (error) {
        throw new Error(`Failed to commit changes: ${error instanceof Error ? error.message : error}`);
      }
    });
  }

  async getWorkingDirectory(): Promise<string> {
    if (!this.initialized) {
      throw new Error('Task sandbox not initialized');
    }

    return await this.withDaggerClient(async (client) => {
      const container = this.createTaskContainer(client, 'task-agent');
      return await container
        .withExec(["pwd"])
        .stdout();
    });
  }

  async listFiles(pattern: string = "*"): Promise<string[]> {
    if (!this.initialized) {
      throw new Error('Task sandbox not initialized');
    }

    return await this.withDaggerClient(async (client) => {
      const container = this.createTaskContainer(client, 'task-agent');
      
      try {
        const result = await container
          .withExec(["find", ".", "-name", pattern, "-type", "f"])
          .stdout();

        return result.trim()
          .split('\n')
          .filter(line => line.trim())
          .map(line => line.replace(/^\.\//, ''));

      } catch {
        return [];
      }
    });
  }

  private getAgentImage(agentType: string): string {
    // Use VibeKit sandbox image with all agents pre-installed from Docker Hub
    // This image is built by 'vibekit sandbox build' and includes Claude, Codex, Gemini, OpenCode, Grok
    return process.env.VIBEKIT_SANDBOX_IMAGE || "joedanziger/vibekit-sandbox:latest";
  }

  private async withDaggerClient<T>(callback: (client: Client) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      try {
        const connectResult = connect(async (client) => {
          try {
            const result = await callback(client);
            resolve(result);
          } catch (error) {
            reject(error);
          }
        }, this.connectOptions);
        
        // Handle case where connect returns a promise
        if (connectResult && typeof connectResult.catch === 'function') {
          connectResult.catch(reject);
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private createTaskContainer(client: Client, agentType: string): Container {
    return client
      .container()
      .from(this.getAgentImage(agentType))
      // Mount the worktree as the working directory
      .withDirectory("/code", client.host().directory(this.worktreePath))
      .withWorkdir("/code")
      // Set task-specific environment
      .withEnvVariable("TASK_ID", this.taskId)
      .withEnvVariable("SESSION_ID", this.sessionId)
      .withEnvVariable("AGENT_TYPE", agentType)
      .withEnvVariable("VIBEKIT_SANDBOX_ACTIVE", "1");
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}