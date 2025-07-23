import { Command } from "commander";
import { join } from "path";
import { existsSync, writeFileSync } from "fs";
import { TelemetryService } from "../../services/telemetry";
import { TelemetryConfig } from "../../types";

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
  analytics?: boolean;
  export?: boolean;
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
      TelemetryCliLogger.info("No data to display");
      return;
    }
    console.table(data);
  }

  static json(data: any): void {
    console.log(JSON.stringify(data, null, 2));
  }

  static csv(data: any[], headers: string[]): void {
    console.log(headers.join(','));
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header];
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value;
      });
      console.log(values.join(','));
    });
  }
}

async function createTelemetryService(dbPath?: string): Promise<TelemetryService> {
  const config: TelemetryConfig = {
    isEnabled: true,
    localStore: {
      isEnabled: true,
      path: dbPath || '.vibekit/telemetry.db',
      streamBatchSize: 50,
      streamFlushIntervalMs: 1000,
    }
  };

  const service = new TelemetryService(config);
  await service.initialize();
  return service;
}

async function queryCommand(options: TelemetryCliOptions): Promise<void> {
  try {
    const dbPath = options.database || join(process.cwd(), '.vibekit/telemetry.db');
    
    if (!existsSync(dbPath)) {
      TelemetryCliLogger.error(`Database not found: ${dbPath}`);
      TelemetryCliLogger.info("Initialize telemetry first or specify correct database path with --database");
      return;
    }

    const service = await createTelemetryService(dbPath);
    const format = options.format || 'table';
    const limit = parseInt(options.limit || '50');

    // Build filter options
    const filterOptions: any = {
      limit,
      offset: 0,
    };

    if (options.sessionId) filterOptions.sessionId = options.sessionId;
    if (options.agentType) filterOptions.agentType = options.agentType;
    if (options.since) filterOptions.fromTime = new Date(options.since).getTime();
    if (options.until) filterOptions.toTime = new Date(options.until).getTime();

    // Get session summaries instead of raw events for better overview
    const sessions = await service.getSessionSummaries(filterOptions);

    if (sessions.length === 0) {
      TelemetryCliLogger.info("No telemetry sessions found");
      return;
    }

    TelemetryCliLogger.success(`Found ${sessions.length} session(s)`);

    switch (format) {
      case 'json':
        if (options.output) {
          writeFileSync(options.output, JSON.stringify(sessions, null, 2));
          TelemetryCliLogger.success(`Results exported to ${options.output}`);
        } else {
          TelemetryCliLogger.json(sessions);
        }
        break;
             case 'csv':
         const headers = ['sessionId', 'agentType', 'totalEvents', 'duration', 'status'];
         if (options.output) {
           const csvContent = [
             headers.join(','),
             ...sessions.map(session => headers.map(h => (session as any)[h] || '').join(','))
           ].join('\n');
          writeFileSync(options.output, csvContent);
          TelemetryCliLogger.success(`Results exported to ${options.output}`);
        } else {
          TelemetryCliLogger.csv(sessions, headers);
        }
        break;
      default:
        TelemetryCliLogger.table(sessions);
    }

    await service.shutdown();
  } catch (error) {
    TelemetryCliLogger.error(`Query failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function statsCommand(options: TelemetryCliOptions): Promise<void> {
  try {
    const dbPath = options.database || join(process.cwd(), '.vibekit/telemetry.db');
    
    if (!existsSync(dbPath)) {
      TelemetryCliLogger.error(`Database not found: ${dbPath}`);
      return;
    }

    const service = await createTelemetryService(dbPath);
    
    // Get real-time metrics for stats
    const metrics = await service.getRealTimeMetrics();
    const analytics = service.getAnalyticsInfo();
    const exportInfo = service.getExportInfo();

    const stats = {
      database: {
        path: dbPath,
        status: 'connected'
      },
      analytics: analytics,
      export: exportInfo,
      realTimeMetrics: metrics
    };

    if (options.format === 'json') {
      TelemetryCliLogger.json(stats);
    } else {
      console.log('\n📊 Telemetry Database Statistics\n');
      console.log(`Database: ${stats.database.path}`);
      console.log(`Status: ${stats.database.status}`);
      console.log(`Analytics: ${stats.analytics.status}`);
      console.log(`Export: ${stats.export.status}`);
      console.log('\n📈 Real-time Metrics:');
      console.table(stats.realTimeMetrics);
    }

    await service.shutdown();
  } catch (error) {
    TelemetryCliLogger.error(`Stats failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function analyticsCommand(options: TelemetryCliOptions): Promise<void> {
  try {
    const dbPath = options.database || join(process.cwd(), '.vibekit/telemetry.db');
    
    if (!existsSync(dbPath)) {
      TelemetryCliLogger.error(`Database not found: ${dbPath}`);
      return;
    }

    const service = await createTelemetryService(dbPath);
    
    // Get comprehensive analytics dashboard
    const dashboard = await service.getAnalyticsDashboard('day');

    if (options.format === 'json') {
      if (options.output) {
        writeFileSync(options.output, JSON.stringify(dashboard, null, 2));
        TelemetryCliLogger.success(`Analytics exported to ${options.output}`);
      } else {
        TelemetryCliLogger.json(dashboard);
      }
    } else {
      console.log('\n📊 Analytics Dashboard (Last 24 Hours)\n');
      
      console.log('🔍 Real-time Metrics:');
      console.table(dashboard.realTime);
      
      console.log('\n📈 Performance Metrics:');
      if (dashboard.performance.length > 0) {
        console.table(dashboard.performance);
      } else {
        console.log('No performance data available');
      }
      
      console.log('\n📋 Recent Sessions:');
      if (dashboard.sessionSummaries.length > 0) {
        console.table(dashboard.sessionSummaries.slice(0, 10));
      } else {
        console.log('No recent sessions');
      }

      if (dashboard.anomalies.length > 0) {
        console.log('\n⚠️  Detected Anomalies:');
        console.table(dashboard.anomalies);
      }
    }

    await service.shutdown();
  } catch (error) {
    TelemetryCliLogger.error(`Analytics failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function exportCommand(options: TelemetryCliOptions): Promise<void> {
  try {
    const dbPath = options.database || join(process.cwd(), '.vibekit/telemetry.db');
    
    if (!existsSync(dbPath)) {
      TelemetryCliLogger.error(`Database not found: ${dbPath}`);
      return;
    }

    const service = await createTelemetryService(dbPath);
    
    if (!service.getExportService()) {
      TelemetryCliLogger.error('Export service not available - local store must be enabled');
      return;
    }

    const filter: any = {};
    if (options.sessionId) filter.sessionId = options.sessionId;
    if (options.agentType) filter.agentType = options.agentType;
    if (options.since) filter.fromTime = new Date(options.since).getTime();
    if (options.until) filter.toTime = new Date(options.until).getTime();

         const exportConfig = {
       format: (options.format || 'json') as 'json' | 'csv' | 'otlp',
       outputPath: options.output || `./telemetry-export-${Date.now()}`,
       includeMetadata: true,
       compression: 'gzip' as const
     };

     TelemetryCliLogger.info(`Exporting telemetry data...`);
     const metadata = await service.exportData(filter, exportConfig);
     
     TelemetryCliLogger.success(`Export completed: ${metadata.config.outputPath}`);
     TelemetryCliLogger.info(`Records exported: ${metadata.stats.totalRecords}`);
     TelemetryCliLogger.info(`File size: ${metadata.stats.size} bytes`);

    await service.shutdown();
  } catch (error) {
    TelemetryCliLogger.error(`Export failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function cleanupCommand(options: TelemetryCliOptions): Promise<void> {
  try {
    const dbPath = options.database || join(process.cwd(), '.vibekit/telemetry.db');
    
    if (!existsSync(dbPath)) {
      TelemetryCliLogger.error(`Database not found: ${dbPath}`);
      return;
    }

    const service = await createTelemetryService(dbPath);
    
    // For now, just provide info about cleanup - actual implementation would need specific methods
    TelemetryCliLogger.info('Cleanup functionality - check database operations for pruning old data');
    TelemetryCliLogger.info(`Database path: ${dbPath}`);
    
    await service.shutdown();
  } catch (error) {
    TelemetryCliLogger.error(`Cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function registerTelemetryCommands(program: Command): void {
  const telemetryCmd = program
    .command('telemetry')
    .description('Telemetry data management and analytics');

  // Query command
  telemetryCmd
    .command('query')
    .description('Query telemetry data')
    .option('-d, --database <path>', 'Database file path')
    .option('-f, --format <format>', 'Output format (table, json, csv)', 'table')
    .option('-o, --output <file>', 'Output file path')
    .option('-l, --limit <count>', 'Limit results', '50')
    .option('-s, --session-id <id>', 'Filter by session ID')
    .option('-a, --agent-type <type>', 'Filter by agent type')
    .option('-e, --event-type <type>', 'Filter by event type')
    .option('--since <date>', 'Filter events since date')
    .option('--until <date>', 'Filter events until date')
    .action(queryCommand);

  // Stats command
  telemetryCmd
    .command('stats')
    .description('Show telemetry database statistics')
    .option('-d, --database <path>', 'Database file path')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .action(statsCommand);

  // Analytics command
  telemetryCmd
    .command('analytics')
    .description('Show telemetry analytics dashboard')
    .option('-d, --database <path>', 'Database file path')
    .option('-f, --format <format>', 'Output format (table, json)', 'table')
    .option('-o, --output <file>', 'Output file path')
    .action(analyticsCommand);

  // Export command
  telemetryCmd
    .command('export')
    .description('Export telemetry data')
    .option('-d, --database <path>', 'Database file path')
    .option('-f, --format <format>', 'Export format (json, csv, otlp)', 'json')
    .option('-o, --output <path>', 'Output file path')
    .option('-s, --session-id <id>', 'Filter by session ID')
    .option('-a, --agent-type <type>', 'Filter by agent type')
    .option('--since <date>', 'Filter events since date')
    .option('--until <date>', 'Filter events until date')
    .action(exportCommand);

  // Cleanup command
  telemetryCmd
    .command('cleanup')
    .description('Clean up old telemetry data')
    .option('-d, --database <path>', 'Database file path')
    .option('--days <count>', 'Keep data for specified days', '30')
    .action(cleanupCommand);
} 