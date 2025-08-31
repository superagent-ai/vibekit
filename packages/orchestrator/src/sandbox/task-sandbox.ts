import { connect, close, type ConnectOpts } from "@dagger.io/dagger";
import type { Client, Container } from "@dagger.io/dagger";
import { JSONLEventStore } from '../storage/jsonl-event-store';
import { Task } from '../types/task';

export interface TaskExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts: {
    files: string[];
    commits: string[];
  };
}

export class TaskSandbox {
  private eventStore = new JSONLEventStore();
  private initialized = false;
  private connectOptions?: ConnectOpts;

  constructor(
    private sessionId: string,
    private taskId: string,
    private worktreePath: string,
    options?: ConnectOpts
  ) {
    this.connectOptions = options;
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

  async executeTask(task: Task): Promise<TaskExecutionResult> {
    if (!this.initialized) {
      throw new Error('Task sandbox not initialized');
    }

    const startTime = Date.now();
    
    try {
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
          }
        }
      });

      // Execute the task based on its type and content
      const result = await this.executeTaskLogic(task);

      // Log task completion
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: result.success ? 'task.execution.completed' : 'task.execution.failed',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          taskId: this.taskId,
          success: result.success,
          duration: Date.now() - startTime,
          output: result.output.substring(0, 1000), // Truncate for logging
          error: result.error,
          artifacts: result.artifacts
        }
      });

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Log task failure
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'task.execution.error',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          taskId: this.taskId,
          error: errorMessage,
          duration: Date.now() - startTime
        }
      });

      return {
        success: false,
        output: '',
        error: errorMessage,
        artifacts: { files: [], commits: [] }
      };
    }
  }

  private async executeTaskLogic(task: Task): Promise<TaskExecutionResult> {
    if (!this.initialized) {
      throw new Error('Task sandbox not initialized');
    }

    return await this.withDaggerClient(async (client) => {
      const container = this.createTaskContainer(client, 'task-agent');
      
      const artifacts: { files: string[], commits: string[] } = { files: [], commits: [] };
      let output = '';

      try {
        // 1. Analyze the task and determine what to do
        const analysisResult = await container
          .withExec([
            "sh", "-c",
            `echo "Analyzing task: ${task.title}"` +
            `&& echo "Description: ${task.description}"` +
            `&& echo "File scope: ${task.fileScope?.join(', ') || 'all files'}"` +
            `&& ls -la`
          ])
          .stdout();

        output += `=== Task Analysis ===\n${analysisResult}\n\n`;

        // 2. Check git status before starting
        const gitStatusBefore = await container
          .withExec(["git", "status", "--porcelain"])
          .stdout();

        output += `=== Git Status Before ===\n${gitStatusBefore}\n\n`;

        // 3. Simulate task execution (for now, just create a placeholder file)
        // In a real implementation, this would invoke AI agents or execute specific commands
        const taskResult = await container
          .withExec([
            "sh", "-c",
            `echo "# Task: ${task.title}" > TASK_${this.taskId}.md` +
            `&& echo "" >> TASK_${this.taskId}.md` +
            `&& echo "${task.description}" >> TASK_${this.taskId}.md` +
            `&& echo "" >> TASK_${this.taskId}.md` +
            `&& echo "Status: In Progress" >> TASK_${this.taskId}.md` +
            `&& echo "File created successfully"`
          ])
          .stdout();

        output += `=== Task Execution ===\n${taskResult}\n\n`;

        // 4. Check for changes and commit if any
        const gitStatusAfter = await container
          .withExec(["git", "status", "--porcelain"])
          .stdout();

        output += `=== Git Status After ===\n${gitStatusAfter}\n\n`;

        if (gitStatusAfter.trim()) {
          // There are changes, commit them
          const commitResult = await container
            .withExec(["git", "add", "."])
            .withExec(["git", "commit", "-m", `Task ${this.taskId}: ${task.title}`])
            .withExec(["git", "rev-parse", "HEAD"])
            .stdout();

          const commitHash = commitResult.trim();
          artifacts.commits.push(commitHash);
          
          output += `=== Commit Created ===\n${commitHash}\n\n`;
        }

        // 5. List modified files
        const modifiedFiles = await container
          .withExec(["find", ".", "-name", `TASK_${this.taskId}.md`, "-type", "f"])
          .stdout();

        if (modifiedFiles.trim()) {
          artifacts.files = modifiedFiles.trim().split('\n').filter(f => f.trim());
          output += `=== Modified Files ===\n${artifacts.files.join('\n')}\n\n`;
        }

        return {
          success: true,
          output,
          artifacts
        };

      } catch (error) {
        throw new Error(`Task execution failed: ${error instanceof Error ? error.message : error}`);
      }
    });
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
    // Map agent types to Docker images
    const imageMap: Record<string, string> = {
      'task-agent': 'ubuntu:22.04',
      'code-agent': 'node:18-alpine',
      'python-agent': 'python:3.11-slim',
      'review-agent': 'ubuntu:22.04'
    };

    return imageMap[agentType] || 'ubuntu:22.04';
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
      .withEnvVariable("AGENT_TYPE", agentType);
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}