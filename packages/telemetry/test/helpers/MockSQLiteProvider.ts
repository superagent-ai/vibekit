import type { TelemetryEvent, QueryFilter, StorageStats } from '../../src/core/types.js';
import { StorageProvider } from '../../src/storage/StorageProvider.js';
import Database from 'better-sqlite3';
import { setupTestDatabase } from './setup-test-db.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Mock SQLite provider for testing that uses a simplified schema
 * matching the test expectations
 */
export class MockSQLiteProvider extends StorageProvider {
  readonly name = 'mock-sqlite';
  readonly supportsQuery = true;
  readonly supportsStreaming = false;
  
  private db: Database.Database;
  private isInitialized = false;
  
  constructor(config: { path: string }) {
    super();
    this.db = setupTestDatabase(config.path);
  }
  
  async initialize(): Promise<void> {
    this.isInitialized = true;
  }
  
  async store(event: TelemetryEvent): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Provider not initialized');
    }
    
    // Validate event type
    const validEventTypes = ['start', 'stream', 'end', 'error', 'event'];
    if (!validEventTypes.includes(event.eventType)) {
      // For testing, convert invalid types to 'event'
      event = { ...event, eventType: 'event' };
    }
    
    // Validate and truncate field lengths
    if (event.category && event.category.length > 1000) {
      event = { ...event, category: event.category.substring(0, 1000) };
    }
    if (event.action && event.action.length > 1000) {
      event = { ...event, action: event.action.substring(0, 1000) };
    }
    if (event.label && event.label.length > 1000) {
      event = { ...event, label: event.label.substring(0, 1000) };
    }
    
    // Ensure session exists
    await this.ensureSession(event.sessionId, event.category, event.action);
    
    // Insert event
    const stmt = this.db.prepare(`
      INSERT INTO telemetry_events (
        session_id, event_type, category, action, label, 
        metadata, context, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      event.sessionId,
      event.eventType,
      event.category || null,
      event.action || null,
      event.label || null,
      event.metadata ? JSON.stringify(this.sanitizeMetadata(event.metadata)) : null,
      event.context ? JSON.stringify(event.context) : null,
      event.timestamp
    );
  }
  
  async storeBatch(events: TelemetryEvent[]): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('Provider not initialized');
    }
    
    const insertStmt = this.db.prepare(`
      INSERT INTO telemetry_events (
        session_id, event_type, category, action, label, 
        metadata, context, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const insertMany = this.db.transaction((events: TelemetryEvent[]) => {
      for (const event of events) {
        // Ensure session exists
        this.ensureSessionSync(event.sessionId, event.category, event.action);
        
        insertStmt.run(
          event.sessionId,
          event.eventType,
          event.category || null,
          event.action || null,
          event.label || null,
          event.metadata ? JSON.stringify(this.sanitizeMetadata(event.metadata)) : null,
          event.context ? JSON.stringify(event.context) : null,
          event.timestamp
        );
      }
    });
    
    insertMany(events);
  }
  
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    if (!this.isInitialized) {
      throw new Error('Provider not initialized');
    }
    
    // Validate limit - handle string/numeric injection attempts
    let limit = 100;
    if (filter.limit !== undefined) {
      if (typeof filter.limit === 'string') {
        throw new Error('Invalid limit: must be a number');
      }
      if (typeof filter.limit !== 'number' || isNaN(filter.limit) || filter.limit < 1) {
        throw new Error('Invalid limit: must be a positive number');
      }
      limit = Math.min(filter.limit, 1000);
    }
    
    let sql = 'SELECT * FROM telemetry_events WHERE 1=1';
    const params: any[] = [];
    
    if (filter.sessionId) {
      sql += ' AND session_id = ?';
      params.push(filter.sessionId);
    }
    
    if (filter.category) {
      sql += ' AND category = ?';
      params.push(filter.category);
    }
    
    if (filter.action) {
      sql += ' AND action = ?';
      params.push(filter.action);
    }
    
    if (filter.eventType) {
      sql += ' AND event_type = ?';
      params.push(filter.eventType);
    }
    
    if (filter.start) {
      // Validate numeric fields
      if (typeof filter.start === 'string') {
        throw new Error('Invalid startTime: must be a number');
      }
      sql += ' AND timestamp >= ?';
      params.push(filter.start);
    }
    
    if (filter.end) {
      // Validate numeric fields
      if (typeof filter.end === 'string') {
        throw new Error('Invalid endTime: must be a number');
      }
      sql += ' AND timestamp <= ?';
      params.push(filter.end);
    }
    
    sql += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map((row: any) => ({
      id: uuidv4(),
      sessionId: row.session_id,
      eventType: row.event_type,
      category: row.category,
      action: row.action,
      label: row.label,
      metadata: row.metadata ? this.sanitizeMetadata(JSON.parse(row.metadata)) : undefined,
      context: row.context ? JSON.parse(row.context) : undefined,
      timestamp: row.timestamp,
    }));
  }
  
  async getStats(): Promise<StorageStats> {
    const stats = this.db.prepare(`
      SELECT 
        COUNT(*) as totalEvents,
        COUNT(DISTINCT session_id) as uniqueSessions
      FROM telemetry_events
    `).get() as any;
    
    return {
      totalEvents: stats.totalEvents,
      uniqueSessions: stats.uniqueSessions,
      oldestEvent: Date.now() - 86400000,
      newestEvent: Date.now(),
      storageSize: 0,
    };
  }
  
  async shutdown(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.isInitialized = false;
    }
  }
  
  private ensureSession(sessionId: string, category?: string, action?: string): void {
    const existing = this.db.prepare('SELECT id FROM telemetry_sessions WHERE id = ?').get(sessionId);
    if (!existing) {
      this.db.prepare(`
        INSERT INTO telemetry_sessions (id, category, action, start_time)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, category || null, action || null, Date.now());
    }
  }
  
  private ensureSessionSync(sessionId: string, category?: string, action?: string): void {
    const existing = this.db.prepare('SELECT id FROM telemetry_sessions WHERE id = ?').get(sessionId);
    if (!existing) {
      this.db.prepare(`
        INSERT INTO telemetry_sessions (id, category, action, start_time)
        VALUES (?, ?, ?, ?)
      `).run(sessionId, category || null, action || null, Date.now());
    }
  }
  
  private sanitizeMetadata(metadata: any): any {
    if (!metadata || typeof metadata !== 'object') {
      return metadata;
    }
    
    // Remove dangerous prototype properties
    const clean: any = {};
    for (const key in metadata) {
      if (key !== '__proto__' && key !== 'constructor' && key !== 'prototype') {
        clean[key] = metadata[key];
      }
    }
    return clean;
  }
}