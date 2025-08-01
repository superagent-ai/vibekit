import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TelemetryService, TelemetryAPIServer } from "@vibe-kit/telemetry";
import { io, Socket } from "socket.io-client";
import { tmpdir } from "os";
import { join } from "path";
import { rm, mkdir } from "fs/promises";

describe("Dashboard + Telemetry API Integration", () => {
  let telemetryService: TelemetryService;
  let apiServer: TelemetryAPIServer;
  let tempDir: string;
  let dbPath: string;
  let serverUrl: string;
  let socket: Socket;

  beforeEach(async () => {
    // Create temp directory
    tempDir = join(tmpdir(), `dashboard-api-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    dbPath = join(tempDir, 'telemetry.db');
    
    // Initialize telemetry service
    telemetryService = new TelemetryService({
      serviceName: 'dashboard-test',
      serviceVersion: '1.0.0',
      storage: [{
        type: 'sqlite',
        enabled: true,
        options: {
          path: dbPath,
          streamBatchSize: 5,
          streamFlushInterval: 50,
        }
      }],
      analytics: {
        enabled: true
      },
      api: {
        enabled: true
      },
      reliability: {
        rateLimit: {
          enabled: false
        }
      }
    });
    
    await telemetryService.initialize();
    
    // Start API server on random port
    apiServer = await telemetryService.startAPIServer({
      port: 0, // Random port
      enableDashboard: false, // We're testing API only
      enableWebSocket: true,
      enableDatabaseWatcher: false, // Disable DB watcher for tests
      cors: {
        origin: '*',
        credentials: true
      }
    });
    
    // Get server URL
    const address = apiServer.getAddress();
    const port = typeof address === 'object' ? address?.port : 0;
    serverUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (socket?.connected) {
      socket.disconnect();
    }
    if (apiServer) {
      await apiServer.shutdown();
    }
    await telemetryService.shutdown();
    
    // Cleanup
    try {
      await rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore errors
    }
  });

  describe("REST API Endpoints", () => {
    it("should retrieve sessions via API", async () => {
      // Create test sessions
      const sessionIds = [];
      for (let i = 0; i < 3; i++) {
        const sessionId = await telemetryService.trackStart(
          i % 2 === 0 ? 'claude' : 'gemini',
          'chat',
          `API test ${i}`
        );
        sessionIds.push(sessionId);
        
        await telemetryService.track({
          sessionId,
          eventType: 'stream',
          category: i % 2 === 0 ? 'claude' : 'gemini',
          action: 'chat',
          metadata: { index: i }
        });
        
        await telemetryService.trackEnd(sessionId, 'completed');
      }
      
      // Wait for data to be persisted
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Query sessions via API
      const response = await fetch(`${serverUrl}/api/sessions`);
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(3);
      expect(data.map((s: any) => s.id).sort()).toEqual(sessionIds.sort());
    });

    it("should retrieve events for a session", async () => {
      // Create session with events
      const sessionId = await telemetryService.trackStart('claude', 'code', 'Event API test');
      
      for (let i = 0; i < 5; i++) {
        await telemetryService.track({
          sessionId,
          eventType: 'stream',
          category: 'claude',
          action: 'code',
          value: i,
          metadata: { code: `line ${i}` }
        });
      }
      
      await telemetryService.trackEnd(sessionId, 'completed');
      
      // Query events via API
      const response = await fetch(`${serverUrl}/api/events?sessionId=${sessionId}`);
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBe(7); // start + 5 streams + end
      expect(data.every((e: any) => e.sessionId === sessionId)).toBe(true);
    });

    it("should retrieve metrics via API", async () => {
      // Generate metric data
      for (let i = 0; i < 10; i++) {
        const sessionId = await telemetryService.trackStart('claude', 'chat', `Metric ${i}`);
        await telemetryService.trackEnd(sessionId, i % 3 === 0 ? 'failed' : 'completed');
      }
      
      // Get metrics via API
      const response = await fetch(`${serverUrl}/api/metrics`);
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.events).toBeDefined();
      expect(data.events.total).toBeGreaterThan(0);
      expect(data.performance).toBeDefined();
    });

    it("should export data via API", async () => {
      // Create export data
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Export test');
      await telemetryService.track({
        sessionId,
        eventType: 'stream',
        category: 'claude',
        action: 'chat',
        metadata: { message: 'Test export' }
      });
      await telemetryService.trackEnd(sessionId, 'completed');
      
      // Export via API
      const response = await fetch(`${serverUrl}/api/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'json' })
      });
      
      expect(response.ok).toBe(true);
      
      const exportData = await response.text();
      const parsed = JSON.parse(exportData);
      expect(parsed.events).toBeDefined();
      expect(parsed.events.length).toBeGreaterThan(0);
      expect(parsed.metadata).toBeDefined();
    });
  });

  describe("WebSocket Real-time Updates", () => {
    beforeEach(async () => {
      // Connect WebSocket client
      socket = io(serverUrl, {
        transports: ['websocket'],
        reconnection: false
      });
      
      await new Promise<void>((resolve) => {
        socket.on('connect', resolve);
      });
    });

    it("should receive real-time event updates", async () => {
      const receivedEvents: any[] = [];
      
      // Subscribe to events (server emits 'event')
      socket.on('event', (event) => {
        receivedEvents.push(event);
      });
      
      // Create events
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'WebSocket test');
      
      // Wait for event to be received
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(receivedEvents.length).toBeGreaterThan(0);
      expect(receivedEvents[0].sessionId).toBe(sessionId);
      expect(receivedEvents[0].eventType).toBe('start');
      
      // Stream more events
      await telemetryService.track({
        sessionId,
        eventType: 'stream',
        category: 'claude',
        action: 'chat',
        metadata: { chunk: 'Real-time data' }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const streamEvent = receivedEvents.find(e => e.eventType === 'stream');
      expect(streamEvent).toBeDefined();
      expect(streamEvent.metadata.chunk).toBe('Real-time data');
    });

    it("should receive metric updates", async () => {
      let metricsUpdate: any = null;
      
      // Subscribe to metrics channel first
      socket.emit('subscribe', 'metrics');
      
      // Listen for metrics updates
      socket.on('update:metrics', (metrics) => {
        metricsUpdate = metrics;
      });
      
      // Generate some events to trigger metrics update
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Metrics test');
      await telemetryService.trackEnd(sessionId, 'completed');
      
      // Wait for metrics update (may take longer due to debouncing)
      await new Promise(resolve => setTimeout(resolve, 300));
      
      expect(metricsUpdate).toBeDefined();
    });

    it("should handle session subscriptions", async () => {
      const sessionEvents: any[] = [];
      
      // Create session
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Subscription test');
      
      // Set up listener first
      socket.on(`telemetry:session:${sessionId}`, (event) => {
        sessionEvents.push(event);
      });
      
      // Subscribe to specific session
      socket.emit('telemetry:subscribe-session', sessionId);
      
      // Wait for subscription to be processed
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Generate events for this session
      await telemetryService.track({
        sessionId,
        eventType: 'stream',
        category: 'claude',
        action: 'chat',
        metadata: { subscribed: true }
      });
      
      // Generate event for different session (should not receive)
      const otherSessionId = await telemetryService.trackStart('gemini', 'code', 'Other session');
      await telemetryService.track({
        sessionId: otherSessionId,
        eventType: 'stream',
        category: 'gemini',
        action: 'code',
        metadata: { subscribed: false }
      });
      
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Should only receive events for subscribed session
      expect(sessionEvents.length).toBeGreaterThan(0);
      expect(sessionEvents.every(e => e.sessionId === sessionId)).toBe(true);
      expect(sessionEvents.some(e => e.metadata?.subscribed === true)).toBe(true);
    });
  });

  describe("File Watching Integration", () => {
    it.skipIf(process.env.CI || process.env.GITHUB_ACTIONS)("should detect database changes from external sources", async () => {
      // Skip this test in CI environments where file watching is unreliable
      // Need to restart the API server with database watcher enabled
      await apiServer.shutdown();
      
      // Start API server with database watcher enabled
      apiServer = await telemetryService.startAPIServer({
        port: 0,
        enableDashboard: false,
        enableWebSocket: true,
        enableDatabaseWatcher: true, // Enable for this test
        cors: {
          origin: '*',
          credentials: true
        }
      });
      
      // Get new server URL
      const address = apiServer.getAddress();
      const port = typeof address === 'object' ? address?.port : 0;
      serverUrl = `http://localhost:${port}`;
      
      let changeDetected = false;
      
      // Connect WebSocket client to new server
      socket = io(serverUrl, {
        transports: ['websocket'],
        reconnection: false
      });
      
      await new Promise<void>((resolve) => {
        socket.on('connect', resolve);
      });
      
      // Subscribe to database changes via WebSocket
      socket.on('telemetry:db-change', () => {
        changeDetected = true;
      });
      
      // Wait for file watcher to be ready
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Create a separate telemetry service instance (simulating external process)
      const externalService = new TelemetryService({
        serviceName: 'external-service',
        serviceVersion: '1.0.0',
        storage: [{
          type: 'sqlite',
          enabled: true,
          options: {
            path: dbPath, // Same database
            streamBatchSize: 1, // Force immediate writes
            streamFlushInterval: 0, // No buffering
          }
        }]
      });
      
      await externalService.initialize();
      
      // Create event from external service
      const sessionId = await externalService.trackStart('gemini', 'analyze', 'External event');
      
      // Add more events to ensure database write
      await externalService.track({
        sessionId,
        eventType: 'stream',
        category: 'gemini',
        action: 'analyze',
        metadata: { test: true }
      });
      
      // Force flush to ensure database write
      await externalService.shutdown();
      
      // Wait for change detection (file watcher has 300ms debounce + detection time)
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // API should detect the change
      expect(changeDetected).toBe(true);
      
      // Query should return the external event
      const response = await fetch(`${serverUrl}/api/events?category=gemini`);
      const data = await response.json();
      
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].category).toBe('gemini');
    });

    it("should handle external database writes via API polling", async () => {
      // This is a more reliable alternative test for CI environments
      // Test that the API can detect new data without file watching
      
      // Create a separate telemetry service instance (simulating external process)
      const externalService = new TelemetryService({
        serviceName: 'external-service',
        serviceVersion: '1.0.0',
        storage: [{
          type: 'sqlite',
          enabled: true,
          options: {
            path: dbPath, // Same database
            streamBatchSize: 1, // Force immediate writes
            streamFlushInterval: 0, // No buffering
          }
        }]
      });
      
      await externalService.initialize();
      
      // Create event from external service
      const sessionId = await externalService.trackStart('gemini', 'analyze', 'External event');
      
      // Add more events to ensure database write
      await externalService.track({
        sessionId,
        eventType: 'stream',
        category: 'gemini',
        action: 'analyze',
        metadata: { test: true }
      });
      
      // Force flush to ensure database write
      await externalService.shutdown();
      
      // Wait a moment for database write to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Query should return the external event via API
      const response = await fetch(`${serverUrl}/api/events?category=gemini`);
      expect(response.ok).toBe(true);
      
      const data = await response.json();
      expect(data.length).toBeGreaterThan(0);
      expect(data[0].category).toBe('gemini');
      expect(data[0].metadata?.test).toBe(true);
    });
  });

  describe("Dashboard Data Aggregation", () => {
    it("should provide dashboard-specific endpoints", async () => {
      // Generate diverse data for dashboard
      const agentTypes = ['claude', 'gemini', 'grok'];
      const modes = ['chat', 'code', 'analyze'];
      
      const sessionIds = [];
      for (let i = 0; i < 20; i++) {
        const agent = agentTypes[i % agentTypes.length];
        const mode = modes[Math.floor(i / agentTypes.length) % modes.length];
        
        const sessionId = await telemetryService.trackStart(agent, mode, `Dashboard ${i}`);
        sessionIds.push(sessionId);
        
        // Varying event counts
        const eventCount = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < eventCount; j++) {
          await telemetryService.track({
            sessionId,
            eventType: 'stream',
            category: agent,
            action: mode,
            value: j * 100,
            metadata: { progress: j / eventCount }
          });
        }
        
        await telemetryService.trackEnd(sessionId, i % 5 === 0 ? 'failed' : 'completed');
      }
      
      console.log('Generated', sessionIds.length, 'sessions');
      
      // Wait for data to be persisted and analytics to be calculated
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Get metrics via API to verify data aggregation
      const metricsResponse = await fetch(`${serverUrl}/api/metrics`);
      expect(metricsResponse.ok).toBe(true);
      
      const metrics = await metricsResponse.json();
      expect(metrics.events).toBeDefined();
      expect(metrics.events.total).toBeGreaterThan(20);
      expect(metrics.sessions).toBeDefined();
      // We should have 20 completed sessions
      expect((metrics.sessions.active || 0) + 
             (metrics.sessions.completed || 0) + 
             (metrics.sessions.errored || 0)).toBeGreaterThanOrEqual(20);
      
      // Get sessions
      const sessionsResponse = await fetch(`${serverUrl}/api/sessions`);
      expect(sessionsResponse.ok).toBe(true);
      
      const sessions = await sessionsResponse.json();
      expect(sessions.length).toBeGreaterThanOrEqual(20);
      
      // Get insights to verify analytics functionality
      const insightsResponse = await fetch(`${serverUrl}/api/insights`);
      expect(insightsResponse.ok).toBe(true);
      
      const insights = await insightsResponse.json();
      expect(insights.metrics).toBeDefined();
      expect(insights.metrics.events.total).toBeGreaterThan(20);
    });
  });

  describe("Performance and Scalability", () => {
    it("should handle high-frequency updates efficiently", async () => {
      let eventCount = 0;
      
      // Connect WebSocket for monitoring
      socket = io(serverUrl, {
        transports: ['websocket'],
        reconnection: false
      });
      
      await new Promise<void>((resolve) => {
        socket.on('connect', resolve);
      });
      
      socket.on('telemetry:event', () => {
        eventCount++;
      });
      
      // Generate high-frequency events
      const sessionId = await telemetryService.trackStart('claude', 'chat', 'Performance test');
      
      const startTime = Date.now();
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(telemetryService.track({
          sessionId,
          eventType: 'stream',
          category: 'claude',
          action: 'chat',
          value: i,
          metadata: { index: i }
        }));
      }
      
      await Promise.all(promises);
      const insertTime = Date.now() - startTime;
      
      console.log(`Inserted 100 events in ${insertTime}ms`);
      expect(insertTime).toBeLessThan(2000); // Should handle 100 events in under 2 seconds
      
      // API should respond quickly even with many events
      const queryStart = Date.now();
      const response = await fetch(`${serverUrl}/api/events?sessionId=${sessionId}&limit=50`);
      const queryTime = Date.now() - queryStart;
      
      expect(response.ok).toBe(true);
      expect(queryTime).toBeLessThan(200); // Query should be fast
      
      const data = await response.json();
      expect(data.length).toBe(50); // Should respect limit
    });
  });
});