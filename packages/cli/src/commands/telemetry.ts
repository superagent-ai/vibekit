import { Command } from "commander";
import { join } from "path";
import { existsSync, writeFileSync } from "fs";
import { TelemetryService, TelemetryConfig } from '@vibe-kit/telemetry';

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
    serviceName: 'vibekit-cli',
    serviceVersion: '1.0.0',
    storage: [{
      type: 'sqlite',
      enabled: true,
      options: {
        path: dbPath || '.vibekit/telemetry.db',
        streamBatchSize: 50,
        streamFlushInterval: 1000,
      }
    }],
    analytics: {
      enabled: true
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

    // Query events and group by session
    const events = await service.query(filterOptions);
    
    // Group events by session to create summaries
    const sessionMap = new Map<string, SessionSummary>();
    
    events.forEach(event => {
      if (!sessionMap.has(event.sessionId)) {
        sessionMap.set(event.sessionId, {
          sessionId: event.sessionId,
          agentType: event.category,
          eventCount: 0,
          firstEvent: new Date(event.timestamp).toISOString(),
          lastEvent: new Date(event.timestamp).toISOString(),
          duration: 0,
          errorCount: 0,
          streamCount: 0
        });
      }
      
      const session = sessionMap.get(event.sessionId)!;
      session.eventCount++;
      if (event.eventType === 'error') session.errorCount++;
      if (event.eventType === 'stream') session.streamCount++;
      
      const eventTime = new Date(event.timestamp).toISOString();
      if (eventTime < session.firstEvent) session.firstEvent = eventTime;
      if (eventTime > session.lastEvent) session.lastEvent = eventTime;
    });
    
    // Calculate durations
    sessionMap.forEach(session => {
      session.duration = new Date(session.lastEvent).getTime() - new Date(session.firstEvent).getTime();
    });
    
    const sessions = Array.from(sessionMap.values());

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
    
    // Get metrics and insights for stats
    const metrics = await service.getMetrics();
    const insights = await service.getInsights();
    const healthStatus = service.getHealthStatus();

    const stats = {
      database: {
        path: dbPath,
        status: 'connected'
      },
      metrics: metrics,
      insights: insights,
      health: healthStatus
    };

    if (options.format === 'json') {
      TelemetryCliLogger.json(stats);
    } else {
      console.log('\n📊 Telemetry Database Statistics\n');
      console.log(`Database: ${stats.database.path}`);
      console.log(`Status: ${stats.database.status}`);
      console.log(`Health: ${stats.health.status}`);
      console.log('\n📈 Metrics:');
      console.log(`Total Events: ${stats.metrics?.events?.total || 0}`);
      console.log(`Error Rate: ${stats.metrics?.performance?.errorRate || 0}%`);
      console.log(`\n📊 Insights:`);
      if (stats.insights?.metrics) {
        console.log(`Active Sessions: ${stats.insights.metrics.sessions?.active || 0}`);
        console.log(`Completed Sessions: ${stats.insights.metrics.sessions?.completed || 0}`);
      }
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
    
    // Get metrics and insights for analytics dashboard
    const metrics = await service.getMetrics();
    const insights = await service.getInsights();
    const recentEvents = await service.query({ limit: 100 });
    
    // Create dashboard data structure
    const dashboard = {
      metrics: metrics,
      insights: insights,
      recentSessions: new Map<string, any>(),
      performance: [],
      anomalies: []
    };
    
    // Group recent events by session
    recentEvents.forEach(event => {
      if (!dashboard.recentSessions.has(event.sessionId)) {
        dashboard.recentSessions.set(event.sessionId, {
          sessionId: event.sessionId,
          agentType: event.category,
          eventCount: 0,
          firstEvent: event.timestamp,
          lastEvent: event.timestamp,
          errorCount: 0
        });
      }
      const session = dashboard.recentSessions.get(event.sessionId)!;
      session.eventCount++;
      if (event.eventType === 'error') session.errorCount++;
      if (event.timestamp > session.lastEvent) session.lastEvent = event.timestamp;
      if (event.timestamp < session.firstEvent) session.firstEvent = event.timestamp;
    });
    
    const sessionSummaries = Array.from(dashboard.recentSessions.values())
      .map(s => ({
        ...s,
        duration: s.lastEvent - s.firstEvent,
        firstEvent: new Date(s.firstEvent).toISOString(),
        lastEvent: new Date(s.lastEvent).toISOString()
      }))
      .slice(0, 10);

    if (options.format === 'json') {
      if (options.output) {
        writeFileSync(options.output, JSON.stringify(dashboard, null, 2));
        TelemetryCliLogger.success(`Analytics exported to ${options.output}`);
      } else {
        TelemetryCliLogger.json(dashboard);
      }
    } else {
      console.log('\n📊 Analytics Dashboard (Last 24 Hours)\n');
      
      console.log('🔍 Metrics:');
      console.log(`Total Events: ${dashboard.metrics?.events?.total || 0}`);
      console.log(`Error Rate: ${dashboard.metrics?.performance?.errorRate || 0}%`);
      console.log(`Average Duration: ${dashboard.metrics?.performance?.avgDuration || 0}ms`);
      
      console.log('\n📈 Insights:');
      if (dashboard.insights?.metrics) {
        console.log(`Active Sessions: ${dashboard.insights.metrics.sessions?.active || 0}`);
        console.log(`Completed Sessions: ${dashboard.insights.metrics.sessions?.completed || 0}`);
        if (dashboard.metrics?.events?.byType) {
          console.log('\nEvent Type Distribution:');
          console.table(dashboard.metrics.events.byType);
        }
      }
      
      console.log('\n📋 Recent Sessions:');
      if (sessionSummaries.length > 0) {
        console.table(sessionSummaries);
      } else {
        console.log('No recent sessions');
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
    
    // Export functionality is always available through TelemetryService

    const filter: any = {};
    if (options.sessionId) filter.sessionId = options.sessionId;
    if (options.agentType) filter.agentType = options.agentType;
    if (options.since) filter.fromTime = new Date(options.since).getTime();
    if (options.until) filter.toTime = new Date(options.until).getTime();

    const format = (options.format || 'json') as 'json' | 'csv' | 'otlp';
    const outputPath = options.output || `./telemetry-export-${Date.now()}.${format}`;

    TelemetryCliLogger.info(`Exporting telemetry data as ${format}...`);
    
    // Export using the TelemetryService export method
    const exportData = await service.export({ format }, filter);
    
    // Write to file
    writeFileSync(outputPath, exportData);
    
    TelemetryCliLogger.success(`Export completed: ${outputPath}`);
    TelemetryCliLogger.info(`File size: ${Buffer.byteLength(exportData)} bytes`);

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

async function serveCommand(options: TelemetryCliOptions): Promise<void> {
  try {
    const port = process.env.PORT || '3000';
    const host = process.env.HOST || 'localhost';
    
    TelemetryCliLogger.info(`Starting telemetry HTTP server...`);
    TelemetryCliLogger.info(`Server will be available at http://${host}:${port}`);
    
    // Import and start the telemetry server script
    const { spawn } = await import('child_process');
    const path = await import('path');
    
    const serverScript = path.join(process.cwd(), 'scripts', 'telemetry-server.js');
    
    const server = spawn('node', [serverScript], {
      stdio: 'inherit',
      env: {
        ...process.env,
        PORT: port,
        HOST: host
      }
    });

    server.on('error', (error) => {
      TelemetryCliLogger.error(`Failed to start server: ${error.message}`);
    });

    server.on('exit', (code) => {
      if (code === 0) {
        TelemetryCliLogger.success('Server shut down successfully');
      } else {
        TelemetryCliLogger.error(`Server exited with code ${code}`);
      }
    });

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      TelemetryCliLogger.info('Shutting down server...');
      server.kill('SIGINT');
    });

    process.on('SIGTERM', () => {
      TelemetryCliLogger.info('Shutting down server...');
      server.kill('SIGTERM');
    });

  } catch (error) {
    TelemetryCliLogger.error(`Server failed: ${error instanceof Error ? error.message : String(error)}`);
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

  // Serve command (NEW)
  telemetryCmd
    .command('serve')
    .description('Start HTTP server for telemetry endpoints')
    .option('-p, --port <port>', 'Server port', '3000')
    .option('-h, --host <host>', 'Server host', 'localhost')
    .action(serveCommand);

  // Cleanup command
  telemetryCmd
    .command('cleanup')
    .description('Clean up old telemetry data')
    .option('-d, --database <path>', 'Database file path')
    .option('--days <count>', 'Keep data for specified days', '30')
    .action(cleanupCommand);
} 