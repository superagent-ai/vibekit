# VibeKit Local Telemetry Storage

A comprehensive guide to VibeKit's local telemetry storage system that runs alongside OpenTelemetry for offline-first telemetry data collection and analysis.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Usage Guide](#usage-guide)
- [CLI Commands](#cli-commands)
- [Query API](#query-api)
- [Performance Optimization](#performance-optimization)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)
- [Privacy & Security](#privacy--security)
- [Migration Guide](#migration-guide)
- [API Reference](#api-reference)

## Overview

VibeKit's local telemetry storage provides a lightweight, SQLite-based solution for capturing and analyzing telemetry data locally. This system operates independently alongside the existing OpenTelemetry (OTLP) pipeline, offering:

- **Offline-first**: Works without network connectivity
- **Developer-friendly**: Easy inspection and debugging
- **Performance-optimized**: Intelligent buffering and batching
- **Production-ready**: Comprehensive error handling and resource management
- **Zero-dependency**: No external services required

### When to Use Local vs OpenTelemetry

| Use Local Storage When | Use OpenTelemetry When |
|----------------------|----------------------|
| Debugging local development | Production monitoring |
| Offline environments | Centralized observability |
| Sensitive data concerns | Team collaboration |
| Quick prototyping | Long-term analytics |
| Regulatory compliance | Industry-standard tooling |

## Quick Start

### 1. Enable Local Storage

```typescript
import { TelemetryService } from '@vibe-kit/sdk';

const telemetryService = new TelemetryService({
  // OpenTelemetry config (optional)
  isEnabled: true,
  endpoint: "http://localhost:4318/v1/traces",
  
  // Local storage config
  localStore: {
    isEnabled: true,
    path: "./telemetry.db",        // Optional: defaults to .vibekit/telemetry.db
    streamBatchSize: 50,           // Optional: defaults to 50
    streamFlushIntervalMs: 1000,   // Optional: defaults to 1000ms
    pruneDays: 7                   // Optional: auto-delete data older than N days
  }
});
```

### 2. Use Normal Telemetry Methods

```typescript
// Start a session
await telemetryService.trackStart({
  sessionId: "my-session",
  agentType: "claude",
  mode: "chat",
  prompt: "Help me debug this code"
});

// Track streaming responses
await telemetryService.trackStream({
  sessionId: "my-session", 
  agentType: "claude",
  streamData: "Here's the issue with your code..."
});

// End the session
await telemetryService.trackEnd({
  sessionId: "my-session",
  agentType: "claude",
  metadata: { status: "success", duration: 45000 }
});
```

### 3. Query Your Data

```bash
# View recent telemetry data
vibekit telemetry dump --from yesterday

# Get session statistics  
vibekit telemetry stats

# Clear old data
vibekit telemetry clear --older-than 30d
```

## Configuration

### LocalStoreConfig Interface

```typescript
interface LocalStoreConfig {
  /** Enable/disable local storage */
  isEnabled: boolean;
  
  /** SQLite database file path (default: .vibekit/telemetry.db) */
  path?: string;
  
  /** Number of stream events to buffer before flushing (default: 50) */
  streamBatchSize?: number;
  
  /** Interval in ms to flush stream buffers (default: 1000) */
  streamFlushIntervalMs?: number;
  
  /** Auto-delete records older than N days (default: disabled) */
  pruneDays?: number;
  
  /** Maximum database size in MB before rotation (default: 100) */
  maxSizeMB?: number;
  
  /** Enable/disable query performance indexes (default: true) */
  enableIndexes?: boolean;
}
```

### Configuration Examples

#### Development Setup
```typescript
const config = {
  localStore: {
    isEnabled: true,
    path: "./dev-telemetry.db",
    streamBatchSize: 10,      // Smaller batches for immediate feedback
    streamFlushIntervalMs: 500,
    pruneDays: 3              // Keep data fresh
  }
};
```

#### Production Setup
```typescript
const config = {
  localStore: {
    isEnabled: true,
    path: "/var/log/vibekit/telemetry.db",
    streamBatchSize: 100,     // Larger batches for performance
    streamFlushIntervalMs: 2000,
    pruneDays: 30,            // Longer retention
    maxSizeMB: 500            // Prevent disk exhaustion
  }
};
```

#### High-Performance Setup
```typescript
const config = {
  localStore: {
    isEnabled: true,
    streamBatchSize: 200,     // Maximum batching
    streamFlushIntervalMs: 5000,
    enableIndexes: false,     // Disable for write-heavy workloads
    pruneDays: 1              // Aggressive cleanup
  }
};
```

## Usage Guide

### Event Types

The local storage system captures four types of events:

#### 1. Start Events
```typescript
await telemetryService.trackStart({
  sessionId: "session-123",
  agentType: "claude",
  mode: "code",
  prompt: "Fix this bug",
  sandboxId: "sandbox-456",
  repoUrl: "https://github.com/user/repo",
  metadata: { priority: "high" }
});
```

#### 2. Stream Events
```typescript
await telemetryService.trackStream({
  sessionId: "session-123",
  agentType: "claude", 
  streamData: "I found the issue...",
  metadata: { chunk: 1, totalChunks: 5 }
});
```

#### 3. End Events
```typescript
await telemetryService.trackEnd({
  sessionId: "session-123",
  agentType: "claude",
  metadata: { 
    status: "success", 
    duration: 30000,
    linesGenerated: 150 
  }
});
```

#### 4. Error Events
```typescript
await telemetryService.trackError({
  sessionId: "session-123",
  agentType: "claude",
  error: "API rate limit exceeded",
  metadata: { retryAfter: 60000 }
});
```

### Database Schema

The SQLite database uses a simple, denormalized schema optimized for queries:

```sql
CREATE TABLE telemetry (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sessionId   TEXT,
  eventType   TEXT,              -- 'start' | 'stream' | 'end' | 'error'
  agentType   TEXT,              -- 'claude' | 'codex' | 'gemini' | etc.
  mode        TEXT,              -- 'chat' | 'code' | etc.
  prompt      TEXT,              -- Initial prompt or error message
  streamData  TEXT,              -- Response data (null for non-stream events)
  sandboxId   TEXT,              -- Sandbox identifier
  repoUrl     TEXT,              -- Repository URL
  metadata    TEXT,              -- JSON-encoded metadata
  timestamp   INTEGER            -- Unix timestamp in milliseconds
);

-- Performance indexes
CREATE INDEX idx_timestamp ON telemetry(timestamp);
CREATE INDEX idx_session ON telemetry(sessionId);
CREATE INDEX idx_agent_type ON telemetry(agentType);
```

## CLI Commands

### dump Command

Export telemetry data in various formats:

```bash
# Basic usage
vibekit telemetry dump

# Filter by date range
vibekit telemetry dump --from "2024-01-01" --to "2024-01-31"
vibekit telemetry dump --from yesterday
vibekit telemetry dump --from "1 hour ago"

# Filter by session
vibekit telemetry dump --session "my-session-id"

# Filter by agent type
vibekit telemetry dump --agent claude

# Filter by event type
vibekit telemetry dump --type stream

# Output formats
vibekit telemetry dump --format json > telemetry.json
vibekit telemetry dump --format csv > telemetry.csv
vibekit telemetry dump --format table  # Human-readable table

# Limit results
vibekit telemetry dump --limit 100

# Include/exclude fields
vibekit telemetry dump --fields sessionId,agentType,timestamp
vibekit telemetry dump --exclude streamData  # Reduce output size
```

### stats Command

Get insights into your telemetry data:

```bash
# Overall statistics
vibekit telemetry stats

# Example output:
# Total Events: 1,234
# Sessions: 56
# Agents: claude (80%), codex (15%), gemini (5%)
# Date Range: 2024-01-01 to 2024-01-31
# Database Size: 15.2 MB
# Average Session Duration: 2m 34s

# Agent-specific stats
vibekit telemetry stats --agent claude

# Date range stats
vibekit telemetry stats --from "last week"

# Performance stats
vibekit telemetry stats --performance
# Shows: queries/sec, buffer efficiency, flush rates
```

### clear Command

Remove telemetry data:

```bash
# Clear with confirmation
vibekit telemetry clear

# Force clear (no confirmation)
vibekit telemetry clear --force

# Clear by age
vibekit telemetry clear --older-than 7d
vibekit telemetry clear --older-than "1 month"

# Clear by session
vibekit telemetry clear --session "session-123"

# Clear by agent
vibekit telemetry clear --agent codex

# Vacuum database after clearing
vibekit telemetry clear --vacuum
```

### query Command

Advanced querying capabilities:

```bash
# SQL-like queries
vibekit telemetry query "SELECT agentType, COUNT(*) FROM telemetry GROUP BY agentType"

# Find longest sessions
vibekit telemetry query --longest-sessions

# Find error patterns
vibekit telemetry query --errors --group-by prompt

# Export specific data
vibekit telemetry query --sessions-with-errors --format json
```

## Query API

### Programmatic Access

```typescript
import { TelemetryDB } from '@vibe-kit/sdk/telemetry-db';

const db = new TelemetryDB({
  path: "./telemetry.db"
});

// Get events with filters
const events = await db.getEvents({
  from: Date.now() - (24 * 60 * 60 * 1000), // Last 24 hours
  to: Date.now(),
  sessionId: "session-123",
  eventType: "stream",
  agentType: "claude",
  limit: 100,
  orderBy: "timestamp_desc"
});

// Get statistics
const stats = await db.getStats({
  groupBy: "agentType",
  from: "2024-01-01",
  to: "2024-01-31"
});

// Get session summary
const session = await db.getSession("session-123");
console.log(`Duration: ${session.duration}ms`);
console.log(`Events: ${session.eventCount}`);
console.log(`Status: ${session.status}`);
```

### Query Filters

```typescript
interface TelemetryQueryFilter {
  from?: number | string;        // Timestamp or date string
  to?: number | string;          // Timestamp or date string
  sessionId?: string;            // Exact session ID
  sessionIds?: string[];         // Multiple sessions
  eventType?: 'start' | 'stream' | 'end' | 'error';
  agentType?: string;            // Agent type filter
  agentTypes?: string[];         // Multiple agents
  mode?: string;                 // Mode filter
  contains?: string;             // Search in prompt/streamData
  metadata?: Record<string, any>; // Metadata filters
  limit?: number;                // Max results
  offset?: number;               // Pagination
  orderBy?: 'timestamp_asc' | 'timestamp_desc';
}
```

## Performance Optimization

### Stream Buffering

The system automatically batches stream events for optimal performance:

```typescript
// These stream calls are buffered and written in batches
for (let i = 0; i < 100; i++) {
  await telemetryService.trackStream({
    sessionId: "session-123",
    agentType: "claude",
    streamData: `Chunk ${i}`
  });
}
// Automatically flushed when batch size reached or interval elapsed
```

### Buffer Configuration

Tune buffering for your workload:

```typescript
// High-frequency streaming (many small chunks)
{
  streamBatchSize: 100,
  streamFlushIntervalMs: 2000
}

// Low-frequency streaming (fewer, larger chunks)  
{
  streamBatchSize: 10,
  streamFlushIntervalMs: 500
}

// Write-heavy workload (prioritize throughput)
{
  streamBatchSize: 200,
  streamFlushIntervalMs: 5000,
  enableIndexes: false  // Disable indexes for faster writes
}
```

### Memory Management

Monitor and control memory usage:

```typescript
// Get performance metrics
const metrics = telemetryService.getPerformanceMetrics();
console.log(`Active buffers: ${metrics.activeBuffers}`);
console.log(`Total events written: ${metrics.totalEventsWritten}`);
console.log(`Average flush time: ${metrics.averageFlushTime}ms`);

// Force buffer flush
await telemetryService.flushBuffers();
```

### Database Optimization

```bash
# Analyze database performance
vibekit telemetry stats --performance

# Vacuum database to reclaim space
vibekit telemetry vacuum

# Rebuild indexes
vibekit telemetry reindex

# Check database integrity
vibekit telemetry check
```

## Best Practices

### 1. Configuration

```typescript
// ✅ Good: Environment-specific config
const config = {
  localStore: {
    isEnabled: process.env.NODE_ENV === 'development',
    path: process.env.TELEMETRY_DB_PATH || './telemetry.db',
    pruneDays: process.env.NODE_ENV === 'production' ? 30 : 3
  }
};

// ❌ Bad: Hardcoded paths
const config = {
  localStore: {
    isEnabled: true,
    path: '/tmp/telemetry.db'  // Will be lost on restart
  }
};
```

### 2. Error Handling

```typescript
try {
  await telemetryService.trackStart({...});
} catch (error) {
  // ✅ Good: Local storage errors don't break your app
  console.warn('Telemetry failed:', error);
  // Continue with main application logic
}

// ❌ Bad: Don't let telemetry errors crash your app
await telemetryService.trackStart({...}); // Uncaught errors can crash
```

### 3. Data Retention

```typescript
// ✅ Good: Set appropriate retention
{
  pruneDays: 7,     // Development
  pruneDays: 30,    // Production
  pruneDays: 90     // Compliance/audit requirements
}

// ❌ Bad: No retention policy
{
  // Database will grow indefinitely
}
```

### 4. Sensitive Data

```typescript
// ✅ Good: Sanitize sensitive data
await telemetryService.trackStart({
  sessionId: "session-123",
  agentType: "claude",
  prompt: sanitizePrompt(userInput),  // Remove PII
  metadata: { 
    userId: hashUserId(userId),       // Hash instead of raw ID
    promptLength: userInput.length    // Aggregate metrics
  }
});

// ❌ Bad: Store raw sensitive data
await telemetryService.trackStart({
  prompt: "My credit card is 1234-5678-9012-3456",  // PII leak
  metadata: { 
    email: "user@company.com",                       // Direct PII
    apiKey: "sk-1234567890"                         // Credentials
  }
});
```

### 5. Performance Monitoring

```typescript
// ✅ Good: Monitor telemetry performance
setInterval(async () => {
  const metrics = telemetryService.getPerformanceMetrics();
  if (metrics.averageFlushTime > 1000) {
    console.warn('Telemetry performance degraded');
  }
  if (metrics.activeBuffers > 10) {
    console.warn('Too many active buffers');
  }
}, 60000);
```

## Troubleshooting

### Common Issues

#### 1. Database Lock Errors

```
Error: SQLITE_BUSY: database is locked
```

**Causes:**
- Multiple processes accessing the same database
- Long-running transactions
- Insufficient disk space

**Solutions:**
```typescript
// Use different database files per process
{
  path: `./telemetry-${process.pid}.db`
}

// Enable WAL mode for better concurrency
{
  enableWAL: true
}

// Implement retry logic
{
  retryAttempts: 3,
  retryDelayMs: 100
}
```

#### 2. High Memory Usage

```
Process memory usage growing continuously
```

**Causes:**
- Large stream batches not flushing
- Buffer leak in stream processing
- Large metadata objects

**Solutions:**
```typescript
// Reduce batch size
{
  streamBatchSize: 25  // Reduce from default 50
}

// More frequent flushing
{
  streamFlushIntervalMs: 500  // Reduce from default 1000
}

// Monitor buffer sizes
const metrics = telemetryService.getPerformanceMetrics();
if (metrics.totalBufferedEvents > 1000) {
  await telemetryService.flushBuffers();
}
```

#### 3. Slow Query Performance

```
Database queries taking too long
```

**Solutions:**
```bash
# Check database size
vibekit telemetry stats

# Rebuild indexes
vibekit telemetry reindex

# Vacuum database
vibekit telemetry vacuum

# Add custom indexes
vibekit telemetry query "CREATE INDEX idx_custom ON telemetry(agentType, timestamp)"
```

#### 4. Disk Space Issues

```
Error: SQLITE_FULL: database or disk is full
```

**Solutions:**
```typescript
// Enable automatic pruning
{
  pruneDays: 7,
  maxSizeMB: 100
}

// Manual cleanup
await db.pruneOldRecords(7); // Delete records older than 7 days
```

### Debug Mode

Enable detailed logging for troubleshooting:

```typescript
const telemetryService = new TelemetryService({
  localStore: {
    isEnabled: true,
    debug: true  // Enables verbose logging
  }
});
```

### Health Checks

Monitor telemetry system health:

```typescript
// Check database connectivity
const health = await telemetryService.healthCheck();
console.log(`Database: ${health.database ? 'OK' : 'FAILED'}`);
console.log(`Buffer: ${health.buffer ? 'OK' : 'FAILED'}`);
console.log(`Disk space: ${health.diskSpace} MB available`);
```

## Privacy & Security

### Data Sensitivity

Local telemetry data may contain sensitive information:

- **Prompts**: User inputs, code snippets, personal data
- **Stream data**: AI responses, generated code
- **Metadata**: User IDs, session information
- **Repository URLs**: Private repository information

### Security Best Practices

#### 1. File Permissions
```bash
# Restrict database file access
chmod 600 telemetry.db
chown app:app telemetry.db

# Secure directory
chmod 750 .vibekit/
```

#### 2. Data Encryption
```typescript
// Encrypt sensitive fields before storage
import { encrypt, decrypt } from './crypto-utils';

await telemetryService.trackStart({
  sessionId: "session-123",
  agentType: "claude",
  prompt: encrypt(sensitivePrompt),
  metadata: {
    encryptedUserId: encrypt(userId)
  }
});
```

#### 3. Access Control
```typescript
// Environment-based security
const config = {
  localStore: {
    isEnabled: process.env.NODE_ENV === 'development',
    encryptionKey: process.env.TELEMETRY_ENCRYPTION_KEY,
    requireAuth: process.env.NODE_ENV === 'production'
  }
};
```

#### 4. Data Anonymization
```typescript
// Hash or remove PII
const sanitizedMetadata = {
  ...metadata,
  userId: hash(metadata.userId),
  email: undefined,  // Remove entirely
  location: metadata.location ? 'REDACTED' : undefined
};
```

### Compliance Considerations

#### GDPR/Privacy Regulations
- Implement data retention policies
- Provide data export/deletion capabilities
- Document data processing purposes
- Obtain appropriate consents

#### Example Compliance Implementation
```typescript
// Data retention with audit trail
await db.deleteUserData(userId, {
  reason: 'User deletion request',
  requestId: 'REQ-123',
  timestamp: Date.now()
});

// Data export for user requests
const userData = await db.exportUserData(userId);
```

## Migration Guide

### From Manual Logging

If you're currently using manual logging for telemetry:

```typescript
// Before: Manual logging
console.log(`Session started: ${sessionId}`);
fs.appendFileSync('telemetry.log', `${timestamp}: START ${sessionId}\n`);

// After: VibeKit local storage
await telemetryService.trackStart({
  sessionId,
  agentType: "claude",
  mode: "chat",
  prompt: userPrompt
});
```

### From External Telemetry Services

Migrating from services like DataDog, New Relic, etc.:

```typescript
// Before: External service
analytics.track('ai_session_start', {
  sessionId,
  agentType,
  timestamp: Date.now()
});

// After: VibeKit (can run both during transition)
await Promise.all([
  // Keep existing service during migration
  analytics.track('ai_session_start', { sessionId, agentType }),
  
  // Add VibeKit local storage
  telemetryService.trackStart({ sessionId, agentType, mode, prompt })
]);
```

### Data Import

Import existing telemetry data:

```bash
# Import from JSON
vibekit telemetry import --format json --file existing-data.json

# Import from CSV
vibekit telemetry import --format csv --file telemetry.csv

# Import with transformation
vibekit telemetry import --file data.json --transform ./transform-script.js
```

### Gradual Rollout

1. **Phase 1**: Enable alongside existing telemetry
```typescript
{
  localStore: { isEnabled: true },
  // Keep existing OTLP enabled
  isEnabled: true,
  endpoint: "existing-endpoint"
}
```

2. **Phase 2**: Compare data quality and performance
```bash
vibekit telemetry stats --compare-with-otlp
```

3. **Phase 3**: Gradually migrate workloads
```typescript
// Feature flag based rollout
{
  localStore: { 
    isEnabled: featureFlags.localTelemetry,
    samplingRatio: 0.1  // Start with 10% of traffic
  }
}
```

4. **Phase 4**: Full migration
```typescript
{
  localStore: { isEnabled: true },
  isEnabled: false  // Disable OTLP after validation
}
```

## API Reference

### TelemetryService Methods

All methods support both object-based and parameter-based calling styles:

```typescript
// Object-based (recommended)
await telemetryService.trackStart({
  sessionId: "session-123",
  agentType: "claude",
  mode: "chat",
  prompt: "Hello",
  metadata: { userId: "user-456" }
});

// Parameter-based (legacy compatibility)
await telemetryService.trackStart(
  "session-123",
  "claude", 
  "chat",
  "Hello",
  "sandbox-789",
  "https://github.com/user/repo",
  { userId: "user-456" }
);
```

### TelemetryDB Methods

```typescript
class TelemetryDB {
  constructor(config: LocalStoreConfig)
  
  // Event operations
  async insertEvent(event: TelemetryRecord): Promise<void>
  async insertBatch(events: TelemetryRecord[]): Promise<void>
  async getEvents(filter?: TelemetryQueryFilter): Promise<TelemetryRecord[]>
  
  // Session operations
  async getSession(sessionId: string): Promise<SessionSummary>
  async getSessions(filter?: SessionFilter): Promise<SessionSummary[]>
  
  // Statistics
  async getStats(options?: StatsOptions): Promise<TelemetryStats>
  async getAgentStats(): Promise<AgentStats[]>
  
  // Maintenance
  async clear(filter?: ClearFilter): Promise<number>
  async pruneOldRecords(days: number): Promise<number>
  async vacuum(): Promise<void>
  async healthCheck(): Promise<HealthStatus>
  
  // Lifecycle
  async close(): Promise<void>
}
```

### Configuration Interfaces

```typescript
interface LocalStoreConfig {
  isEnabled: boolean;
  path?: string;
  streamBatchSize?: number;
  streamFlushIntervalMs?: number;
  pruneDays?: number;
  maxSizeMB?: number;
  enableIndexes?: boolean;
  enableWAL?: boolean;
  debug?: boolean;
  encryptionKey?: string;
  retryAttempts?: number;
  retryDelayMs?: number;
}

interface TelemetryRecord {
  id?: number;
  sessionId: string;
  eventType: 'start' | 'stream' | 'end' | 'error';
  agentType: string;
  mode?: string;
  prompt?: string;
  streamData?: string;
  sandboxId?: string;
  repoUrl?: string;
  metadata?: Record<string, any>;
  timestamp: number;
}
```

---

For more information, visit the [VibeKit documentation](https://docs.vibekit.sh) or join our [Discord community](https://discord.com/invite/mhmJUTjW4b). 