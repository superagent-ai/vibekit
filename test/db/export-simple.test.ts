/**
 * Phase 5.3: Simple Export Service Tests
 * 
 * Simplified test suite focusing on core export functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TelemetryExportService, ExportFilter, ExportConfig } from '../../packages/vibekit/src/db/export';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { 
  telemetryEvents, 
  telemetrySessions, 
  telemetryErrors,
  NewTelemetryEvent, 
  NewTelemetrySession, 
  NewTelemetryError 
} from '../../packages/vibekit/src/db/schema';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('TelemetryExportService - Core Functionality', () => {
  let exportService: TelemetryExportService;
  let testDbPath: string;
  let tempDir: string;
  let db: any;
  let sqlite: Database.Database;

  beforeEach(async () => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibekit-export-simple-test-'));
    testDbPath = path.join(tempDir, 'test.db');

    // Initialize minimal SQLite database directly
    sqlite = new Database(testDbPath);
    db = drizzle(sqlite);
    
    // Create tables manually for testing
    await createTestTables();
    
    exportService = new TelemetryExportService(db);

    // Create test data
    await createTestData();
  });

  afterEach(async () => {
    sqlite?.close();
    
    // Clean up temporary files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  async function createTestTables() {
    // Create minimal tables for testing - use snake_case to match Drizzle database mapping
    sqlite.exec(`
      CREATE TABLE telemetry_sessions (
        id TEXT PRIMARY KEY,
        agent_type TEXT NOT NULL,
        mode TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        start_time REAL NOT NULL,
        end_time REAL,
        duration REAL,
        event_count INTEGER DEFAULT 0,
        stream_event_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        sandbox_id TEXT,
        repo_url TEXT,
        metadata TEXT,
        created_at REAL DEFAULT (unixepoch()),
        updated_at REAL DEFAULT (unixepoch()),
        version INTEGER DEFAULT 1,
        schema_version TEXT DEFAULT '1.0.0'
      );

      CREATE TABLE telemetry_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        mode TEXT NOT NULL,
        prompt TEXT NOT NULL,
        stream_data TEXT,
        sandbox_id TEXT,
        repo_url TEXT,
        metadata TEXT,
        timestamp REAL NOT NULL,
        created_at REAL DEFAULT (unixepoch()),
        version INTEGER DEFAULT 1,
        schema_version TEXT DEFAULT '1.0.0'
      );

      CREATE TABLE telemetry_errors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        event_id INTEGER,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        error_stack TEXT,
        context TEXT,
        severity TEXT DEFAULT 'medium',
        resolved INTEGER DEFAULT 0,
        metadata TEXT,
        timestamp REAL NOT NULL,
        created_at REAL DEFAULT (unixepoch()),
        resolved_at REAL,
        resolved_by TEXT,
        version INTEGER DEFAULT 1,
        schema_version TEXT DEFAULT '1.0.0'
      );

      CREATE TABLE telemetry_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stat_type TEXT NOT NULL,
        stat_key TEXT NOT NULL,
        total_events INTEGER DEFAULT 0,
        start_events INTEGER DEFAULT 0,
        stream_events INTEGER DEFAULT 0,
        end_events INTEGER DEFAULT 0,
        error_events INTEGER DEFAULT 0,
        unique_sessions INTEGER DEFAULT 0,
        agent_breakdown TEXT,
        mode_breakdown TEXT,
        avg_session_duration REAL,
        min_timestamp REAL,
        max_timestamp REAL,
        computed_at REAL DEFAULT (unixepoch()),
        updated_at REAL DEFAULT (unixepoch()),
        version INTEGER DEFAULT 1,
        schema_version TEXT DEFAULT '1.0.0'
      );

      CREATE TABLE telemetry_buffers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        event_count INTEGER DEFAULT 0,
        buffer_data TEXT NOT NULL,
        max_size INTEGER DEFAULT 50,
        created_at REAL DEFAULT (unixepoch()),
        last_updated REAL DEFAULT (unixepoch()),
        flushed_at REAL,
        flush_attempts INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        schema_version TEXT DEFAULT '1.0.0'
      );

      CREATE TABLE telemetry_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        table_name TEXT NOT NULL,
        record_id TEXT NOT NULL,
        operation TEXT NOT NULL,
        old_values TEXT,
        new_values TEXT,
        changed_fields TEXT,
        user_id TEXT,
        session_id TEXT,
        reason TEXT,
        metadata TEXT,
        timestamp REAL NOT NULL,
        created_at REAL DEFAULT (unixepoch())
      );
    `);
  }

  async function createTestData() {
    const now = Date.now();
    const twoHoursAgo = now - (2 * 60 * 60 * 1000);
    const oneHourAgo = now - (1 * 60 * 60 * 1000);

    // Create test sessions
    const sessions: NewTelemetrySession[] = [
      {
        id: 'session-1',
        agentType: 'claude',
        mode: 'development',
        status: 'completed',
        startTime: twoHoursAgo,
        endTime: twoHoursAgo + 300000,
        duration: 300000,
        eventCount: 5,
        streamEventCount: 3,
        errorCount: 1,
        sandboxId: 'sandbox-1',
        repoUrl: 'https://github.com/test/repo1',
      },
      {
        id: 'session-2',
        agentType: 'codex',
        mode: 'production',
        status: 'completed',
        startTime: oneHourAgo,
        endTime: oneHourAgo + 600000,
        duration: 600000,
        eventCount: 8,
        streamEventCount: 5,
        errorCount: 0,
        sandboxId: 'sandbox-2',
        repoUrl: 'https://github.com/test/repo2',
      },
    ];

    await db.insert(telemetrySessions).values(sessions);

    // Create test events
    const events: NewTelemetryEvent[] = [
      {
        sessionId: 'session-1',
        eventType: 'start',
        agentType: 'claude',
        mode: 'development',
        prompt: 'Test prompt 1',
        timestamp: twoHoursAgo,
      },
      {
        sessionId: 'session-1',
        eventType: 'stream',
        agentType: 'claude',
        mode: 'development',
        prompt: 'Test prompt 2',
        streamData: 'Stream data',
        timestamp: twoHoursAgo + 10000,
      },
      {
        sessionId: 'session-2',
        eventType: 'start',
        agentType: 'codex',
        mode: 'production',
        prompt: 'Test prompt 3',
        timestamp: oneHourAgo,
      },
    ];

    await db.insert(telemetryEvents).values(events);

    // Create test errors
    const errors: NewTelemetryError[] = [
      {
        sessionId: 'session-1',
        errorType: 'validation_error',
        errorMessage: 'Test validation error',
        severity: 'medium',
        resolved: false,
        timestamp: twoHoursAgo + 100000,
      },
    ];

    await db.insert(telemetryErrors).values(errors);
  }

  describe('JSON Export', () => {
    it('should export data in JSON format', async () => {
      const outputPath = path.join(tempDir, 'export.json');
      const config: ExportConfig = {
        format: 'json',
        outputPath,
        pretty: true,
      };

      const metadata = await exportService.export({}, config);

      expect(metadata.format).toBe('json');
      expect(metadata.stats.totalRecords).toBeGreaterThan(0);
      expect(metadata.stats.filesGenerated).toHaveLength(1);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Verify JSON content
      const content = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      expect(content.metadata).toBeDefined();
      expect(content.data).toBeDefined();
      expect(content.data.sessions).toBeDefined();
      expect(content.data.events).toBeDefined();
      expect(content.data.errors).toBeDefined();
      expect(content.data.sessions.length).toBe(2);
      expect(content.data.events.length).toBe(3);
      expect(content.data.errors.length).toBe(1);
    });

    it('should export with compression', async () => {
      const outputPath = path.join(tempDir, 'export-compressed.json');
      const config: ExportConfig = {
        format: 'json',
        outputPath,
        compression: 'gzip',
      };

      const metadata = await exportService.export({}, config);

      expect(metadata.stats.filesGenerated[0]).toMatch(/\.json\.gz$/);
      expect(fs.existsSync(metadata.stats.filesGenerated[0])).toBe(true);
    });

    it('should export with agent type filter', async () => {
      const outputPath = path.join(tempDir, 'export-agent-filtered.json');
      const config: ExportConfig = {
        format: 'json',
        outputPath,
      };

      const filter: ExportFilter = {
        agentTypes: ['claude'],
      };

      // Debug: check what sessions exist before filtering
      const allSessions = await db.select().from(telemetrySessions);
      console.log('All sessions in DB:', allSessions.map(s => ({ id: s.id, agentType: s.agentType })));

      // Debug: check what events exist before filtering
      const allEvents = await db.select().from(telemetryEvents);
      console.log('All events in DB:', allEvents.map(e => ({ id: e.id, sessionId: e.sessionId, agentType: e.agentType })));

      const metadata = await exportService.export(filter, config);

      const content = JSON.parse(fs.readFileSync(metadata.stats.filesGenerated[0], 'utf8'));
      console.log('Filtered sessions:', content.data.sessions.map((s: any) => ({ id: s.id, agentType: s.agentType })));
      console.log('Filtered events:', content.data.events.map((e: any) => ({ id: e.id, sessionId: e.sessionId, agentType: e.agentType })));
      
      expect(content.data.sessions.length).toBe(1);
      expect(content.data.sessions[0].agentType).toBe('claude');
      expect(content.data.events.length).toBe(2); // Only claude events
    });
  });

  describe('CSV Export', () => {
    it('should export data in CSV format', async () => {
      const outputPath = path.join(tempDir, 'export.csv');
      const config: ExportConfig = {
        format: 'csv',
        outputPath,
      };

      const metadata = await exportService.export({}, config);

      expect(metadata.format).toBe('csv');
      expect(metadata.stats.filesGenerated.length).toBeGreaterThan(0);

      // Should create separate CSV files for each table
      const sessionsCsv = metadata.stats.filesGenerated.find(f => f.includes('sessions'));
      const eventsCsv = metadata.stats.filesGenerated.find(f => f.includes('events'));
      
      expect(sessionsCsv).toBeDefined();
      expect(eventsCsv).toBeDefined();
      expect(fs.existsSync(sessionsCsv!)).toBe(true);
      expect(fs.existsSync(eventsCsv!)).toBe(true);

      // Verify CSV content has headers
      const sessionsContent = fs.readFileSync(sessionsCsv!, 'utf8');
      expect(sessionsContent).toMatch(/^id,agentType,mode/);
    });
  });

  describe('OpenTelemetry Export', () => {
    it('should export data in OTLP format', async () => {
      const outputPath = path.join(tempDir, 'export.otlp');
      const config: ExportConfig = {
        format: 'otlp',
        outputPath,
      };

      const metadata = await exportService.export({}, config);

      expect(metadata.format).toBe('otlp');
      expect(metadata.stats.filesGenerated).toHaveLength(1);
      expect(fs.existsSync(metadata.stats.filesGenerated[0])).toBe(true);

      // Verify OTLP structure
      const content = JSON.parse(fs.readFileSync(metadata.stats.filesGenerated[0], 'utf8'));
      expect(content.resourceSpans).toBeDefined();
      expect(Array.isArray(content.resourceSpans)).toBe(true);
      expect(content.resourceSpans[0].resource).toBeDefined();
      expect(content.resourceSpans[0].instrumentationLibrarySpans).toBeDefined();
      
      const spans = content.resourceSpans[0].instrumentationLibrarySpans[0].spans;
      expect(spans.length).toBe(2); // One span per session
    });
  });

  describe('Error Handling', () => {
    it('should throw error for invalid format', async () => {
      const config: ExportConfig = {
        format: 'invalid' as any,
        outputPath: '/tmp/test',
      };

      await expect(exportService.export({}, config)).rejects.toThrow('Unsupported format');
    });

    it('should throw error for missing output path', async () => {
      const config: ExportConfig = {
        format: 'json',
        outputPath: '',
      };

      await expect(exportService.export({}, config)).rejects.toThrow('Output path is required');
    });
  });
}); 