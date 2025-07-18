/**
 * Phase 2: Core Database Operations with Drizzle ORM
 * 
 * This module implements all telemetry database operations using Drizzle ORM,
 * replacing the raw SQL implementation with type-safe, performant operations.
 */

import { eq, desc, asc, and, or, gte, lte, count, sum, avg, max, min, sql } from 'drizzle-orm';
import { DrizzleTelemetryDB, getTelemetryDB } from './connection';
import {
  telemetryEvents,
  telemetrySessions,
  telemetryBuffers,
  telemetryStats,
  telemetryErrors,
} from './schema';
import {
  NewTelemetryEvent,
  NewTelemetrySession,
  NewTelemetryBuffer,
  NewTelemetryError,
  TelemetryEvent,
  TelemetrySession,
  SessionWithEvents,
  TelemetryQueryFilter,
  SessionQueryFilter,
  TelemetryStatsSummary,
  BatchInsertResult,
  EventType,
  SessionStatus,
  DrizzleTelemetryConfig,
} from './types';

export class DrizzleTelemetryOperations {
  private dbManager: DrizzleTelemetryDB;

  constructor(config?: DrizzleTelemetryConfig) {
    this.dbManager = getTelemetryDB(config);
  }

  /**
   * Initialize the database and ensure it's ready
   */
  async initialize(): Promise<void> {
    await this.dbManager.initialize();
  }

  /**
   * Get the database instance
   */
  private async getDB() {
    return await this.dbManager.getDatabase();
  }

  /**
   * Get the database instance for external services (e.g., data integrity)
   */
  async getDatabase() {
    return await this.dbManager.getDatabase();
  }

  // =============================================================================
  // SESSION OPERATIONS
  // =============================================================================

  /**
   * Create or update a telemetry session
   */
  async upsertSession(session: NewTelemetrySession): Promise<TelemetrySession> {
    const db = await this.getDB();

    return await this.dbManager.executeWithMetrics(
      'UPSERT_SESSION',
      async () => {
        // Check if session exists
        const existing = await db
          .select()
          .from(telemetrySessions)
          .where(eq(telemetrySessions.id, session.id))
          .limit(1);

        if (existing.length > 0) {
          // Update existing session
          const [updated] = await db
            .update(telemetrySessions)
            .set({
              ...session,
              updatedAt: Date.now(),
            })
            .where(eq(telemetrySessions.id, session.id))
            .returning();
          return updated;
        } else {
          // Create new session
          const [created] = await db
            .insert(telemetrySessions)
            .values({
              ...session,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            })
            .returning();
          return created;
        }
      }
    );
  }

  /**
   * Get session by ID with optional relations
   */
  async getSession(
    sessionId: string,
    includeRelations: boolean = false
  ): Promise<SessionWithEvents | TelemetrySession | null> {
    const db = await this.getDB();

    return await this.dbManager.executeWithMetrics(
      'GET_SESSION',
      async () => {
        if (includeRelations) {
          const session = await db.query.telemetrySessions.findFirst({
            where: eq(telemetrySessions.id, sessionId),
            with: {
              events: {
                orderBy: desc(telemetryEvents.timestamp),
              },
              buffers: true,
              errors: true,
            },
          });
          return session || null;
        } else {
          const sessions = await db
            .select()
            .from(telemetrySessions)
            .where(eq(telemetrySessions.id, sessionId))
            .limit(1);
          return sessions[0] || null;
        }
      }
    );
  }

  /**
   * Query sessions with filters
   */
  async querySessions(filter: SessionQueryFilter = {}): Promise<TelemetrySession[]> {
    const db = await this.getDB();

    return await this.dbManager.executeWithMetrics(
      'QUERY_SESSIONS',
      async () => {
        let query = db.select().from(telemetrySessions);

        // Build WHERE conditions
        const conditions = [];
        
        if (filter.from !== undefined) {
          conditions.push(gte(telemetrySessions.startTime, filter.from));
        }
        
        if (filter.to !== undefined) {
          conditions.push(lte(telemetrySessions.startTime, filter.to));
        }
        
        if (filter.status) {
          if (Array.isArray(filter.status)) {
            conditions.push(
              or(...filter.status.map(s => eq(telemetrySessions.status, s)))
            );
          } else {
            conditions.push(eq(telemetrySessions.status, filter.status));
          }
        }
        
        if (filter.agentType) {
          conditions.push(eq(telemetrySessions.agentType, filter.agentType));
        }
        
        if (filter.mode) {
          conditions.push(eq(telemetrySessions.mode, filter.mode));
        }
        
        if (filter.sandboxId) {
          conditions.push(eq(telemetrySessions.sandboxId, filter.sandboxId));
        }
        
        if (filter.minDuration !== undefined) {
          conditions.push(gte(telemetrySessions.duration, filter.minDuration));
        }
        
        if (filter.maxDuration !== undefined) {
          conditions.push(lte(telemetrySessions.duration, filter.maxDuration));
        }
        
        if (filter.minEventCount !== undefined) {
          conditions.push(gte(telemetrySessions.eventCount, filter.minEventCount));
        }
        
        if (filter.maxEventCount !== undefined) {
          conditions.push(lte(telemetrySessions.eventCount, filter.maxEventCount));
        }

        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }

        // Add ordering
        if (filter.orderBy) {
          switch (filter.orderBy) {
            case 'start_time_asc':
              query = query.orderBy(asc(telemetrySessions.startTime));
              break;
            case 'start_time_desc':
              query = query.orderBy(desc(telemetrySessions.startTime));
              break;
            case 'duration_asc':
              query = query.orderBy(asc(telemetrySessions.duration));
              break;
            case 'duration_desc':
              query = query.orderBy(desc(telemetrySessions.duration));
              break;
            default:
              query = query.orderBy(desc(telemetrySessions.startTime));
          }
        } else {
          query = query.orderBy(desc(telemetrySessions.startTime));
        }

        // Add pagination
        if (filter.limit !== undefined) {
          query = query.limit(filter.limit);
          
          if (filter.offset !== undefined) {
            query = query.offset(filter.offset);
          }
        }

        return await query.execute();
      }
    );
  }

  /**
   * Update session statistics (event counts, duration, etc.)
   */
  async updateSessionStats(sessionId: string): Promise<void> {
    const db = await this.getDB();

    await this.dbManager.executeWithMetrics(
      'UPDATE_SESSION_STATS',
      async () => {
        // Get session events statistics
        const stats = await db
          .select({
            totalEvents: count(),
            streamEvents: count(sql`CASE WHEN ${telemetryEvents.eventType} = 'stream' THEN 1 END`),
            errorEvents: count(sql`CASE WHEN ${telemetryEvents.eventType} = 'error' THEN 1 END`),
            minTimestamp: min(telemetryEvents.timestamp),
            maxTimestamp: max(telemetryEvents.timestamp),
          })
          .from(telemetryEvents)
          .where(eq(telemetryEvents.sessionId, sessionId))
          .groupBy(telemetryEvents.sessionId);

        if (stats.length > 0) {
          const stat = stats[0];
          const duration = stat.maxTimestamp && stat.minTimestamp 
            ? stat.maxTimestamp - stat.minTimestamp 
            : null;

          await db
            .update(telemetrySessions)
            .set({
              eventCount: stat.totalEvents,
              streamEventCount: stat.streamEvents,
              errorCount: stat.errorEvents,
              duration,
              endTime: stat.maxTimestamp,
              updatedAt: Date.now(),
            })
            .where(eq(telemetrySessions.id, sessionId));
        }
      }
    );
  }

  // =============================================================================
  // EVENT OPERATIONS
  // =============================================================================

  /**
   * Insert a single telemetry event
   */
  async insertEvent(event: NewTelemetryEvent): Promise<TelemetryEvent> {
    const db = await this.getDB();

    return await this.dbManager.executeWithMetrics(
      'INSERT_EVENT',
      async () => {
        const [inserted] = await db
          .insert(telemetryEvents)
          .values({
            ...event,
            createdAt: Date.now(),
          })
          .returning();
        return inserted;
      }
    );
  }

  /**
   * Insert multiple events in a transaction
   */
  async insertEventBatch(events: NewTelemetryEvent[]): Promise<BatchInsertResult> {
    if (events.length === 0) {
      return {
        eventsInserted: 0,
        sessionsUpserted: 0,
        buffersProcessed: 0,
        errorsLogged: 0,
        processingTime: 0,
      };
    }

    const db = await this.getDB();
    const startTime = Date.now();

    return await this.dbManager.executeWithMetrics(
      'INSERT_EVENT_BATCH',
      async () => {
        const result = await db.transaction(async (tx) => {
          // Insert all events
          const eventsWithTimestamp = events.map(event => ({
            ...event,
            createdAt: Date.now(),
          }));

          await tx.insert(telemetryEvents).values(eventsWithTimestamp);

          // Update session statistics for affected sessions
          const sessionIds = [...new Set(events.map(e => e.sessionId))];
          for (const sessionId of sessionIds) {
            await this.updateSessionStatsInTransaction(tx, sessionId);
          }

          return {
            eventsInserted: events.length,
            sessionsUpserted: sessionIds.length,
            buffersProcessed: 0,
            errorsLogged: 0,
            processingTime: Date.now() - startTime,
          };
        });

        return result;
      }
    );
  }

  /**
   * Update session statistics within a transaction
   */
  private async updateSessionStatsInTransaction(tx: any, sessionId: string): Promise<void> {
    const stats = await tx
      .select({
        totalEvents: count(),
        streamEvents: count(sql`CASE WHEN ${telemetryEvents.eventType} = 'stream' THEN 1 END`),
        errorEvents: count(sql`CASE WHEN ${telemetryEvents.eventType} = 'error' THEN 1 END`),
        minTimestamp: min(telemetryEvents.timestamp),
        maxTimestamp: max(telemetryEvents.timestamp),
      })
      .from(telemetryEvents)
      .where(eq(telemetryEvents.sessionId, sessionId))
      .groupBy(telemetryEvents.sessionId);

    if (stats.length > 0) {
      const stat = stats[0];
      const duration = stat.maxTimestamp && stat.minTimestamp 
        ? stat.maxTimestamp - stat.minTimestamp 
        : null;

      await tx
        .update(telemetrySessions)
        .set({
          eventCount: stat.totalEvents,
          streamEventCount: stat.streamEvents,
          errorCount: stat.errorEvents,
          duration,
          endTime: stat.maxTimestamp,
          updatedAt: Date.now(),
        })
        .where(eq(telemetrySessions.id, sessionId));
    }
  }

  /**
   * Query events with filters
   */
  async queryEvents(filter: TelemetryQueryFilter = {}): Promise<TelemetryEvent[]> {
    const db = await this.getDB();

    return await this.dbManager.executeWithMetrics(
      'QUERY_EVENTS',
      async () => {
        let query = db.select().from(telemetryEvents);

        // Build WHERE conditions
        const conditions = [];
        
        if (filter.from !== undefined) {
          conditions.push(gte(telemetryEvents.timestamp, filter.from));
        }
        
        if (filter.to !== undefined) {
          conditions.push(lte(telemetryEvents.timestamp, filter.to));
        }
        
        if (filter.sessionId) {
          conditions.push(eq(telemetryEvents.sessionId, filter.sessionId));
        }
        
        if (filter.eventType) {
          conditions.push(eq(telemetryEvents.eventType, filter.eventType));
        }
        
        if (filter.agentType) {
          conditions.push(eq(telemetryEvents.agentType, filter.agentType));
        }
        
        if (filter.mode) {
          conditions.push(eq(telemetryEvents.mode, filter.mode));
        }
        
        if (filter.sandboxId) {
          conditions.push(eq(telemetryEvents.sandboxId, filter.sandboxId));
        }

        if (conditions.length > 0) {
          query = query.where(and(...conditions));
        }

        // Add ordering
        if (filter.orderBy) {
          switch (filter.orderBy) {
            case 'timestamp_asc':
              query = query.orderBy(asc(telemetryEvents.timestamp));
              break;
            case 'timestamp_desc':
              query = query.orderBy(desc(telemetryEvents.timestamp));
              break;
            case 'created_at_asc':
              query = query.orderBy(asc(telemetryEvents.createdAt));
              break;
            case 'created_at_desc':
              query = query.orderBy(desc(telemetryEvents.createdAt));
              break;
            default:
              query = query.orderBy(desc(telemetryEvents.timestamp));
          }
        } else {
          query = query.orderBy(desc(telemetryEvents.timestamp));
        }

        // Add pagination
        if (filter.limit !== undefined) {
          query = query.limit(filter.limit);
          
          if (filter.offset !== undefined) {
            query = query.offset(filter.offset);
          }
        }

        return await query.execute();
      }
    );
  }

  // =============================================================================
  // BUFFER OPERATIONS
  // =============================================================================

  /**
   * Create or update a stream buffer
   */
  async upsertBuffer(buffer: NewTelemetryBuffer): Promise<void> {
    const db = await this.getDB();

    await this.dbManager.executeWithMetrics(
      'UPSERT_BUFFER',
      async () => {
        const existing = await db
          .select()
          .from(telemetryBuffers)
          .where(
            and(
              eq(telemetryBuffers.sessionId, buffer.sessionId),
              eq(telemetryBuffers.status, 'pending')
            )
          )
          .limit(1);

        if (existing.length > 0) {
          // Update existing buffer
          await db
            .update(telemetryBuffers)
            .set({
              ...buffer,
              lastUpdated: Date.now(),
            })
            .where(eq(telemetryBuffers.id, existing[0].id));
        } else {
          // Create new buffer
          await db
            .insert(telemetryBuffers)
            .values({
              ...buffer,
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            });
        }
      }
    );
  }

  /**
   * Flush a buffer and insert its events
   */
  async flushBuffer(sessionId: string): Promise<number> {
    const db = await this.getDB();

    return await this.dbManager.executeWithMetrics(
      'FLUSH_BUFFER',
      async () => {
        return await db.transaction(async (tx) => {
          // Get pending buffers for this session
          const buffers = await tx
            .select()
            .from(telemetryBuffers)
            .where(
              and(
                eq(telemetryBuffers.sessionId, sessionId),
                eq(telemetryBuffers.status, 'pending')
              )
            );

          let totalFlushed = 0;

          for (const buffer of buffers) {
            try {
              // Parse buffer data
              const events: NewTelemetryEvent[] = JSON.parse(buffer.bufferData);
              
              if (events.length > 0) {
                // Insert events
                const eventsWithTimestamp = events.map(event => ({
                  ...event,
                  createdAt: Date.now(),
                }));

                await tx.insert(telemetryEvents).values(eventsWithTimestamp);
                totalFlushed += events.length;
              }

              // Mark buffer as flushed
              await tx
                .update(telemetryBuffers)
                .set({
                  status: 'flushed',
                  flushedAt: Date.now(),
                  lastUpdated: Date.now(),
                })
                .where(eq(telemetryBuffers.id, buffer.id));

            } catch (error) {
              // Mark buffer as failed
              await tx
                .update(telemetryBuffers)
                .set({
                  status: 'failed',
                  flushAttempts: buffer.flushAttempts + 1,
                  lastUpdated: Date.now(),
                })
                .where(eq(telemetryBuffers.id, buffer.id));

              console.warn(`Failed to flush buffer ${buffer.id}:`, error);
            }
          }

          // Update session statistics
          if (totalFlushed > 0) {
            await this.updateSessionStatsInTransaction(tx, sessionId);
          }

          return totalFlushed;
        });
      }
    );
  }

  /**
   * Clean up old flushed buffers
   */
  async cleanupBuffers(maxAgeMs: number = 300000): Promise<number> {
    const db = await this.getDB();

    return await this.dbManager.executeWithMetrics(
      'CLEANUP_BUFFERS',
      async () => {
        const cutoffTime = Date.now() - maxAgeMs;
        const result = await db
          .delete(telemetryBuffers)
          .where(
            and(
              eq(telemetryBuffers.status, 'flushed'),
              lte(telemetryBuffers.flushedAt, cutoffTime)
            )
          );
        
        return result.changes || 0;
      }
    );
  }

  // =============================================================================
  // ERROR OPERATIONS
  // =============================================================================

  /**
   * Log a telemetry error
   */
  async logError(error: NewTelemetryError): Promise<void> {
    const db = await this.getDB();

    await this.dbManager.executeWithMetrics(
      'LOG_ERROR',
      async () => {
        await db
          .insert(telemetryErrors)
          .values({
            ...error,
            createdAt: Date.now(),
          });
      }
    );
  }

  // =============================================================================
  // STATISTICS OPERATIONS
  // =============================================================================

  /**
   * Get comprehensive telemetry statistics
   */
  async getStatistics(): Promise<TelemetryStatsSummary> {
    const db = await this.getDB();

    return await this.dbManager.executeWithMetrics(
      'GET_STATISTICS',
      async () => {
        // Get event counts by type
        const eventStats = await db
          .select({
            eventType: telemetryEvents.eventType,
            count: count(),
          })
          .from(telemetryEvents)
          .groupBy(telemetryEvents.eventType);

        // Get agent breakdown
        const agentStats = await db
          .select({
            agentType: telemetryEvents.agentType,
            count: count(),
          })
          .from(telemetryEvents)
          .groupBy(telemetryEvents.agentType);

        // Get mode breakdown
        const modeStats = await db
          .select({
            mode: telemetryEvents.mode,
            count: count(),
          })
          .from(telemetryEvents)
          .groupBy(telemetryEvents.mode);

        // Get overall statistics
        const overallStats = await db
          .select({
            totalEvents: count(telemetryEvents.id),
            totalSessions: count(sql`DISTINCT ${telemetryEvents.sessionId}`),
            minTimestamp: min(telemetryEvents.timestamp),
            maxTimestamp: max(telemetryEvents.timestamp),
          })
          .from(telemetryEvents);

        // Get average session duration
        const sessionDurationStats = await db
          .select({
            avgDuration: avg(telemetrySessions.duration),
          })
          .from(telemetrySessions)
          .where(sql`${telemetrySessions.duration} IS NOT NULL`);

        // Build result
        const eventBreakdown = {
          start: 0,
          stream: 0,
          end: 0,
          error: 0,
        };

        eventStats.forEach(stat => {
          if (stat.eventType in eventBreakdown) {
            eventBreakdown[stat.eventType as keyof typeof eventBreakdown] = stat.count;
          }
        });

        const agentBreakdown = agentStats.reduce((acc, stat) => {
          acc[stat.agentType] = stat.count;
          return acc;
        }, {} as Record<string, number>);

        const modeBreakdown = modeStats.reduce((acc, stat) => {
          acc[stat.mode] = stat.count;
          return acc;
        }, {} as Record<string, number>);

        const overall = overallStats[0];
        const avgDuration = sessionDurationStats[0]?.avgDuration || 0;

        return {
          totalEvents: overall?.totalEvents || 0,
          totalSessions: overall?.totalSessions || 0,
          eventBreakdown,
          agentBreakdown,
          modeBreakdown,
          dateRange: {
            earliest: overall?.minTimestamp || 0,
            latest: overall?.maxTimestamp || 0,
          },
          avgSessionDuration: avgDuration,
          dbSizeBytes: this.dbManager.getMetrics().dbSizeBytes,
        };
      }
    );
  }

  /**
   * Clear all telemetry data
   */
  async clearAllData(): Promise<void> {
    const db = await this.getDB();

    await this.dbManager.executeWithMetrics(
      'CLEAR_ALL_DATA',
      async () => {
        await db.transaction(async (tx) => {
          await tx.delete(telemetryErrors);
          await tx.delete(telemetryBuffers);
          await tx.delete(telemetryEvents);
          await tx.delete(telemetrySessions);
          await tx.delete(telemetryStats);
        });

        // Vacuum database to reclaim space
        await db.run(sql`VACUUM`);
      }
    );
  }

  /**
   * Get database health status
   */
  async getHealthStatus(): Promise<boolean> {
    return await this.dbManager.healthCheck();
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return this.dbManager.getMetrics();
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    await this.dbManager.close();
  }
} 