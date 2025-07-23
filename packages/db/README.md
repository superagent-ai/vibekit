# @vibe-kit/db

A standalone database package for VibeKit telemetry data management using Drizzle ORM and SQLite.

## Overview

This package provides a complete database layer for storing and managing VibeKit telemetry data. It includes:

- **Drizzle ORM** integration for type-safe database operations
- **SQLite** as the database engine with optimized performance settings
- **Comprehensive schema** for telemetry events, sessions, buffers, and statistics
- **Migration system** for database schema evolution
- **Performance monitoring** and health checks
- **Batch operations** for efficient data processing

## Installation

```bash
npm install @vibe-kit/db
```

## Usage

### Basic Setup

```typescript
import { DrizzleTelemetryDB, DrizzleTelemetryOperations } from '@vibe-kit/db';

// Initialize database
const db = new DrizzleTelemetryDB({
  dbPath: '.vibekit/telemetry.db',
  enableWAL: true,
  pruneDays: 30
});

await db.initialize();

// Create operations instance
const operations = new DrizzleTelemetryOperations(db);
```

### Working with Sessions

```typescript
// Create a new session
await operations.createSession({
  id: 'session-123',
  agentType: 'claude',
  mode: 'code',
  status: 'active',
  startTime: Date.now()
});

// Query sessions
const sessions = await operations.querySessions({
  agentType: 'claude',
  status: 'active',
  limit: 10
});
```

### Working with Events

```typescript
// Insert telemetry event
await operations.insertEvent({
  sessionId: 'session-123',
  eventType: 'stream',
  agentType: 'claude',
  mode: 'code',
  prompt: 'Write a function...',
  streamData: 'Generated code...',
  timestamp: Date.now()
});

// Query events
const events = await operations.queryEvents({
  sessionId: 'session-123',
  eventType: 'stream',
  limit: 50
});
```

### Statistics and Analytics

```typescript
// Get comprehensive statistics
const stats = await operations.getStatistics();
console.log('Total events:', stats.totalEvents);
console.log('Event breakdown:', stats.eventBreakdown);
console.log('Agent breakdown:', stats.agentBreakdown);
```

## Configuration

The `DrizzleTelemetryConfig` interface provides extensive configuration options:

```typescript
interface DrizzleTelemetryConfig {
  dbPath?: string;                    // Database file path
  pruneDays?: number;                 // Auto-delete records older than N days
  streamBatchSize?: number;           // Batch size for stream events
  streamFlushIntervalMs?: number;     // Buffer flush interval
  maxSizeMB?: number;                 // Max database size in MB
  enableWAL?: boolean;                // Enable WAL mode
  enableForeignKeys?: boolean;        // Enable foreign key constraints
  poolSize?: number;                  // Connection pool size
  queryTimeoutMs?: number;            // Query timeout
  enableQueryLogging?: boolean;       // Enable query logging
  enableMetrics?: boolean;            // Enable performance metrics
}
```

## Schema

The database includes the following main tables:

- **telemetry_sessions** - Session metadata and statistics
- **telemetry_events** - Individual telemetry events (start, stream, end, error)
- **telemetry_buffers** - Stream event buffers for batch processing
- **telemetry_stats** - Pre-computed statistics and aggregations
- **telemetry_errors** - Error tracking and resolution
- **telemetry_audit_log** - Audit trail for data modifications
- **telemetry_validation_rules** - Data validation configurations
- **telemetry_schema_versions** - Schema version tracking

## Performance Features

- **WAL Mode** for better concurrency
- **Indexed queries** for common patterns
- **Batch operations** for bulk inserts
- **Connection pooling** for scalability
- **Query metrics** and performance monitoring
- **Automatic pruning** of old data

## Development

### Building

```bash
npm run build
```

### Database Operations

```bash
npm run db:generate    # Generate migrations
npm run db:migrate     # Apply migrations
npm run db:studio      # Open Drizzle Studio
```

### Type Checking

```bash
npm run type-check
```

## Dependencies

- `drizzle-orm` - Type-safe ORM
- `better-sqlite3` - High-performance SQLite driver

## License

MIT 