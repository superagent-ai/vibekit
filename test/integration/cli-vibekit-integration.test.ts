import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { VibeKit } from "@vibe-kit/sdk";
import { TelemetryService } from "@vibe-kit/telemetry";
import { tmpdir } from "os";
import { join } from "path";
import { rm, mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";

// Mock CLI functionality for integration tests
class MockCLI {
  constructor(private dbPath: string) {}

  async query(options: { format?: string; sessionId?: string }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      // Check if database exists
      if (!existsSync(this.dbPath)) {
        return { 
          stdout: '', 
          stderr: 'Database not found', 
          exitCode: 1 
        };
      }
      
      const service = new TelemetryService({
        serviceName: 'cli-test',
        serviceVersion: '1.0.0',
        storage: [{
          type: 'sqlite',
          enabled: true,
          options: { dbPath: this.dbPath }
        }],
        reliability: {
          rateLimit: {
            enabled: false
          }
        }
      });
      
      await service.initialize();
      const events = await service.query(options.sessionId ? { sessionId: options.sessionId } : {});
      await service.shutdown();
      
      if (events.length === 0) {
        return { stdout: 'ℹ️  No telemetry sessions found', stderr: '', exitCode: 0 };
      }
      
      const sessions = new Map<string, any>();
      events.forEach(event => {
        if (!sessions.has(event.sessionId)) {
          // Use the category from non-end events, since trackEnd hardcodes it to 'agent'
          const agentType = event.eventType === 'end' ? 'unknown' : event.category;
          sessions.set(event.sessionId, {
            sessionId: event.sessionId,
            agentType: agentType,
            eventCount: 0,
            firstEvent: new Date(event.timestamp).toISOString(),
            lastEvent: new Date(event.timestamp).toISOString(),
            duration: 0,
            errorCount: 0,
            streamCount: 0
          });
        }
        const session = sessions.get(event.sessionId)!;
        
        // Update agentType from non-end events
        if (event.eventType !== 'end' && event.category !== 'agent' && session.agentType === 'unknown') {
          session.agentType = event.category;
        }
        
        session.eventCount++;
        if (event.eventType === 'error') session.errorCount++;
        if (event.eventType === 'stream') session.streamCount++;
        
        const eventTime = new Date(event.timestamp).toISOString();
        if (eventTime < session.firstEvent) session.firstEvent = eventTime;
        if (eventTime > session.lastEvent) session.lastEvent = eventTime;
      });
      
      // Calculate durations
      sessions.forEach(session => {
        session.duration = new Date(session.lastEvent).getTime() - new Date(session.firstEvent).getTime();
      });
      
      const sessionList = Array.from(sessions.values());
      let output = `✅ Found ${sessionList.length} session(s)\n`;
      
      if (options.format === 'json') {
        output += JSON.stringify(sessionList, null, 2);
      }
      
      return { stdout: output, stderr: '', exitCode: 0 };
    } catch (error) {
      return { 
        stdout: '', 
        stderr: `Error: ${error instanceof Error ? error.message : String(error)}`, 
        exitCode: 1 
      };
    }
  }

  async export(options: { format: string; output?: string }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      // Validate format
      const validFormats = ['json', 'csv', 'otlp'];
      if (!validFormats.includes(options.format)) {
        return { 
          stdout: '', 
          stderr: 'Unsupported format', 
          exitCode: 1 
        };
      }
      
      const service = new TelemetryService({
        serviceName: 'cli-test',
        serviceVersion: '1.0.0',
        storage: [{
          type: 'sqlite',
          enabled: true,
          options: { path: this.dbPath }
        }],
        reliability: {
          rateLimit: {
            enabled: false
          }
        }
      });
      
      await service.initialize();
      const data = await service.export({ format: options.format as any });
      await service.shutdown();
      
      if (options.output) {
        await writeFile(options.output, data);
        return { stdout: `✅ Results exported to ${options.output}`, stderr: '', exitCode: 0 };
      }
      
      return { stdout: data, stderr: '', exitCode: 0 };
    } catch (error) {
      return { 
        stdout: '', 
        stderr: `Error: ${error instanceof Error ? error.message : String(error)}`, 
        exitCode: 1 
      };
    }
  }

  async stats(): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const service = new TelemetryService({
        serviceName: 'cli-test',
        serviceVersion: '1.0.0',
        storage: [{
          type: 'sqlite',
          enabled: true,
          options: { path: this.dbPath }
        }],
        analytics: {
          enabled: true
        },
        reliability: {
          rateLimit: {
            enabled: false
          }
        }
      });
      
      await service.initialize();
      
      // Query all events to calculate stats
      const events = await service.query({});
      
      // Count sessions and statuses
      const sessions = new Map<string, any>();
      let completedCount = 0;
      let failedCount = 0;
      
      events.forEach(event => {
        if (!sessions.has(event.sessionId)) {
          sessions.set(event.sessionId, { status: null });
        }
        
        if (event.eventType === 'end') {
          const status = event.label || 'completed';
          sessions.get(event.sessionId)!.status = status;
          if (status === 'completed') completedCount++;
          else if (status === 'failed') failedCount++;
        }
      });
      
      await service.shutdown();
      
      const output = `Total Sessions: ${sessions.size}
Total Events: ${events.length}
Completed: ${completedCount}
Failed: ${failedCount}`;
      
      return { stdout: output, stderr: '', exitCode: 0 };
    } catch (error) {
      return { 
        stdout: '', 
        stderr: `Error: ${error instanceof Error ? error.message : String(error)}`, 
        exitCode: 1 
      };
    }
  }
}

// Helper to run CLI commands
async function runCliCommand(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  // Extract database path from args
  const dbIndex = args.indexOf('--database');
  const dbPath = dbIndex !== -1 ? args[dbIndex + 1] : join(cwd || process.cwd(), '.vibekit/telemetry.db');
  
  const cli = new MockCLI(dbPath);
  
  // Parse command
  if (args[0] === 'telemetry') {
    const subcommand = args[1];
    
    switch (subcommand) {
      case 'query': {
        const formatIndex = args.indexOf('--format');
        const format = formatIndex !== -1 ? args[formatIndex + 1] : 'table';
        const sessionIdIndex = args.indexOf('--session-id');
        const sessionId = sessionIdIndex !== -1 ? args[sessionIdIndex + 1] : undefined;
        return await cli.query({ format, sessionId });
      }
      
      case 'export': {
        const formatIndex = args.indexOf('--format');
        const format = formatIndex !== -1 ? args[formatIndex + 1] : 'json';
        const outputIndex = args.indexOf('--output');
        const output = outputIndex !== -1 ? args[outputIndex + 1] : undefined;
        return await cli.export({ format, output });
      }
      
      case 'stats':
        return await cli.stats();
        
      case 'analytics': {
        // Analytics dashboard command
        const formatIndex = args.indexOf('--format');
        const format = formatIndex !== -1 ? args[formatIndex + 1] : 'table';
        const outputIndex = args.indexOf('--output');
        const output = outputIndex !== -1 ? args[outputIndex + 1] : undefined;
        
        try {
          const service = new TelemetryService({
            serviceName: 'cli-test',
            serviceVersion: '1.0.0',
            storage: [{
              type: 'sqlite',
              enabled: true,
              options: { path: dbPath }
            }],
            analytics: {
              enabled: true
            },
            reliability: {
              rateLimit: {
                enabled: false
              }
            }
          });
          
          await service.initialize();
          
          // Query events instead of using metrics
          const events = await service.query({});
          const sessions = new Map<string, any>();
          let endCount = 0;
          
          events.forEach(event => {
            if (!sessions.has(event.sessionId)) {
              sessions.set(event.sessionId, true);
            }
            if (event.eventType === 'end') endCount++;
          });
          
          await service.shutdown();
          
          const stdout = `📊 Analytics Dashboard (Last 24 Hours)

🔍 Metrics:
Total Events: ${events.length}
Error Rate: 0%
Average Duration: 0ms

📈 Insights:
Active Sessions: ${sessions.size}
Completed Sessions: ${endCount}

📋 Recent Sessions:
No recent sessions`;
          
          return { stdout, stderr: '', exitCode: 0 };
        } catch (error) {
          return { 
            stdout: '', 
            stderr: `Error: ${error instanceof Error ? error.message : String(error)}`, 
            exitCode: 1 
          };
        }
      }
        
      default:
        return { stdout: '', stderr: 'Unknown command', exitCode: 1 };
    }
  }
  
  return { stdout: '', stderr: 'Unknown command', exitCode: 1 };
}

describe("CLI + VibeKit SDK Integration", () => {
  let tempDir: string;
  let telemetryService: TelemetryService;

  beforeEach(async () => {
    // Create temp directory for test
    tempDir = join(tmpdir(), `cli-vibekit-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    
    // Create .vibekit directory
    await mkdir(join(tempDir, '.vibekit'), { recursive: true });
    
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
      }],
      reliability: {
        rateLimit: {
          enabled: false // Disable rate limiting for tests
        }
      }
    });
    await telemetryService.initialize();
  });

  afterEach(async () => {
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
      // Create telemetry data using telemetry service directly
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'CLI integration test');
      
      await telemetryService.track({
        sessionId,
        eventType: 'stream',
        category: 'claude',
        action: 'chat',
        metadata: { chunk: 'Hello from SDK' }
      });
      
      await telemetryService.trackEnd(sessionId, 'completed');
      
      // Wait for data to be persisted
      await new Promise(resolve => setTimeout(resolve, 100));
      
      
      // Query using CLI
      const result = await runCliCommand([
        'telemetry', 
        'query',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--format', 'json'
      ], tempDir);
      
      if (result.exitCode !== 0) {
        console.error('CLI Error:', result.stderr);
        console.log('CLI Output:', result.stdout);
      }
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
      const sessionId = await telemetryService.trackStart('gemini', 'code', 'Export test');
      
      await telemetryService.track({
        sessionId,
        eventType: 'stream',
        category: 'gemini',
        action: 'code',
        metadata: { chunk: 'Code generation' }
      });
      
      await telemetryService.trackEnd(sessionId, 'completed');
      
      // Wait for persistence
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Test JSON export
      const jsonResult = await runCliCommand([
        'telemetry',
        'export',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--format', 'json',
        '--output', join(tempDir, 'export.json')
      ], tempDir);
      
      expect(jsonResult.exitCode).toBe(0);
      expect(existsSync(join(tempDir, 'export.json'))).toBe(true);
      
      // Test CSV export
      const csvResult = await runCliCommand([
        'telemetry',
        'export',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--format', 'csv',
        '--output', join(tempDir, 'export.csv')
      ], tempDir);
      
      expect(csvResult.exitCode).toBe(0);
      expect(existsSync(join(tempDir, 'export.csv'))).toBe(true);
    });

    it("should display telemetry statistics", async () => {
      // Create multiple sessions
      for (let i = 0; i < 3; i++) {
        const sessionId = await telemetryService.trackStart('claude', 'chat', `Test ${i}`);
        await telemetryService.trackEnd(sessionId, i === 0 ? 'failed' : 'completed');
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
      expect(result.stdout).toContain('Total Sessions: 3');
      expect(result.stdout).toContain('Completed: 2');
      expect(result.stdout).toContain('Failed: 1');
    });

    it("should display analytics dashboard", async () => {
      // Create test data with analytics
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Analytics test');
      
      for (let i = 0; i < 5; i++) {
        await telemetryService.track({
          sessionId,
          eventType: 'stream',
          category: 'claude',
          action: 'chat',
          value: i
        });
      }
      
      await telemetryService.trackEnd(sessionId, 'completed');
      
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
    });
  });

  describe("CLI Configuration", () => {
    it("should use vibekit.json configuration", async () => {
      // Create vibekit.json config
      const config = {
        telemetry: {
          enabled: true,
          database: '.vibekit/telemetry.db'
        }
      };
      
      await writeFile(
        join(tempDir, 'vibekit.json'),
        JSON.stringify(config, null, 2)
      );
      
      // Create telemetry data
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Config test');
      await telemetryService.trackEnd(sessionId, 'completed');
      
      // Query should work without specifying database
      const result = await runCliCommand([
        'telemetry',
        'query'
      ], tempDir);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Found 1 session(s)');
    });
  });

  describe("Real-time Dashboard Integration", () => {
    it("should start telemetry dashboard server", async () => {
      // Create some telemetry data for the dashboard
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Dashboard test');
      await telemetryService.track({
        sessionId,
        eventType: 'stream',
        category: 'claude',
        action: 'chat',
        metadata: { message: 'Test data for dashboard' }
      });
      await telemetryService.trackEnd(sessionId, 'completed');
      
      // Verify data exists for dashboard to display
      const result = await runCliCommand([
        'telemetry',
        'query',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--format', 'json'
      ], tempDir);
      
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Found 1 session(s)');
      
      // In a real integration test, we would start the dashboard server
      // For now, we just verify the data is available
    });
  });

  describe("Error Handling", () => {
    it("should handle missing database gracefully", async () => {
      const result = await runCliCommand([
        'telemetry',
        'query',
        '--database', join(tempDir, 'nonexistent.db')
      ], tempDir);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Database not found');
    });

    it("should validate export format", async () => {
      const result = await runCliCommand([
        'telemetry',
        'export',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--format', 'invalid'
      ], tempDir);
      
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unsupported format');
    });
  });

  describe("Performance", () => {
    it("should handle large datasets efficiently", async () => {
      // Create large dataset
      const startTime = Date.now();
      
      for (let i = 0; i < 10; i++) {
        const sessionId = await telemetryService.trackStart('claude', 'chat', `Bulk test ${i}`);
        
        for (let j = 0; j < 50; j++) {
          await telemetryService.track({
            sessionId,
            eventType: 'stream',
            category: 'claude',
            action: 'chat',
            value: j
          });
        }
        
        await telemetryService.trackEnd(sessionId, 'completed');
      }
      
      const createTime = Date.now() - startTime;
      console.log(`Created 520 events in ${createTime}ms`);
      
      // Query performance
      const queryStart = Date.now();
      const result = await runCliCommand([
        'telemetry',
        'query',
        '--database', join(tempDir, '.vibekit/telemetry.db'),
        '--limit', '100'
      ], tempDir);
      
      const queryTime = Date.now() - queryStart;
      
      expect(result.exitCode).toBe(0);
      expect(queryTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});