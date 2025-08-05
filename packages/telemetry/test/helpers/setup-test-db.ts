import Database from 'better-sqlite3';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Creates a test database with the required schema for storage security tests
 * This creates a simplified schema that matches what the tests expect
 */
export function setupTestDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  
  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  // Create telemetry_events table with the schema expected by tests
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      category TEXT,
      action TEXT,
      label TEXT,
      metadata TEXT,
      context TEXT,
      timestamp REAL NOT NULL,
      created_at REAL DEFAULT (strftime('%s', 'now') * 1000)
    );
    
    CREATE INDEX IF NOT EXISTS idx_events_session ON telemetry_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_events_timestamp ON telemetry_events(timestamp);
    CREATE INDEX IF NOT EXISTS idx_events_category ON telemetry_events(category);
  `);
  
  // Create telemetry_sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry_sessions (
      id TEXT PRIMARY KEY,
      category TEXT,
      action TEXT,
      start_time REAL NOT NULL,
      end_time REAL,
      event_count INTEGER DEFAULT 0,
      created_at REAL DEFAULT (strftime('%s', 'now') * 1000)
    );
    
    CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON telemetry_sessions(start_time);
  `);
  
  return db;
}

/**
 * Creates a temporary test database path
 */
export function createTestDbPath(): string {
  return join(tmpdir(), `test-telemetry-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);
}

/**
 * Cleans up a test database
 */
export async function cleanupTestDatabase(db: Database.Database): Promise<void> {
  try {
    db.close();
  } catch (e) {
    // Ignore errors during cleanup
  }
}