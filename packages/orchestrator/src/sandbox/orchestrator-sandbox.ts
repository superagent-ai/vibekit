import { connect, close, type ConnectOpts } from "@dagger.io/dagger";
import type { Client, Container, Directory } from "@dagger.io/dagger";
import { JSONStateStore } from '../storage/json-state-store';
import { JSONLEventStore } from '../storage/jsonl-event-store';

export interface SandboxVolumes {
  workspace: string;
  gitCache: string;
  state: string;
  agentCache: string;
}

export interface SandboxOptions {
  sessionId: string;
  volumes: SandboxVolumes;
  repoUrl?: string;
}

export class OrchestratorSandbox {
  private stateStore = new JSONStateStore();
  private eventStore = new JSONLEventStore();
  private sessionId: string;
  private volumes: SandboxVolumes;
  private initialized = false;
  private connectOptions?: ConnectOpts;

  constructor(options: SandboxOptions) {
    this.sessionId = options.sessionId;
    this.volumes = options.volumes;
  }

  async initialize(repoUrl?: string, options?: ConnectOpts): Promise<void> {
    if (this.initialized) {
      throw new Error('Sandbox already initialized');
    }

    this.connectOptions = options;
    this.initialized = true;

    try {
      // Test Dagger connection and setup master container
      await this.withDaggerClient(async (client) => {
        // Create persistent cache volumes
        const workspaceCache = client.cacheVolume(this.volumes.workspace);
        const gitCache = client.cacheVolume(this.volumes.gitCache);
        const stateCache = client.cacheVolume(this.volumes.state);
        const agentCache = client.cacheVolume(this.volumes.agentCache);
        
        // Use VibeKit CLI image with all agents pre-installed (Claude, Codex, Gemini, OpenCode, Grok)
        const masterContainer = client
          .container()
          .from(process.env.VIBEKIT_SANDBOX_IMAGE || "joedanziger/vibekit-sandbox:latest")
          // Mount persistent volumes
          .withMountedCache("/workspace", workspaceCache)
          .withMountedCache("/git-cache", gitCache)
          .withMountedCache("/state", stateCache)
          .withMountedCache("/agent-cache", agentCache)
          // Set environment variables
          .withEnvVariable("SESSION_ID", this.sessionId)
          .withEnvVariable("VIBEKIT_SANDBOX_ACTIVE", "1")
          .withWorkdir("/workspace");

        // Clone repository if provided
        if (repoUrl) {
          await this.ensureRepositoryClonedWithClient(client, masterContainer, repoUrl);
        }

        // Test container sync to ensure everything works
        await masterContainer.sync();
      });

      // Log initialization
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'sandbox.initialized',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { repoUrl: repoUrl || null, volumes: this.volumes }
      });

      console.log(`🐳 Dagger sandbox initialized for session ${this.sessionId}`);

    } catch (error) {
      this.initialized = false;
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'sandbox.error',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { error: error instanceof Error ? error.message : String(error) }
      });
      
      throw new Error(`Failed to initialize sandbox: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async ensureRepositoryClonedWithClient(client: Client, masterContainer: Container, repoUrl: string): Promise<void> {
    try {
      // Check if repo already exists
      try {
        await masterContainer
          .withExec(["test", "-d", "/workspace/main/.git"])
          .sync();

        console.log('📦 Repository already exists, pulling latest changes...');
        
        // If exists, just pull latest
        await masterContainer
          .withExec(["sh", "-c", "cd /workspace/main && git pull origin main || true"])
          .sync();

      } catch {
        // Repository doesn't exist, clone it
        console.log(`📦 Cloning repository: ${repoUrl}`);
        
        await masterContainer
          .withExec([
            "git", "clone", 
            repoUrl, 
            "/workspace/main"
          ])
          .sync();
      }

      // Log repository setup
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'repository.ready',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { repoUrl, path: '/workspace/main' }
      });
    } catch (error) {
      throw new Error(`Failed to setup repository: ${error instanceof Error ? error.message : error}`);
    }
  }

  async createWorktree(taskId: string, baseBranch: string = 'main'): Promise<string> {
    if (!this.initialized) {
      throw new Error('Sandbox not initialized');
    }

    const worktreePath = `/workspace/tasks/${taskId}`;
    const branchName = `task/${taskId}`;

    try {
      await this.withDaggerClient(async (client) => {
        // Create master container for this operation
        const masterContainer = this.createMasterContainer(client);
        
        // Create worktree with new branch
        await masterContainer
          .withExec([
            "sh", "-c",
            `cd /workspace/main && git worktree add ${worktreePath} -b ${branchName} ${baseBranch}`
          ])
          .sync();
      });

      // Log worktree creation
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'worktree.created',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { taskId, branch: branchName, path: worktreePath, baseBranch }
      });

      console.log(`🌳 Created worktree for task ${taskId} at ${worktreePath}`);
      return worktreePath;

    } catch (error) {
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'worktree.error',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { 
          taskId, 
          error: error instanceof Error ? error.message : String(error) 
        }
      });
      
      throw new Error(`Failed to create worktree for task ${taskId}: ${error instanceof Error ? error.message : error}`);
    }
  }

  async withTaskContainer<T>(taskId: string, worktreePath: string, callback: (container: Container) => Promise<T>): Promise<T> {
    if (!this.initialized) {
      throw new Error('Sandbox not initialized');
    }

    return await this.withDaggerClient(async (client) => {
      // Create task-specific container
      const taskContainer = client
        .container()
        .from(process.env.VIBEKIT_SANDBOX_IMAGE || "joedanziger/vibekit-sandbox:latest")
        // Mount the specific worktree
        .withDirectory("/code", client.host().directory(worktreePath))
        .withWorkdir("/code")
        // Set environment variables
        .withEnvVariable("TASK_ID", taskId)
        .withEnvVariable("SESSION_ID", this.sessionId)
        .withEnvVariable("VIBEKIT_SANDBOX_ACTIVE", "1");

      // Log task container creation
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'container.created',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: { taskId, worktreePath }
      });

      return await callback(taskContainer);
    });
  }

  async executeCommand(taskId: string, worktreePath: string, command: string[]): Promise<string> {
    return await this.withTaskContainer(taskId, worktreePath, async (container) => {
      try {
        const result = await container
          .withExec(command)
          .stdout();

        // Log command execution
        await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
          id: this.generateEventId(),
          type: 'command.executed',
          timestamp: new Date().toISOString(),
          sessionId: this.sessionId,
          data: { 
            command: command.join(' '),
            success: true,
            output: result.substring(0, 1000) // Truncate long output
          }
        });

        return result;

      } catch (error) {
        // Log command failure
        await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
          id: this.generateEventId(),
          type: 'command.failed',
          timestamp: new Date().toISOString(),
          sessionId: this.sessionId,
          data: { 
            command: command.join(' '),
            error: error instanceof Error ? error.message : String(error)
          }
        });

        throw error;
      }
    });
  }

  async cleanup(): Promise<void> {
    try {
      // Close any active Dagger connections
      close();
      
      // Log cleanup
      await this.eventStore.appendEvent(`sessions/${this.sessionId}`, {
        id: this.generateEventId(),
        type: 'sandbox.cleanup',
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        data: {}
      });

      console.log(`🧹 Cleaned up sandbox for session ${this.sessionId}`);

    } catch (error) {
      console.error('Error during sandbox cleanup:', error);
    } finally {
      this.initialized = false;
      await this.eventStore.close();
    }
  }

  // Getters for status
  get isInitialized(): boolean {
    return this.initialized;
  }

  get sessionInfo() {
    return {
      sessionId: this.sessionId,
      volumes: this.volumes,
      initialized: this.initialized
    };
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

  private createMasterContainer(client: Client): Container {
    // Create persistent cache volumes
    const workspaceCache = client.cacheVolume(this.volumes.workspace);
    const gitCache = client.cacheVolume(this.volumes.gitCache);
    const stateCache = client.cacheVolume(this.volumes.state);
    const agentCache = client.cacheVolume(this.volumes.agentCache);
    
    // Master orchestrator container
    return client
      .container()
      .from(process.env.VIBEKIT_SANDBOX_IMAGE || "joedanziger/vibekit-sandbox:latest")
      // Mount persistent volumes
      .withMountedCache("/workspace", workspaceCache)
      .withMountedCache("/git-cache", gitCache)
      .withMountedCache("/state", stateCache)
      .withMountedCache("/agent-cache", agentCache)
      // Set environment variables
      .withEnvVariable("SESSION_ID", this.sessionId)
      .withEnvVariable("VIBEKIT_SANDBOX_ACTIVE", "1")
      .withWorkdir("/workspace");
  }

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}