import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VibeKit } from "@vibe-kit/sdk";
import { DaggerSandboxProvider } from "@vibe-kit/dagger";
import { E2BSandboxProvider } from "@vibe-kit/e2b";
import type { LocalSandboxProvider, Sandbox } from "@vibe-kit/sdk";

// Mock implementation for testing
class MockSandboxProvider implements LocalSandboxProvider {
  name = 'mock' as const;
  private sandboxes = new Map<string, MockSandbox>();
  
  async create(config: any): Promise<Sandbox> {
    const sandbox = new MockSandbox(config);
    this.sandboxes.set(sandbox.id, sandbox);
    return sandbox;
  }
  
  async get(id: string): Promise<Sandbox | null> {
    return this.sandboxes.get(id) || null;
  }
  
  async list(): Promise<Sandbox[]> {
    return Array.from(this.sandboxes.values());
  }
  
  async destroy(id: string): Promise<void> {
    this.sandboxes.delete(id);
  }
  
  async isHealthy(): Promise<boolean> {
    return true;
  }
}

class MockSandbox implements Sandbox {
  id: string;
  status: 'creating' | 'ready' | 'error' | 'destroyed' = 'ready';
  
  constructor(private config: any) {
    this.id = `mock-${Date.now()}`;
  }
  
  async runCode(code: string, language?: string): Promise<any> {
    return { output: `Mock execution of ${language || 'unknown'}: ${code}`, exitCode: 0 };
  }
  
  async writeFile(path: string, content: string): Promise<void> {
    // Mock implementation
  }
  
  async readFile(path: string): Promise<string> {
    return `Mock content of ${path}`;
  }
  
  async listFiles(path?: string): Promise<string[]> {
    return ['mock-file1.js', 'mock-file2.py'];
  }
  
  async execute(command: string): Promise<any> {
    return { stdout: `Mock execution: ${command}`, stderr: '', exitCode: 0 };
  }
  
  async pause(): Promise<void> {
    this.status = 'creating';
  }
  
  async resume(): Promise<void> {
    this.status = 'ready';
  }
  
  async destroy(): Promise<void> {
    this.status = 'destroyed';
  }
  
  getConnectionInfo(): any {
    return { url: 'mock://localhost', token: 'mock-token' };
  }
}

describe("VibeKit SDK + Sandbox Providers Integration", () => {
  describe("Multiple Provider Support", () => {
    it("should work with mock provider", async () => {
      const vibekit = new VibeKit({
        provider: 'mock',
        telemetry: { enabled: false }
      });
      
      const { sessionId, sandbox } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'code',
        prompt: 'Create a function'
      });
      
      expect(sessionId).toBeTruthy();
      expect(sandbox).toBeDefined();
      expect(sandbox.id).toContain('mock');
      
      // Test sandbox operations
      const result = await sandbox.runCode('console.log("Hello")', 'javascript');
      expect(result.output).toContain('Mock execution');
      
      await vibekit.endSession(sessionId);
      await vibekit.shutdown();
    });

    it("should handle provider switching", async () => {
      // Start with mock provider
      let vibekit = new VibeKit({
        provider: 'mock',
        telemetry: { enabled: false }
      });
      
      const { sessionId: mockSession } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'code',
        prompt: 'Mock provider test'
      });
      
      expect(mockSession).toBeTruthy();
      await vibekit.endSession(mockSession);
      await vibekit.shutdown();
      
      // Switch to another mock instance
      vibekit = new VibeKit({
        provider: new MockSandboxProvider(),
        telemetry: { enabled: false }
      });
      
      const { sessionId: customSession } = await vibekit.startSession({
        agentType: 'gemini',
        mode: 'code',
        prompt: 'Custom provider test'
      });
      
      expect(customSession).toBeTruthy();
      expect(customSession).not.toBe(mockSession);
      
      await vibekit.endSession(customSession);
      await vibekit.shutdown();
    });
  });

  describe("Sandbox Lifecycle Management", () => {
    let vibekit: VibeKit;
    
    beforeEach(() => {
      vibekit = new VibeKit({
        provider: 'mock',
        telemetry: { enabled: false }
      });
    });
    
    afterEach(async () => {
      await vibekit.shutdown();
    });
    
    it("should manage sandbox creation and destruction", async () => {
      const { sessionId, sandbox } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'code',
        prompt: 'Lifecycle test'
      });
      
      expect(sandbox.status).toBe('ready');
      
      // End session should destroy sandbox
      await vibekit.endSession(sessionId);
      
      // Sandbox should be cleaned up
      const activeSandboxes = await vibekit.getActiveSandboxes();
      expect(activeSandboxes).toHaveLength(0);
    });
    
    it("should support pause and resume operations", async () => {
      const { sessionId, sandbox } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'code',
        prompt: 'Pause/resume test'
      });
      
      expect(sandbox.status).toBe('ready');
      
      // Pause sandbox
      await vibekit.pauseSandbox(sessionId);
      expect(sandbox.status).toBe('creating'); // Mock uses 'creating' for paused state
      
      // Resume sandbox
      await vibekit.resumeSandbox(sessionId);
      expect(sandbox.status).toBe('ready');
      
      await vibekit.endSession(sessionId);
    });
    
    it("should handle multiple concurrent sandboxes", async () => {
      const sessions = [];
      
      // Create multiple sessions
      for (let i = 0; i < 3; i++) {
        const session = await vibekit.startSession({
          agentType: 'claude',
          mode: 'code',
          prompt: `Concurrent test ${i}`
        });
        sessions.push(session);
      }
      
      // All sandboxes should be active
      const activeSandboxes = await vibekit.getActiveSandboxes();
      expect(activeSandboxes).toHaveLength(3);
      
      // End all sessions
      for (const { sessionId } of sessions) {
        await vibekit.endSession(sessionId);
      }
      
      // All sandboxes should be cleaned up
      const remainingSandboxes = await vibekit.getActiveSandboxes();
      expect(remainingSandboxes).toHaveLength(0);
    });
  });

  describe("Code Execution Integration", () => {
    let vibekit: VibeKit;
    let sandbox: Sandbox;
    let sessionId: string;
    
    beforeEach(async () => {
      vibekit = new VibeKit({
        provider: 'mock',
        telemetry: { enabled: false }
      });
      
      const session = await vibekit.startSession({
        agentType: 'claude',
        mode: 'code',
        prompt: 'Code execution test'
      });
      
      sessionId = session.sessionId;
      sandbox = session.sandbox;
    });
    
    afterEach(async () => {
      await vibekit.endSession(sessionId);
      await vibekit.shutdown();
    });
    
    it("should execute code in different languages", async () => {
      const languages = ['javascript', 'python', 'bash'];
      
      for (const lang of languages) {
        const result = await sandbox.runCode(`print("Hello from ${lang}")`, lang);
        expect(result.output).toContain(lang);
        expect(result.exitCode).toBe(0);
      }
    });
    
    it("should handle file operations", async () => {
      // Write file
      await sandbox.writeFile('/test.txt', 'Hello World');
      
      // Read file
      const content = await sandbox.readFile('/test.txt');
      expect(content).toBeTruthy();
      
      // List files
      const files = await sandbox.listFiles('/');
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
    });
    
    it("should execute shell commands", async () => {
      const result = await sandbox.execute('echo "Hello from shell"');
      expect(result.stdout).toBeTruthy();
      expect(result.exitCode).toBe(0);
    });
  });

  describe("Error Handling", () => {
    let vibekit: VibeKit;
    
    beforeEach(() => {
      vibekit = new VibeKit({
        provider: 'mock',
        telemetry: { enabled: false }
      });
    });
    
    afterEach(async () => {
      await vibekit.shutdown();
    });
    
    it("should handle sandbox creation failures gracefully", async () => {
      // Override create to simulate failure
      const provider = vibekit['sandboxProvider'] as MockSandboxProvider;
      provider.create = async () => {
        throw new Error('Sandbox creation failed');
      };
      
      await expect(vibekit.startSession({
        agentType: 'claude',
        mode: 'code',
        prompt: 'Failure test'
      })).rejects.toThrow('Sandbox creation failed');
    });
    
    it("should recover from sandbox crashes", async () => {
      const { sessionId, sandbox } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'code',
        prompt: 'Crash test'
      });
      
      // Simulate sandbox crash
      sandbox.status = 'error';
      
      // VibeKit should detect and handle the error
      const status = await vibekit.getSandboxStatus(sessionId);
      expect(status).toBe('error');
      
      // Cleanup should still work
      await expect(vibekit.endSession(sessionId)).resolves.not.toThrow();
    });
  });

  describe("Provider-Specific Features", () => {
    it("should support provider-specific configurations", async () => {
      const customConfig = {
        memory: 2048,
        cpu: 2,
        timeout: 300000
      };
      
      const vibekit = new VibeKit({
        provider: 'mock',
        sandboxConfig: customConfig,
        telemetry: { enabled: false }
      });
      
      const { sandbox } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'code',
        prompt: 'Custom config test'
      });
      
      // Mock provider should receive the custom config
      expect(sandbox).toBeDefined();
      
      await vibekit.shutdown();
    });
  });
});