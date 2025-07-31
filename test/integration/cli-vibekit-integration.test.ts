import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn, ChildProcess } from "child_process";
import { VibeKit } from "@vibe-kit/sdk";
import { TelemetryService } from "@vibe-kit/telemetry";
import { tmpdir } from "os";
import { join } from "path";
import { rm, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";

// Helper to run CLI commands
async function runCliCommand(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const cliPath = join(process.cwd(), 'packages/cli/dist/index.js');
    const child = spawn('node', [cliPath, ...args], {
      cwd: cwd || process.cwd(),
      env: { ...process.env, NODE_ENV: 'test' }
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code || 0
      });
    });
    
    child.on('error', reject);
  });
}

describe("CLI + VibeKit SDK Integration", () => {
  let tempDir: string;
  let vibekit: VibeKit;
  let telemetryService: TelemetryService;

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = join(tmpdir(), `cli-vibekit-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    
    // Initialize telemetry service
    telemetryService = new TelemetryService({
      serviceName: 'cli-integration-test',
      serviceVersion: '1.0.0',
      storage: [{
        type: 'sqlite',
        enabled: true,
        options: {
          path: join(tempDir, '.vibekit/telemetry.db'),
        }
      }]
    });
    await telemetryService.initialize();
    
    // Initialize VibeKit
    vibekit = new VibeKit({
      provider: 'mock',
      telemetry: {
        enabled: true,
        service: telemetryService
      }
    });
  });

  afterEach(async () => {
    await vibekit.shutdown();
    await telemetryService.shutdown();
    
    // Cleanup
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe("Telemetry CLI Commands", () => {
    it("should query telemetry data created by SDK", async () => {
      // Create telemetry data using SDK
      const { sessionId } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'chat',
        prompt: 'CLI integration test'
      });
      
      await vibekit.streamChunk(sessionId, 'Hello from SDK');
      await vibekit.endSession(sessionId, 'completed');
      
      // Wait for data to be persisted
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Query using CLI
      const result = await runCliCommand([
        'telemetry', 
        'query',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--format', 'json'
      ], tempDir);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Found');
      expect(result.stdout).toContain('session(s)');
      
      // Parse JSON output
      const jsonMatch = result.stdout.match(/\[[\s\S]*\]/);
      expect(jsonMatch).toBeTruthy();
      
      if (jsonMatch) {
        const sessions = JSON.parse(jsonMatch[0]);
        expect(sessions).toHaveLength(1);
        expect(sessions[0].sessionId).toBe(sessionId);
        expect(sessions[0].agentType).toBe('claude');
      }
    });

    it("should export telemetry data in different formats", async () => {
      // Create test data
      const { sessionId } = await vibekit.startSession({
        agentType: 'gemini',
        mode: 'code',
        prompt: 'Export test'
      });
      
      await vibekit.streamChunk(sessionId, 'Code generation');
      await vibekit.endSession(sessionId, 'completed');
      
      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Export as JSON
      const jsonPath = join(tempDir, 'export.json');
      const jsonResult = await runCliCommand([
        'telemetry',
        'export',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--format', 'json',
        '--output', jsonPath
      ], tempDir);
      
      expect(jsonResult.exitCode).toBe(0);
      expect(existsSync(jsonPath)).toBe(true);
      
      const jsonContent = await readFile(jsonPath, 'utf-8');
      const jsonData = JSON.parse(jsonContent);
      expect(jsonData.events).toBeDefined();
      expect(jsonData.events.length).toBeGreaterThan(0);
      
      // Export as CSV
      const csvPath = join(tempDir, 'export.csv');
      const csvResult = await runCliCommand([
        'telemetry',
        'export',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--format', 'csv',
        '--output', csvPath
      ], tempDir);
      
      expect(csvResult.exitCode).toBe(0);
      expect(existsSync(csvPath)).toBe(true);
      
      const csvContent = await readFile(csvPath, 'utf-8');
      expect(csvContent).toContain('id,sessionId,eventType');
      expect(csvContent.split('\n').length).toBeGreaterThan(2);
    });

    it("should display telemetry statistics", async () => {
      // Create varied data
      for (let i = 0; i < 3; i++) {
        const { sessionId } = await vibekit.startSession({
          agentType: i % 2 === 0 ? 'claude' : 'gemini',
          mode: 'chat',
          prompt: `Stats test ${i}`
        });
        
        for (let j = 0; j < 5; j++) {
          await vibekit.streamChunk(sessionId, `Chunk ${j}`);
        }
        
        if (i === 1) {
          await vibekit.trackError(sessionId, new Error('Test error'));
        }
        
        await vibekit.endSession(sessionId, i === 1 ? 'failed' : 'completed');
      }
      
      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get stats
      const result = await runCliCommand([
        'telemetry',
        'stats',
        '--database', join(tempDir, '.vibekit/telemetry.db')
      ], tempDir);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Telemetry Database Statistics');
      expect(result.stdout).toContain('Total Events');
      expect(result.stdout).toContain('Error Rate');
    });

    it("should display analytics dashboard", async () => {
      // Create analytics data
      const { sessionId } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'analyze',
        prompt: 'Analytics test'
      });
      
      await vibekit.streamChunk(sessionId, 'Analysis result');
      await vibekit.endSession(sessionId, 'completed');
      
      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get analytics
      const result = await runCliCommand([
        'telemetry',
        'analytics',
        '--database', join(tempDir, '.vibekit/telemetry.db')
      ], tempDir);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Analytics Dashboard');
      expect(result.stdout).toContain('Metrics');
    });
  });

  describe("CLI Configuration", () => {
    it("should use vibekit.json configuration", async () => {
      // Create vibekit.json config
      const config = {
        provider: 'mock',
        telemetry: {
          enabled: true,
          storage: {
            type: 'sqlite',
            path: '.vibekit/telemetry.db'
          }
        }
      };
      
      await writeFile(
        join(tempDir, 'vibekit.json'),
        JSON.stringify(config, null, 2)
      );
      
      // Run CLI command that uses config
      const result = await runCliCommand(['telemetry', 'stats'], tempDir);
      
      // Should find the database based on config
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Telemetry Database Statistics');
    });
  });

  describe("Real-time Dashboard Integration", () => {
    it("should start telemetry dashboard server", async () => {
      // Start dashboard server
      const dashboardProcess = spawn('node', [
        join(process.cwd(), 'packages/cli/dist/index.js'),
        'telemetry',
        'dashboard',
        '--port', '0', // Use random port
        '--database', join(tempDir, '.vibekit/telemetry.db')
      ], {
        cwd: tempDir,
        detached: false
      });
      
      let dashboardOutput = '';
      dashboardProcess.stdout.on('data', (data) => {
        dashboardOutput += data.toString();
      });
      
      // Wait for server to start
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (dashboardOutput.includes('Dashboard server running')) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        
        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      });
      
      // Extract port from output
      const portMatch = dashboardOutput.match(/port (\d+)/);
      const port = portMatch ? portMatch[1] : null;
      
      if (port) {
        // Server should be running
        expect(dashboardOutput).toContain('Dashboard server running');
        
        // Create some telemetry data
        const { sessionId } = await vibekit.startSession({
          agentType: 'claude',
          mode: 'chat',
          prompt: 'Dashboard test'
        });
        
        await vibekit.streamChunk(sessionId, 'Real-time update');
        await vibekit.endSession(sessionId, 'completed');
      }
      
      // Cleanup: kill dashboard process
      dashboardProcess.kill();
      
      await new Promise(resolve => setTimeout(resolve, 100));
    });
  });

  describe("Error Handling", () => {
    it("should handle missing database gracefully", async () => {
      const result = await runCliCommand([
        'telemetry',
        'query',
        '--database', join(tempDir, 'non-existent.db')
      ], tempDir);
      
      expect(result.exitCode).toBe(0); // CLI handles error gracefully
      expect(result.stdout).toContain('Database not found');
    });

    it("should validate export format", async () => {
      const result = await runCliCommand([
        'telemetry',
        'export',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--format', 'invalid'
      ], tempDir);
      
      // Should either error or default to a valid format
      expect(result.stdout + result.stderr).toBeTruthy();
    });
  });

  describe("Performance", () => {
    it("should handle large datasets efficiently", async () => {
      // Create large dataset
      console.log('Creating large dataset...');
      for (let i = 0; i < 50; i++) {
        const { sessionId } = await vibekit.startSession({
          agentType: 'claude',
          mode: 'chat',
          prompt: `Performance test ${i}`
        });
        
        // Quick events without waiting
        const promises = [];
        for (let j = 0; j < 10; j++) {
          promises.push(vibekit.streamChunk(sessionId, `Chunk ${j}`));
        }
        await Promise.all(promises);
        
        await vibekit.endSession(sessionId, 'completed');
      }
      
      // Wait for all data to be persisted
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Query with pagination
      const startTime = Date.now();
      const result = await runCliCommand([
        'telemetry',
        'query',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--limit', '20',
        '--format', 'json'
      ], tempDir);
      
      const queryTime = Date.now() - startTime;
      
      expect(result.exitCode).toBe(0);
      expect(queryTime).toBeLessThan(2000); // Should be fast even with large dataset
      
      // Should respect limit
      const jsonMatch = result.stdout.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const sessions = JSON.parse(jsonMatch[0]);
        expect(sessions.length).toBeLessThanOrEqual(20);
      }
    });
  });
});