import { Command } from "commander";
import { join } from "path";
import { existsSync, writeFileSync } from "fs";
import { TelemetryDB } from "../../services/telemetry-db";
import { TelemetryQueryFilter, TelemetryRecord } from "../../types/telemetry-storage";

interface TelemetryCliOptions {
  database?: string;
  format?: 'table' | 'json' | 'csv';
  output?: string;
  limit?: string;
  sessionId?: string;
  agentType?: string;
  eventType?: string;
  since?: string;
  until?: string;
  stats?: boolean;
  performance?: boolean;
}

interface SessionSummary {
  sessionId: string;
  agentType: string;
  eventCount: number;
  firstEvent: string;
  lastEvent: string;
  duration?: number;
  errorCount: number;
  streamCount: number;
}

class TelemetryCliLogger {
  static info(message: string): void {
    console.log(`ℹ️  ${message}`);
  }

  static success(message: string): void {
    console.log(`✅ ${message}`);
  }

  static error(message: string): void {
    console.error(`❌ ${message}`);
  }

  static warn(message: string): void {
    console.warn(`⚠️  ${message}`);
  }

  static table(data: any[]): void {
    if (data.length === 0) {
      console.log("No data to display");
      return;
    }
    console.table(data);
  }

  static json(data: any): void {
    console.log(JSON.stringify(data, null, 2));
  }
}

class TelemetryAnalyzer {
  constructor(private db: TelemetryDB) {}

  async getSessionSummaries(filter?: Partial<TelemetryQueryFilter>): Promise<SessionSummary[]> {
    const records = await this.db.getEvents(filter);
    const sessionMap = new Map<string, SessionSummary>();

    for (const record of records) {
      const key = `${record.sessionId}-${record.agentType}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, {
          sessionId: record.sessionId,
          agentType: record.agentType,
          eventCount: 0,
          firstEvent: new Date(record.timestamp).toISOString(),
          lastEvent: new Date(record.timestamp).toISOString(),
          errorCount: 0,
          streamCount: 0
        });
      }

      const session = sessionMap.get(key)!;
      session.eventCount++;
      const currentTimestamp = new Date(record.timestamp).toISOString();
      session.lastEvent = currentTimestamp;
      
      if (currentTimestamp < session.firstEvent) {
        session.firstEvent = currentTimestamp;
      }

      if (record.eventType === 'error') {
        session.errorCount++;
      } else if (record.eventType === 'stream') {
        session.streamCount++;
      }
    }

    // Calculate durations
    for (const session of sessionMap.values()) {
      const start = new Date(session.firstEvent).getTime();
      const end = new Date(session.lastEvent).getTime();
      session.duration = Math.round((end - start) / 1000); // seconds
    }

    return Array.from(sessionMap.values()).sort((a, b) => 
      new Date(b.lastEvent).getTime() - new Date(a.lastEvent).getTime()
    );
  }

  async getPerformanceStats(filter?: Partial<TelemetryQueryFilter>): Promise<any> {
    const records = await this.db.getEvents(filter);
    
    const agentStats = new Map<string, {
      totalEvents: number;
      sessionCount: Set<string>;
      errorRate: number;
      streamEvents: number;
    }>();

    for (const record of records) {
      if (!agentStats.has(record.agentType)) {
        agentStats.set(record.agentType, {
          totalEvents: 0,
          sessionCount: new Set(),
          errorRate: 0,
          streamEvents: 0
        });
      }

      const stats = agentStats.get(record.agentType)!;
      stats.totalEvents++;
      stats.sessionCount.add(record.sessionId);
      
      if (record.eventType === 'stream') {
        stats.streamEvents++;
      }
      
      if (record.eventType === 'error') {
        stats.errorRate++;
      }
    }

    // Calculate percentages
    const result: any = {};
    for (const [agentType, stats] of agentStats) {
      result[agentType] = {
        totalEvents: stats.totalEvents,
        uniqueSessions: stats.sessionCount.size,
        errorRate: (stats.errorRate / stats.totalEvents) * 100,
        streamEvents: stats.streamEvents
      };
    }

    return result;
  }
}

function formatRecordsAsCSV(records: TelemetryRecord[]): string {
  if (records.length === 0) return '';
  
  const headers = ['timestamp', 'sessionId', 'agentType', 'eventType', 'mode', 'prompt', 'streamData', 'metadata'];
  const rows = records.map(record => [
    new Date(record.timestamp).toISOString(),
    record.sessionId,
    record.agentType,
    record.eventType,
    record.mode,
    record.prompt,
    record.streamData || '',
    JSON.stringify(record.metadata || {})
  ]);

  return [headers, ...rows].map(row => 
    row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
  ).join('\n');
}

function parseTimestamp(timeStr: string): number {
  // Support relative times like "1h", "30m", "7d"
  const now = Date.now();
  const match = timeStr.match(/^(\d+)([hdmw])$/);
  
  if (match) {
    const amount = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
      case 'm': // minutes
        return now - amount * 60 * 1000;
      case 'h': // hours  
        return now - amount * 60 * 60 * 1000;
      case 'd': // days
        return now - amount * 24 * 60 * 60 * 1000;
      case 'w': // weeks
        return now - amount * 7 * 24 * 60 * 60 * 1000;
      default:
        return new Date(timeStr).getTime();
    }
  }
  
  return new Date(timeStr).getTime();
}

async function executeQuery(options: TelemetryCliOptions): Promise<void> {
  const dbPath = options.database || join(process.cwd(), '.vibekit', 'telemetry.db');
  
  if (!existsSync(dbPath)) {
    TelemetryCliLogger.error(`Telemetry database not found at: ${dbPath}`);
    TelemetryCliLogger.info("Run some VibeKit operations first to generate telemetry data");
    return;
  }

  try {
    const db = new TelemetryDB({ isEnabled: true, path: dbPath });
    const analyzer = new TelemetryAnalyzer(db);

    const filter: Partial<TelemetryQueryFilter> = {};
    
    if (options.sessionId) filter.sessionId = options.sessionId;
    if (options.agentType) filter.agentType = options.agentType;
    if (options.eventType) filter.eventType = options.eventType as "start" | "stream" | "end" | "error";
    if (options.since) filter.from = parseTimestamp(options.since);
    if (options.until) filter.to = parseTimestamp(options.until);
    if (options.limit) filter.limit = parseInt(options.limit);

    if (options.stats) {
      // Show session summaries
      const sessions = await analyzer.getSessionSummaries(filter);
      
      TelemetryCliLogger.info(`Found ${sessions.length} sessions`);
      
      if (options.format === 'json') {
        TelemetryCliLogger.json(sessions);
      } else if (options.format === 'csv') {
        const csv = formatRecordsAsCSV(sessions as any);
        if (options.output) {
          writeFileSync(options.output, csv);
          TelemetryCliLogger.success(`Session data exported to: ${options.output}`);
        } else {
          console.log(csv);
        }
      } else {
        TelemetryCliLogger.table(sessions.map(s => ({
          'Session ID': s.sessionId.substring(0, 8) + '...',
          'Agent': s.agentType,
          'Events': s.eventCount,
          'Duration (s)': s.duration || 0,
          'Errors': s.errorCount,
          'Streams': s.streamCount,
          'Last Activity': new Date(s.lastEvent).toLocaleString()
        })));
      }
    } else if (options.performance) {
      // Show performance statistics
      const perfStats = await analyzer.getPerformanceStats(filter);
      
      TelemetryCliLogger.info("Performance Statistics by Agent Type:");
      
      if (options.format === 'json') {
        TelemetryCliLogger.json(perfStats);
      } else {
        const tableData = Object.entries(perfStats).map(([agent, stats]: [string, any]) => ({
          'Agent Type': agent,
          'Total Events': stats.totalEvents,
          'Unique Sessions': stats.uniqueSessions,
          'Error Rate (%)': stats.errorRate.toFixed(2),
          'Stream Events': stats.streamEvents
        }));
        TelemetryCliLogger.table(tableData);
      }
    } else {
      // Show raw records
      const records = await db.getEvents(filter);
      
      TelemetryCliLogger.info(`Found ${records.length} telemetry records`);
      
      if (options.format === 'json') {
        if (options.output) {
          writeFileSync(options.output, JSON.stringify(records, null, 2));
          TelemetryCliLogger.success(`Data exported to: ${options.output}`);
        } else {
          TelemetryCliLogger.json(records);
        }
      } else if (options.format === 'csv') {
        const csv = formatRecordsAsCSV(records);
        if (options.output) {
          writeFileSync(options.output, csv);
          TelemetryCliLogger.success(`Data exported to: ${options.output}`);
        } else {
          console.log(csv);
        }
      } else {
        const tableData = records.slice(0, 20).map((r: TelemetryRecord) => ({
          'Timestamp': new Date(r.timestamp).toLocaleString(),
          'Session': r.sessionId.substring(0, 8) + '...',
          'Agent': r.agentType,
          'Event': r.eventType,
          'Mode': r.mode,
          'Prompt': r.prompt.substring(0, 50) + '...'
        }));
        
        TelemetryCliLogger.table(tableData);
        
        if (records.length > 20) {
          TelemetryCliLogger.info(`Showing first 20 of ${records.length} records. Use --format json or --limit for more.`);
        }
      }
    }

    await db.close();
  } catch (error) {
    TelemetryCliLogger.error(`Failed to query telemetry data: ${error instanceof Error ? error.message : error}`);
  }
}

async function clearData(options: TelemetryCliOptions): Promise<void> {
  const dbPath = options.database || join(process.cwd(), '.vibekit', 'telemetry.db');
  
  if (!existsSync(dbPath)) {
    TelemetryCliLogger.warn("No telemetry database found to clear");
    return;
  }

  try {
    const db = new TelemetryDB({ isEnabled: true, path: dbPath });
    
    // Get record count before clearing
    const beforeCount = await db.getEvents({ limit: 1000000 });
    
    await db.clear();
    await db.close();
    
    TelemetryCliLogger.success(`Cleared ${beforeCount.length} telemetry records`);
  } catch (error) {
    TelemetryCliLogger.error(`Failed to clear telemetry data: ${error instanceof Error ? error.message : error}`);
  }
}

export function registerTelemetryCommands(program: Command): void {
  const telemetryCmd = program
    .command("telemetry")
    .description("Query and analyze local telemetry data");

  // Query command
  telemetryCmd
    .command("query")
    .alias("q")
    .description("Query telemetry records")
    .option("-d, --database <path>", "Path to telemetry database")
    .option("-f, --format <format>", "Output format (table|json|csv)", "table")
    .option("-o, --output <file>", "Output file (for json/csv formats)")
    .option("-l, --limit <number>", "Limit number of records", "100")
    .option("-s, --session-id <id>", "Filter by session ID")
    .option("-a, --agent-type <type>", "Filter by agent type")
    .option("-e, --event-type <type>", "Filter by event type")
    .option("--since <time>", "Show records since time (ISO string or relative like '1h', '30m', '7d')")
    .option("--until <time>", "Show records until time (ISO string or relative)")
    .action((options: TelemetryCliOptions) => executeQuery(options));

  // Sessions command  
  telemetryCmd
    .command("sessions")
    .alias("s")
    .description("Show session summaries and statistics")
    .option("-d, --database <path>", "Path to telemetry database")
    .option("-f, --format <format>", "Output format (table|json|csv)", "table")
    .option("-o, --output <file>", "Output file (for json/csv formats)")
    .option("-l, --limit <number>", "Limit number of sessions")
    .option("-a, --agent-type <type>", "Filter by agent type")
    .option("--since <time>", "Show sessions since time")
    .option("--until <time>", "Show sessions until time")
    .action((options: TelemetryCliOptions) => executeQuery({ ...options, stats: true }));

  // Performance command
  telemetryCmd
    .command("performance")
    .alias("perf")
    .description("Show performance statistics and analytics")
    .option("-d, --database <path>", "Path to telemetry database") 
    .option("-f, --format <format>", "Output format (table|json)", "table")
    .option("-a, --agent-type <type>", "Filter by agent type")
    .option("--since <time>", "Analyze performance since time")
    .option("--until <time>", "Analyze performance until time")
    .action((options: TelemetryCliOptions) => executeQuery({ ...options, performance: true }));

  // Export command
  telemetryCmd
    .command("export")
    .alias("e")
    .description("Export telemetry data to file")
    .option("-d, --database <path>", "Path to telemetry database")
    .option("-f, --format <format>", "Export format (json|csv)", "json")
    .requiredOption("-o, --output <file>", "Output file path")
    .option("-s, --session-id <id>", "Filter by session ID")
    .option("-a, --agent-type <type>", "Filter by agent type") 
    .option("-e, --event-type <type>", "Filter by event type")
    .option("--since <time>", "Export records since time")
    .option("--until <time>", "Export records until time")
    .action((options: TelemetryCliOptions) => executeQuery(options));

  // Clear command
  telemetryCmd
    .command("clear")
    .description("Clear all telemetry data")
    .option("-d, --database <path>", "Path to telemetry database")
    .action((options: TelemetryCliOptions) => clearData(options));
} 