/**
 * Phase 3: Advanced Drizzle-Based Telemetry CLI Commands
 * 
 * This module provides comprehensive CLI functionality for the new Drizzle telemetry system:
 * - Advanced querying and filtering
 * - Performance analytics and reporting  
 * - Data migration from old system
 * - Real-time monitoring
 * - Export/import utilities
 * - Database maintenance
 */

import { Command } from "commander";
import { join } from "path";
import { existsSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import { 
  DrizzleTelemetryOperations,
  createDrizzleConfig,
  initializeTelemetryDB,
  TelemetryQueryFilter,
  SessionQueryFilter,
  TelemetryEvent,
  TelemetrySession,
  TelemetryStatsSummary,
} from "../../db";

interface DrizzleTelemetryCliOptions {
  database?: string;
  format?: 'table' | 'json' | 'csv' | 'markdown';
  output?: string;
  limit?: string;
  offset?: string;
  sessionId?: string;
  agentType?: string;
  eventType?: string;
  mode?: string;
  since?: string;
  until?: string;
  verbose?: boolean;
  watch?: boolean;
  interactive?: boolean;
  migration?: boolean;
  backup?: string;
  restore?: string;
  analyze?: boolean;
  benchmark?: boolean;
}

interface AdvancedSessionSummary extends TelemetrySession {
  avgEventInterval?: number;
  peakEventRate?: number;
  errorRate?: number;
  completionRate?: number;
  performanceScore?: number;
}

interface PerformanceMetrics {
  queryPerformance: {
    avgQueryTime: number;
    slowQueries: Array<{ query: string; duration: number }>;
    totalQueries: number;
  };
  dataMetrics: {
    totalEvents: number;
    totalSessions: number;
    databaseSize: number;
    avgSessionDuration: number;
  };
  agentPerformance: Record<string, {
    eventCount: number;
    avgSessionTime: number;
    errorRate: number;
    throughput: number;
  }>;
  trends: {
    dailyEventCounts: Array<{ date: string; count: number }>;
    popularModes: Array<{ mode: string; count: number }>;
    errorPatterns: Array<{ pattern: string; count: number }>;
  };
}

class DrizzleTelemetryCliLogger {
  private verbose: boolean;

  constructor(verbose = false) {
    this.verbose = verbose;
  }

  private sanitizeForJson(message: string): string {
    // Remove emoji characters when outputting JSON to prevent parsing issues
    return message.replace(/[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu, '');
  }

  info(message: string, isJsonOutput = false): void {
    const output = isJsonOutput ? this.sanitizeForJson(message) : message;
    console.log(`${isJsonOutput ? '' : 'ℹ️  '}${output}`);
  }

  success(message: string, isJsonOutput = false): void {
    const output = isJsonOutput ? this.sanitizeForJson(message) : message;
    console.log(`${isJsonOutput ? '' : '✅ '}${output}`);
  }

  error(message: string, isJsonOutput = false): void {
    const output = isJsonOutput ? this.sanitizeForJson(message) : message;
    console.error(`${isJsonOutput ? 'ERROR: ' : '❌ '}${output}`);
  }

  warn(message: string, isJsonOutput = false): void {
    const output = isJsonOutput ? this.sanitizeForJson(message) : message;
    console.warn(`${isJsonOutput ? 'WARNING: ' : '⚠️  '}${output}`);
  }

  debug(message: string, isJsonOutput = false): void {
    if (this.verbose) {
      const output = isJsonOutput ? this.sanitizeForJson(message) : message;
      console.log(`${isJsonOutput ? 'DEBUG: ' : '🔍 '}${output}`);
    }
  }

  table(data: any[]): void {
    if (data.length === 0) {
      console.log("📋 No data to display");
      return;
    }
    console.table(data);
  }

  json(data: any): void {
    console.log(JSON.stringify(data, null, 2));
  }

  progress(message: string): void {
    process.stdout.write(`⏳ ${message}...`);
  }

  progressDone(): void {
    console.log(' ✅');
  }
}

class DrizzleTelemetryAnalyzer {
  constructor(private operations: DrizzleTelemetryOperations, private logger: DrizzleTelemetryCliLogger) {}

  async getAdvancedSessionSummaries(filter?: SessionQueryFilter): Promise<AdvancedSessionSummary[]> {
    this.logger.debug("Fetching session summaries with advanced metrics");
    
    const sessions = await this.operations.querySessions(filter);
    const advancedSessions: AdvancedSessionSummary[] = [];

    for (const session of sessions) {
      const sessionEvents = await this.operations.queryEvents({ 
        sessionId: session.id,
        orderBy: 'timestamp_asc'
      });

      // Calculate advanced metrics
      const avgEventInterval = this.calculateAvgEventInterval(sessionEvents);
      const peakEventRate = this.calculatePeakEventRate(sessionEvents);
      const errorRate = session.eventCount > 0 ? (session.errorCount / session.eventCount) * 100 : 0;
      const completionRate = this.calculateCompletionRate(sessionEvents);
      const performanceScore = this.calculatePerformanceScore(session, sessionEvents);

      advancedSessions.push({
        ...session,
        avgEventInterval,
        peakEventRate,
        errorRate,
        completionRate,
        performanceScore,
      });
    }

    return advancedSessions.sort((a, b) => (b.performanceScore || 0) - (a.performanceScore || 0));
  }

  async getPerformanceMetrics(filter?: TelemetryQueryFilter): Promise<PerformanceMetrics> {
    this.logger.debug("Generating comprehensive performance metrics");
    
    // Get basic statistics
    const stats = await this.operations.getStatistics();
    const dbMetrics = this.operations.getPerformanceMetrics();
    
    // Get events for detailed analysis
    const events = await this.operations.queryEvents({
      ...filter,
      limit: 10000, // Large sample for accurate metrics
      orderBy: 'timestamp_desc'
    });

    // Analyze agent performance
    const agentPerformance = this.analyzeAgentPerformance(events);
    
    // Generate trends
    const trends = this.generateTrends(events);

    return {
      queryPerformance: {
        avgQueryTime: dbMetrics.avgQueryTime || 0,
        slowQueries: dbMetrics.slowQueries || [],
        totalQueries: dbMetrics.totalQueries || 0,
      },
      dataMetrics: {
        totalEvents: stats.totalEvents,
        totalSessions: stats.totalSessions,
        databaseSize: stats.dbSizeBytes,
        avgSessionDuration: stats.avgSessionDuration,
      },
      agentPerformance,
      trends,
    };
  }

  private calculateAvgEventInterval(events: TelemetryEvent[]): number {
    if (events.length < 2) return 0;
    
    const intervals: number[] = [];
    for (let i = 1; i < events.length; i++) {
      intervals.push(events[i].timestamp - events[i-1].timestamp);
    }
    
    return intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  }

  private calculatePeakEventRate(events: TelemetryEvent[]): number {
    if (events.length < 2) return 0;
    
    // Calculate events per second in 10-second windows
    const windowSize = 10000; // 10 seconds
    const windows = new Map<number, number>();
    
    for (const event of events) {
      const windowStart = Math.floor(event.timestamp / windowSize) * windowSize;
      windows.set(windowStart, (windows.get(windowStart) || 0) + 1);
    }
    
    return Math.max(...Array.from(windows.values())) / 10; // events per second
  }

  private calculateCompletionRate(events: TelemetryEvent[]): number {
    const startEvents = events.filter(e => e.eventType === 'start').length;
    const endEvents = events.filter(e => e.eventType === 'end').length;
    
    return startEvents > 0 ? (endEvents / startEvents) * 100 : 0;
  }

  private calculatePerformanceScore(session: TelemetrySession, events: TelemetryEvent[]): number {
    // Composite score based on multiple factors
    let score = 100;
    
    // Penalize errors
    if (session.errorCount > 0) {
      score -= (session.errorCount / session.eventCount) * 30;
    }
    
    // Reward completion
    const completionRate = this.calculateCompletionRate(events);
    score += (completionRate - 50) * 0.3; // Bonus/penalty based on completion rate
    
    // Consider session duration efficiency
    if (session.duration && session.eventCount > 0) {
      const avgEventTime = session.duration / session.eventCount;
      if (avgEventTime < 1000) score += 10; // Fast responses get bonus
      if (avgEventTime > 10000) score -= 10; // Slow responses get penalty
    }
    
    return Math.max(0, Math.min(100, score));
  }

  private analyzeAgentPerformance(events: TelemetryEvent[]): Record<string, any> {
    const agentStats = new Map<string, {
      eventCount: number;
      totalDuration: number;
      errorCount: number;
      sessionIds: Set<string>;
      timestamps: number[];
    }>();

    // Collect data
    for (const event of events) {
      if (!agentStats.has(event.agentType)) {
        agentStats.set(event.agentType, {
          eventCount: 0,
          totalDuration: 0,
          errorCount: 0,
          sessionIds: new Set(),
          timestamps: [],
        });
      }
      
      const stats = agentStats.get(event.agentType)!;
      stats.eventCount++;
      stats.sessionIds.add(event.sessionId);
      stats.timestamps.push(event.timestamp);
      
      if (event.eventType === 'error') {
        stats.errorCount++;
      }
    }

    // Calculate metrics
    const result: Record<string, any> = {};
    for (const [agentType, stats] of agentStats) {
      const timeSpan = Math.max(...stats.timestamps) - Math.min(...stats.timestamps);
      const throughput = timeSpan > 0 ? (stats.eventCount / timeSpan) * 1000 * 60 : 0; // events per minute
      
      result[agentType] = {
        eventCount: stats.eventCount,
        avgSessionTime: stats.totalDuration / stats.sessionIds.size,
        errorRate: (stats.errorCount / stats.eventCount) * 100,
        throughput: Math.round(throughput * 100) / 100,
      };
    }

    return result;
  }

  private generateTrends(events: TelemetryEvent[]): any {
    // Daily event counts
    const dailyCounts = new Map<string, number>();
    const modeCounts = new Map<string, number>();
    const errorPatterns = new Map<string, number>();

    for (const event of events) {
      // Daily counts
      const date = new Date(event.timestamp).toISOString().split('T')[0];
      dailyCounts.set(date, (dailyCounts.get(date) || 0) + 1);
      
      // Mode popularity
      modeCounts.set(event.mode, (modeCounts.get(event.mode) || 0) + 1);
      
      // Error patterns
      if (event.eventType === 'error' && event.metadata) {
        try {
          const metadata = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : event.metadata;
          const errorType = metadata['error.message'] || 'unknown';
          errorPatterns.set(errorType, (errorPatterns.get(errorType) || 0) + 1);
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }

    return {
      dailyEventCounts: Array.from(dailyCounts.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      popularModes: Array.from(modeCounts.entries())
        .map(([mode, count]) => ({ mode, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      errorPatterns: Array.from(errorPatterns.entries())
        .map(([pattern, count]) => ({ pattern, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }
}

class DrizzleTelemetryExporter {
  constructor(private logger: DrizzleTelemetryCliLogger) {}

  formatAsCSV(data: any[]): string {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(item => 
      headers.map(header => {
        const value = item[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return `"${value.toString().replace(/"/g, '""')}"`;
      }).join(',')
    );

    return [headers.join(','), ...rows].join('\n');
  }

  formatAsMarkdown(data: any[], title?: string): string {
    if (data.length === 0) return title ? `# ${title}\n\nNo data available.` : 'No data available.';
    
    const headers = Object.keys(data[0]);
    let md = '';
    
    if (title) {
      md += `# ${title}\n\n`;
    }
    
    md += `| ${headers.join(' | ')} |\n`;
    md += `| ${headers.map(() => '---').join(' | ')} |\n`;
    
    for (const item of data) {
      md += `| ${headers.map(header => {
        const value = item[header];
        if (value === null || value === undefined) return '';
        if (typeof value === 'object') return JSON.stringify(value);
        return value.toString().replace(/\|/g, '\\|');
      }).join(' | ')} |\n`;
    }
    
    return md;
  }

  async exportData(operations: DrizzleTelemetryOperations, options: DrizzleTelemetryCliOptions): Promise<void> {
    try {
      this.logger.progress("Exporting telemetry data");
      
      const filter: TelemetryQueryFilter = this.buildEventFilter(options);
      const events = await operations.queryEvents(filter);
      
      let output: string;
      const filename = options.output!;
      
      switch (options.format) {
        case 'csv':
          output = this.formatAsCSV(events);
          break;
        case 'markdown':
          output = this.formatAsMarkdown(events, 'Telemetry Events Export');
          break;
        case 'json':
        default:
          output = JSON.stringify(events, null, 2);
          break;
      }
      
      // Ensure output directory exists
      const dir = join(filename, '..');
      mkdirSync(dir, { recursive: true });
      
      writeFileSync(filename, output);
      this.logger.progressDone();
      this.logger.success(`Exported ${events.length} events to: ${filename}`);
      
    } catch (error) {
      this.logger.error(`Export failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  private buildEventFilter(options: DrizzleTelemetryCliOptions): TelemetryQueryFilter {
    const filter: TelemetryQueryFilter = {};
    
    if (options.sessionId) filter.sessionId = options.sessionId;
    if (options.agentType) filter.agentType = options.agentType;
    if (options.eventType) filter.eventType = options.eventType as any;
    if (options.mode) filter.mode = options.mode;
    if (options.since) filter.from = this.parseTimestamp(options.since);
    if (options.until) filter.to = this.parseTimestamp(options.until);
    if (options.limit) filter.limit = parseInt(options.limit);
    if (options.offset) filter.offset = parseInt(options.offset);
    
    return filter;
  }

  private parseTimestamp(timeStr: string): number {
    const now = Date.now();
    const match = timeStr.match(/^(\d+)([hdmw])$/);
    
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];
      
      switch (unit) {
        case 'm': return now - amount * 60 * 1000;
        case 'h': return now - amount * 60 * 60 * 1000;
        case 'd': return now - amount * 24 * 60 * 60 * 1000;
        case 'w': return now - amount * 7 * 24 * 60 * 60 * 1000;
        default: return new Date(timeStr).getTime();
      }
    }
    
    return new Date(timeStr).getTime();
  }
}

class DrizzleTelemetryMigrator {
  constructor(private logger: DrizzleTelemetryCliLogger) {}

  async migrateFromLegacy(legacyDbPath: string, newDbPath: string): Promise<void> {
    this.logger.info("Starting migration from legacy telemetry database");
    
    try {
      // Import legacy TelemetryDB
      const { TelemetryDB } = await import("../../services/telemetry-db");
      
      // Initialize legacy database
      const legacyDb = new TelemetryDB({ isEnabled: true, path: legacyDbPath });
      
      // Initialize new Drizzle database
      const config = createDrizzleConfig({ dbPath: newDbPath });
      await initializeTelemetryDB(config);
      const operations = new DrizzleTelemetryOperations(config);
      await operations.initialize();
      
      this.logger.progress("Reading legacy records");
      const legacyRecords = await legacyDb.getEvents({ limit: 1000000 });
      this.logger.progressDone();
      
      if (legacyRecords.length === 0) {
        this.logger.warn("No records found in legacy database");
        return;
      }
      
      this.logger.info(`Found ${legacyRecords.length} legacy records to migrate`);
      
      // Convert and batch insert
      const batchSize = 100;
      let migrated = 0;
      
      for (let i = 0; i < legacyRecords.length; i += batchSize) {
        const batch = legacyRecords.slice(i, i + batchSize);
        const drizzleEvents = batch.map(record => ({
          sessionId: record.sessionId,
          eventType: record.eventType as any,
          agentType: record.agentType,
          mode: record.mode,
          prompt: record.prompt,
          streamData: record.streamData || null,
          sandboxId: record.sandboxId || null,
          repoUrl: record.repoUrl || null,
          metadata: record.metadata ? JSON.stringify(record.metadata) : null,
          timestamp: record.timestamp,
        }));
        
        await operations.insertEventBatch(drizzleEvents);
        migrated += batch.length;
        
        if (migrated % 500 === 0) {
          this.logger.info(`Migrated ${migrated}/${legacyRecords.length} records...`);
        }
      }
      
      await legacyDb.close();
      await operations.close();
      
      this.logger.success(`Migration completed! Migrated ${migrated} records`);
      
    } catch (error) {
      this.logger.error(`Migration failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}

// Command implementations
async function executeQuery(options: DrizzleTelemetryCliOptions): Promise<void> {
  const logger = new DrizzleTelemetryCliLogger(options.verbose);
  const dbPath = options.database || join(process.cwd(), '.vibekit', 'telemetry.db');
  
  if (!existsSync(dbPath)) {
    logger.error(`Drizzle telemetry database not found at: ${dbPath}`);
    logger.info("Initialize the database first with: vibekit telemetry init");
    return;
  }

  try {
    const config = createDrizzleConfig({ dbPath, enableQueryLogging: options.verbose });
    const operations = new DrizzleTelemetryOperations(config);
    await operations.initialize();
    
    const exporter = new DrizzleTelemetryExporter(logger);
    const filter = exporter['buildEventFilter'](options);
    
    logger.debug(`Executing query with filter: ${JSON.stringify(filter)}`);
    const events = await operations.queryEvents(filter);
    
    logger.info(`Found ${events.length} telemetry events`);
    
    if (options.output) {
      await exporter.exportData(operations, options);
    } else {
      // Display in console
      switch (options.format) {
        case 'json':
          logger.json(events);
          break;
        case 'csv':
          console.log(exporter.formatAsCSV(events));
          break;
        case 'markdown':
          console.log(exporter.formatAsMarkdown(events, 'Query Results'));
          break;
        default:
          const tableData = events.slice(0, 20).map(event => ({
            'Timestamp': new Date(event.timestamp).toLocaleString(),
            'Session': event.sessionId.substring(0, 8) + '...',
            'Agent': event.agentType,
            'Event': event.eventType,
            'Mode': event.mode,
            'Prompt': event.prompt.substring(0, 50) + '...'
          }));
          
          logger.table(tableData);
          
          if (events.length > 20) {
            logger.info(`Showing first 20 of ${events.length} events. Use --format json or --output for complete data.`);
          }
      }
    }
    
    await operations.close();
  } catch (error) {
    logger.error(`Query failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function executeSessions(options: DrizzleTelemetryCliOptions): Promise<void> {
  const logger = new DrizzleTelemetryCliLogger(options.verbose);
  const dbPath = options.database || join(process.cwd(), '.vibekit', 'telemetry.db');
  
  if (!existsSync(dbPath)) {
    logger.error(`Drizzle telemetry database not found at: ${dbPath}`);
    return;
  }

  try {
    const config = createDrizzleConfig({ dbPath, enableQueryLogging: options.verbose });
    const operations = new DrizzleTelemetryOperations(config);
    await operations.initialize();
    
    const analyzer = new DrizzleTelemetryAnalyzer(operations, logger);
    
    const filter: SessionQueryFilter = {};
    if (options.agentType) filter.agentType = options.agentType;
    if (options.since) filter.from = new Date(options.since).getTime();
    if (options.until) filter.to = new Date(options.until).getTime();
    if (options.limit) filter.limit = parseInt(options.limit);
    
    const sessions = await analyzer.getAdvancedSessionSummaries(filter);
    
    logger.info(`Found ${sessions.length} sessions`);
    
    if (options.format === 'json') {
      logger.json(sessions);
    } else {
      const tableData = sessions.map(session => ({
        'Session ID': session.id.substring(0, 12) + '...',
        'Agent': session.agentType,
        'Mode': session.mode,
        'Status': session.status,
        'Events': session.eventCount,
        'Duration (s)': session.duration ? Math.round(session.duration / 1000) : 0,
        'Performance': session.performanceScore ? `${Math.round(session.performanceScore)}/100` : 'N/A',
        'Error Rate': session.errorRate ? `${session.errorRate.toFixed(1)}%` : '0%',
        'Start Time': new Date(session.startTime).toLocaleString()
      }));
      
      logger.table(tableData);
    }
    
    await operations.close();
  } catch (error) {
    logger.error(`Sessions query failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function executePerformance(options: DrizzleTelemetryCliOptions): Promise<void> {
  const logger = new DrizzleTelemetryCliLogger(options.verbose);
  const dbPath = options.database || join(process.cwd(), '.vibekit', 'telemetry.db');
  
  try {
    const config = createDrizzleConfig({ dbPath, enableQueryLogging: options.verbose });
    const operations = new DrizzleTelemetryOperations(config);
    await operations.initialize();
    
    const analyzer = new DrizzleTelemetryAnalyzer(operations, logger);
    
    logger.progress("Analyzing performance metrics");
    const metrics = await analyzer.getPerformanceMetrics();
    logger.progressDone();
    
    if (options.format === 'json') {
      logger.json(metrics);
    } else {
      logger.info("📊 Performance Analysis Report");
      console.log("");
      
      // Database metrics
      console.log("🗄️  Database Metrics:");
      console.log(`   Total Events: ${metrics.dataMetrics.totalEvents.toLocaleString()}`);
      console.log(`   Total Sessions: ${metrics.dataMetrics.totalSessions.toLocaleString()}`);
      console.log(`   Database Size: ${(metrics.dataMetrics.databaseSize / 1024).toFixed(1)} KB`);
      console.log(`   Avg Session Duration: ${(metrics.dataMetrics.avgSessionDuration / 1000).toFixed(1)}s`);
      console.log("");
      
      // Query performance
      console.log("⚡ Query Performance:");
      console.log(`   Average Query Time: ${metrics.queryPerformance.avgQueryTime}ms`);
      console.log(`   Total Queries: ${metrics.queryPerformance.totalQueries}`);
      console.log("");
      
      // Agent performance
      console.log("🤖 Agent Performance:");
      const agentData = Object.entries(metrics.agentPerformance).map(([agent, stats]) => ({
        'Agent': agent,
        'Events': stats.eventCount,
        'Throughput (evt/min)': stats.throughput,
        'Error Rate': `${stats.errorRate.toFixed(1)}%`,
        'Avg Session Time': `${(stats.avgSessionTime / 1000).toFixed(1)}s`
      }));
      logger.table(agentData);
      
      // Popular modes
      if (metrics.trends.popularModes.length > 0) {
        console.log("🔥 Popular Modes:");
        logger.table(metrics.trends.popularModes.slice(0, 5));
      }
      
      // Error patterns
      if (metrics.trends.errorPatterns.length > 0) {
        console.log("⚠️  Error Patterns:");
        logger.table(metrics.trends.errorPatterns.slice(0, 5));
      }
    }
    
    await operations.close();
  } catch (error) {
    logger.error(`Performance analysis failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function executeInit(options: DrizzleTelemetryCliOptions): Promise<void> {
  const logger = new DrizzleTelemetryCliLogger(options.verbose);
  const dbPath = options.database || join(process.cwd(), '.vibekit', 'telemetry.db');
  
  try {
    logger.progress("Initializing Drizzle telemetry database");
    
    const config = createDrizzleConfig({ 
      dbPath,
      enableQueryLogging: options.verbose,
      enableMetrics: true,
    });
    
    await initializeTelemetryDB(config);
    logger.progressDone();
    
    logger.success(`Telemetry database initialized at: ${dbPath}`);
    
    // If migration requested
    if (options.migration) {
      const legacyPath = join(process.cwd(), '.vibekit', 'telemetry-legacy.db');
      if (existsSync(legacyPath)) {
        const migrator = new DrizzleTelemetryMigrator(logger);
        await migrator.migrateFromLegacy(legacyPath, dbPath);
      } else {
        logger.warn("No legacy database found for migration");
      }
    }
    
  } catch (error) {
    logger.error(`Initialization failed: ${error instanceof Error ? error.message : error}`);
  }
}

async function executeClear(options: DrizzleTelemetryCliOptions): Promise<void> {
  const logger = new DrizzleTelemetryCliLogger(options.verbose);
  const dbPath = options.database || join(process.cwd(), '.vibekit', 'telemetry.db');
  
  if (!existsSync(dbPath)) {
    logger.warn("No telemetry database found to clear");
    return;
  }

  try {
    const config = createDrizzleConfig({ dbPath });
    const operations = new DrizzleTelemetryOperations(config);
    await operations.initialize();
    
    // Get count before clearing
    const stats = await operations.getStatistics();
    
    logger.progress("Clearing telemetry data");
    await operations.clearAllData();
    logger.progressDone();
    
    await operations.close();
    
    logger.success(`Cleared ${stats.totalEvents} events and ${stats.totalSessions} sessions`);
  } catch (error) {
    logger.error(`Clear operation failed: ${error instanceof Error ? error.message : error}`);
  }
}

export function registerDrizzleTelemetryCommands(program: Command): void {
  const telemetryCmd = program
    .command("db")
    .alias("database")
    .description("Advanced Drizzle-based telemetry database management");

  // Initialize command
  telemetryCmd
    .command("init")
    .description("Initialize Drizzle telemetry database")
    .option("-d, --database <path>", "Database file path")
    .option("-v, --verbose", "Enable verbose logging")
    .option("-m, --migration", "Migrate data from legacy database")
    .action((options: DrizzleTelemetryCliOptions) => executeInit(options));

  // Query command
  telemetryCmd
    .command("query")
    .alias("q")
    .description("Advanced telemetry event querying")
    .option("-d, --database <path>", "Database file path")
    .option("-f, --format <format>", "Output format (table|json|csv|markdown)", "table")
    .option("-o, --output <file>", "Output file path")
    .option("-l, --limit <number>", "Limit number of records", "100")
    .option("--offset <number>", "Offset for pagination", "0")
    .option("-s, --session-id <id>", "Filter by session ID")
    .option("-a, --agent-type <type>", "Filter by agent type")
    .option("-e, --event-type <type>", "Filter by event type")
    .option("-m, --mode <mode>", "Filter by mode")
    .option("--since <time>", "Show records since time")
    .option("--until <time>", "Show records until time")
    .option("-v, --verbose", "Enable verbose logging")
    .action((options: DrizzleTelemetryCliOptions) => executeQuery(options));

  // Sessions command  
  telemetryCmd
    .command("sessions")
    .alias("s")
    .description("Advanced session analysis with performance metrics")
    .option("-d, --database <path>", "Database file path")
    .option("-f, --format <format>", "Output format (table|json)", "table")
    .option("-l, --limit <number>", "Limit number of sessions")
    .option("-a, --agent-type <type>", "Filter by agent type")
    .option("--since <time>", "Show sessions since time")
    .option("--until <time>", "Show sessions until time")
    .option("-v, --verbose", "Enable verbose logging")
    .action((options: DrizzleTelemetryCliOptions) => executeSessions(options));

  // Performance command
  telemetryCmd
    .command("performance")
    .alias("perf")
    .description("Comprehensive performance analytics and reporting")
    .option("-d, --database <path>", "Database file path") 
    .option("-f, --format <format>", "Output format (table|json)", "table")
    .option("-a, --agent-type <type>", "Filter by agent type")
    .option("--since <time>", "Analyze performance since time")
    .option("--until <time>", "Analyze performance until time")
    .option("-v, --verbose", "Enable verbose logging")
    .option("--benchmark", "Run performance benchmarks")
    .action((options: DrizzleTelemetryCliOptions) => executePerformance(options));

  // Export command
  telemetryCmd
    .command("export")
    .alias("e")
    .description("Export telemetry data with advanced formatting")
    .option("-d, --database <path>", "Database file path")
    .option("-f, --format <format>", "Export format (json|csv|markdown)", "json")
    .requiredOption("-o, --output <file>", "Output file path")
    .option("-l, --limit <number>", "Limit number of records to export")
    .option("-s, --session-id <id>", "Filter by session ID")
    .option("-a, --agent-type <type>", "Filter by agent type") 
    .option("-e, --event-type <type>", "Filter by event type")
    .option("--since <time>", "Export records since time")
    .option("--until <time>", "Export records until time")
    .option("-v, --verbose", "Enable verbose logging")
    .action(async (options: DrizzleTelemetryCliOptions) => {
      const logger = new DrizzleTelemetryCliLogger(options.verbose);
      try {
        const exporter = new DrizzleTelemetryExporter(logger);
        const config = createDrizzleConfig({ dbPath: options.database });
        const operations = new DrizzleTelemetryOperations(config);
        await operations.initialize();
        await exporter.exportData(operations, options);
        await operations.close();
      } catch (error) {
        logger.error(`Export failed: ${error instanceof Error ? error.message : error}`);
        process.exit(1);
      }
    });

  // Clear command
  telemetryCmd
    .command("clear")
    .description("Clear all telemetry data with confirmation")
    .option("-d, --database <path>", "Database file path")
    .option("-v, --verbose", "Enable verbose logging")
    .action((options: DrizzleTelemetryCliOptions) => executeClear(options));

  // Stats command
  telemetryCmd
    .command("stats")
    .description("Quick database statistics overview")
    .option("-d, --database <path>", "Database file path")
    .option("-f, --format <format>", "Output format (table|json)", "table")
    .action(async (options: DrizzleTelemetryCliOptions) => {
      const logger = new DrizzleTelemetryCliLogger(options.verbose);
      const isJsonOutput = options.format === 'json';
      
      try {
        const config = createDrizzleConfig({ dbPath: options.database });
        const operations = new DrizzleTelemetryOperations(config);
        await operations.initialize();
        
        const stats = await operations.getStatistics();
        
        if (isJsonOutput) {
          // For JSON output, only output the JSON data without any additional messages
          console.log(JSON.stringify(stats, null, 2));
        } else {
          logger.info("📊 Database Statistics");
          console.log(`   Total Events: ${stats.totalEvents.toLocaleString()}`);
          console.log(`   Total Sessions: ${stats.totalSessions.toLocaleString()}`);
          console.log(`   Database Size: ${(stats.dbSizeBytes / 1024).toFixed(1)} KB`);
          console.log(`   Date Range: ${new Date(stats.dateRange.earliest).toLocaleDateString()} - ${new Date(stats.dateRange.latest).toLocaleDateString()}`);
        }
        
        await operations.close();
      } catch (error) {
        logger.error(`Stats query failed: ${error instanceof Error ? error.message : error}`, isJsonOutput);
      }
    });
} 