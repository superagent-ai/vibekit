import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TelemetryService } from "@vibe-kit/telemetry";
import { tmpdir } from "os";
import { join } from "path";
import { rm } from "fs/promises";

// Mock VibeKit for testing telemetry integration
class MockVibeKit {
  private telemetryService: TelemetryService;
  private sessions = new Map<string, any>();
  
  constructor(config: { telemetry: { enabled: boolean; service: TelemetryService } }) {
    this.telemetryService = config.telemetry.service;
  }
  
  async startSession(config: { agentType: string; mode: string; prompt: string }) {
    const sessionId = await this.telemetryService.trackStart(
      config.agentType,
      config.mode,
      config.prompt
    );
    this.sessions.set(sessionId, { ...config, sessionId });
    return { sessionId };
  }
  
  async streamChunk(sessionId: string, chunk: string) {
    await this.telemetryService.track({
      sessionId,
      eventType: 'stream',
      category: this.sessions.get(sessionId)?.agentType || 'unknown',
      action: this.sessions.get(sessionId)?.mode || 'unknown',
      metadata: { chunk }
    });
  }
  
  async trackError(sessionId: string, error: Error) {
    await this.telemetryService.trackError(sessionId, error);
  }
  
  async endSession(sessionId: string, status: string) {
    await this.telemetryService.trackEnd(sessionId, status);
    this.sessions.delete(sessionId);
  }
  
  async shutdown() {
    // Cleanup
  }
}

describe("VibeKit SDK + Telemetry Integration", () => {
  let vibekit: MockVibeKit;
  let telemetryService: TelemetryService;
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for test files
    tempDir = join(tmpdir(), `vibekit-telemetry-test-${Date.now()}`);
    
    // Initialize telemetry service with memory provider for testing
    telemetryService = new TelemetryService({
      serviceName: 'vibekit-integration-test',
      serviceVersion: '1.0.0',
      storage: [{
        type: 'memory',
        enabled: true,
      }],
      analytics: {
        enabled: true
      }
    });
    await telemetryService.initialize();
    
    // Initialize MockVibeKit with telemetry enabled
    vibekit = new MockVibeKit({
      telemetry: {
        enabled: true,
        service: telemetryService
      }
    });
  });

  afterEach(async () => {
    await vibekit.shutdown();
    await telemetryService.shutdown();
    
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Session Lifecycle Tracking", () => {
    it("should track session start and end events", async () => {
      // Start a session
      const { sessionId } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'chat',
        prompt: 'Test prompt for integration'
      });
      
      expect(sessionId).toBeTruthy();
      
      // Query telemetry events
      const startEvents = await telemetryService.query({ 
        sessionId,
        eventType: 'start' 
      });
      
      expect(startEvents).toHaveLength(1);
      expect(startEvents[0].category).toBe('claude');
      expect(startEvents[0].action).toBe('chat');
      expect(startEvents[0].label).toBe('Test prompt for integration');
      
      // End the session
      await vibekit.endSession(sessionId, 'completed');
      
      // Query end events
      const endEvents = await telemetryService.query({ 
        sessionId,
        eventType: 'end' 
      });
      
      expect(endEvents).toHaveLength(1);
      expect(endEvents[0].label).toBe('completed');
    });

    it("should track streaming events", async () => {
      const { sessionId } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'chat',
        prompt: 'Stream test'
      });
      
      // Simulate streaming
      const chunks = ['Hello', ' world', '!'];
      for (const chunk of chunks) {
        await vibekit.streamChunk(sessionId, chunk);
      }
      
      // Query stream events
      const streamEvents = await telemetryService.query({ 
        sessionId,
        eventType: 'stream' 
      });
      
      expect(streamEvents).toHaveLength(3);
      streamEvents.forEach((event, index) => {
        expect(event.metadata?.chunk).toBe(chunks[index]);
      });
    });

    it("should track error events", async () => {
      const { sessionId } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'chat',
        prompt: 'Error test'
      });
      
      // Simulate an error
      const error = new Error('Test error');
      await vibekit.trackError(sessionId, error);
      
      // Query error events
      const errorEvents = await telemetryService.query({ 
        sessionId,
        eventType: 'error' 
      });
      
      expect(errorEvents).toHaveLength(1);
      expect(errorEvents[0].label).toContain('Test error');
      expect(errorEvents[0].metadata?.error).toBeDefined();
    });
  });

  describe("Metrics and Analytics", () => {
    it("should provide accurate metrics after multiple sessions", async () => {
      // Create multiple sessions
      const sessionIds: string[] = [];
      
      for (let i = 0; i < 5; i++) {
        const { sessionId } = await vibekit.startSession({
          agentType: i % 2 === 0 ? 'claude' : 'gemini',
          mode: 'chat',
          prompt: `Test session ${i}`
        });
        
        sessionIds.push(sessionId);
        
        // Add some stream events
        for (let j = 0; j < 3; j++) {
          await vibekit.streamChunk(sessionId, `Chunk ${j}`);
        }
        
        // End session
        await vibekit.endSession(sessionId, 'completed');
      }
      
      // Get metrics
      const metrics = await telemetryService.getMetrics();
      
      expect(metrics.events.total).toBeGreaterThan(0);
      expect(metrics.events.byType.start).toBe(5);
      expect(metrics.events.byType.stream).toBe(15);
      expect(metrics.events.byType.end).toBe(5);
      expect(metrics.events.byCategory.claude).toBe(9); // 3 sessions * 3 events per session
      expect(metrics.events.byCategory.gemini).toBe(6); // 2 sessions * 3 events per session
    });

    it("should generate insights from telemetry data", async () => {
      // Create a session with error
      const { sessionId } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'code',
        prompt: 'Generate function'
      });
      
      await vibekit.trackError(sessionId, new Error('Syntax error'));
      await vibekit.endSession(sessionId, 'failed');
      
      // Get insights
      const insights = await telemetryService.getInsights();
      
      expect(insights).toBeDefined();
      expect(insights.metrics).toBeDefined();
      expect(insights.metrics.performance.errorRate).toBeGreaterThan(0);
    });
  });

  describe("Export Integration", () => {
    it("should export telemetry data in different formats", async () => {
      // Create some test data
      const { sessionId } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'chat',
        prompt: 'Export test'
      });
      
      await vibekit.streamChunk(sessionId, 'Test data');
      await vibekit.endSession(sessionId, 'completed');
      
      // Export as JSON
      const jsonExport = await telemetryService.export({ type: 'json' });
      expect(jsonExport).toBeTruthy();
      const jsonData = JSON.parse(jsonExport);
      expect(jsonData.events).toBeDefined();
      expect(jsonData.events.length).toBeGreaterThan(0);
      
      // Export as CSV
      const csvExport = await telemetryService.export({ type: 'csv' });
      expect(csvExport).toBeTruthy();
      expect(csvExport).toContain('id,sessionId,eventType');
      expect(csvExport.split('\n').length).toBeGreaterThan(2);
    });
  });

  describe("Real-time Streaming", () => {
    it("should support real-time telemetry updates", async () => {
      let eventCount = 0;
      
      // Subscribe to telemetry events
      telemetryService.on('event', (event) => {
        eventCount++;
      });
      
      // Create a session and generate events
      const { sessionId } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'chat',
        prompt: 'Real-time test'
      });
      
      await vibekit.streamChunk(sessionId, 'Chunk 1');
      await vibekit.streamChunk(sessionId, 'Chunk 2');
      await vibekit.endSession(sessionId, 'completed');
      
      // Wait a bit for events to be processed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(eventCount).toBe(4); // start + 2 streams + end
    });
  });

  describe("Error Handling", () => {
    it("should handle telemetry service failures gracefully", async () => {
      // Shutdown telemetry service to simulate failure
      await telemetryService.shutdown();
      
      // VibeKit should still work without telemetry
      const { sessionId } = await vibekit.startSession({
        agentType: 'claude',
        mode: 'chat',
        prompt: 'Telemetry failure test'
      });
      
      expect(sessionId).toBeTruthy();
      
      // Operations should succeed even with telemetry down
      await expect(vibekit.streamChunk(sessionId, 'Test')).resolves.not.toThrow();
      await expect(vibekit.endSession(sessionId, 'completed')).resolves.not.toThrow();
    });
  });
});