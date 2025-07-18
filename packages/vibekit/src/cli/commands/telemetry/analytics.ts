/**
 * Phase 5.2: Analytics CLI Commands
 * 
 * Command-line interface for telemetry analytics features including:
 * - Session summaries and performance metrics
 * - Real-time dashboard metrics
 * - Percentile calculations
 * - Anomaly detection
 */

import { Command } from 'commander';
import { DrizzleTelemetryService } from '../../../db/drizzle-telemetry-service';
import { TelemetryConfig } from '../../../types';

// Create analytics command
export const analyticsCommand = new Command('analytics')
  .description('Telemetry analytics and insights commands');

// Analytics dashboard command
analyticsCommand
  .command('dashboard')
  .description('Show comprehensive analytics dashboard')
  .option('-w, --window <window>', 'Time window: hour, day, week, month', 'day')
  .option('-f, --format <format>', 'Output format: table, json', 'table')
  .action(async (options) => {
    try {
      const service = createTelemetryService();
      const analyticsInfo = service.getAnalyticsInfo();

      if (!analyticsInfo.enabled) {
        console.log('❌ Analytics not available:', analyticsInfo.status);
        process.exit(1);
      }

      console.log(`📊 Analytics Dashboard (${options.window} view)\n`);

      const dashboard = await service.getAnalyticsDashboard(options.window);

      if (options.format === 'json') {
        console.log(JSON.stringify(dashboard, null, 2));
        return;
      }

      // Display dashboard in table format
      displayDashboard(dashboard, options.window);

    } catch (error) {
      console.error('❌ Error generating analytics dashboard:', (error as Error).message);
      process.exit(1);
    }
  });

// Session summaries command
analyticsCommand
  .command('sessions')
  .description('Show session summaries with filtering options')
  .option('-l, --limit <limit>', 'Number of sessions to show', '20')
  .option('-a, --agent <agent>', 'Filter by agent type')
  .option('-s, --status <status>', 'Filter by status')
  .option('-f, --from <from>', 'From timestamp (ISO string or relative like "1h", "1d")')
  .option('-t, --to <to>', 'To timestamp (ISO string or relative)')
  .option('--format <format>', 'Output format: table, json, csv', 'table')
  .action(async (options) => {
    try {
      const service = createTelemetryService();
      
      if (!service.getAnalyticsInfo().enabled) {
        console.log('❌ Analytics not available - local store must be enabled');
        process.exit(1);
      }

      const filters: any = {
        limit: parseInt(options.limit),
      };

      if (options.agent) filters.agentType = options.agent;
      if (options.status) filters.status = options.status;
      if (options.from) filters.fromTime = parseTimeInput(options.from);
      if (options.to) filters.toTime = parseTimeInput(options.to);

      const sessions = await service.getSessionSummaries(filters);

      if (options.format === 'json') {
        console.log(JSON.stringify(sessions, null, 2));
      } else if (options.format === 'csv') {
        displaySessionsCSV(sessions);
      } else {
        displaySessionsTable(sessions);
      }

    } catch (error) {
      console.error('❌ Error retrieving session summaries:', (error as Error).message);
      process.exit(1);
    }
  });

// Performance metrics command
analyticsCommand
  .command('performance')
  .description('Show performance metrics and statistics')
  .option('-w, --window <window>', 'Time window: hour, day, week, month', 'day')
  .option('-f, --from <from>', 'From timestamp (ISO string or relative)')
  .option('-t, --to <to>', 'To timestamp (ISO string or relative)')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action(async (options) => {
    try {
      const service = createTelemetryService();
      
      if (!service.getAnalyticsInfo().enabled) {
        console.log('❌ Analytics not available - local store must be enabled');
        process.exit(1);
      }

      const fromTime = options.from ? parseTimeInput(options.from) : undefined;
      const toTime = options.to ? parseTimeInput(options.to) : undefined;

      const metrics = await service.getPerformanceMetrics(options.window, fromTime, toTime);

      if (options.format === 'json') {
        console.log(JSON.stringify(metrics, null, 2));
      } else {
        displayPerformanceMetrics(metrics, options.window);
      }

    } catch (error) {
      console.error('❌ Error retrieving performance metrics:', (error as Error).message);
      process.exit(1);
    }
  });

// Real-time metrics command
analyticsCommand
  .command('realtime')
  .description('Show real-time metrics and live dashboard')
  .option('-w, --watch', 'Watch mode - refresh every 30 seconds')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action(async (options) => {
    try {
      const service = createTelemetryService();
      
      if (!service.getAnalyticsInfo().enabled) {
        console.log('❌ Analytics not available - local store must be enabled');
        process.exit(1);
      }

      const showMetrics = async () => {
        const metrics = await service.getRealTimeMetrics();
        
        if (options.format === 'json') {
          console.log(JSON.stringify(metrics, null, 2));
        } else {
          displayRealTimeMetrics(metrics);
        }
      };

      await showMetrics();

      if (options.watch) {
        console.log('\n🔄 Watch mode - Press Ctrl+C to exit\n');
        const interval = setInterval(async () => {
          console.clear();
          console.log('📊 Real-time Telemetry Dashboard\n');
          await showMetrics();
        }, 30000);

        process.on('SIGINT', () => {
          clearInterval(interval);
          process.exit(0);
        });
      }

    } catch (error) {
      console.error('❌ Error retrieving real-time metrics:', (error as Error).message);
      process.exit(1);
    }
  });

// Percentiles command
analyticsCommand
  .command('percentiles')
  .description('Calculate percentile statistics for various metrics')
  .option('-m, --metric <metric>', 'Metric: session_duration, events_per_session, response_time', 'session_duration')
  .option('-f, --from <from>', 'From timestamp (ISO string or relative like "1h", "1d")', '1d')
  .option('-t, --to <to>', 'To timestamp (ISO string or relative)', 'now')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action(async (options) => {
    try {
      const service = createTelemetryService();
      
      if (!service.getAnalyticsInfo().enabled) {
        console.log('❌ Analytics not available - local store must be enabled');
        process.exit(1);
      }

      const fromTime = parseTimeInput(options.from);
      const toTime = parseTimeInput(options.to);

      if (options.metric === 'all') {
        const allPercentiles = await service.getAllPercentiles(fromTime, toTime);
        
        if (options.format === 'json') {
          console.log(JSON.stringify(allPercentiles, null, 2));
        } else {
          displayAllPercentiles(allPercentiles);
        }
      } else {
        const percentiles = await service.calculatePercentiles(
          options.metric as any, 
          fromTime, 
          toTime
        );

        if (options.format === 'json') {
          console.log(JSON.stringify(percentiles, null, 2));
        } else {
          displayPercentiles(percentiles, options.metric);
        }
      }

    } catch (error) {
      console.error('❌ Error calculating percentiles:', (error as Error).message);
      process.exit(1);
    }
  });

// Anomaly detection command
analyticsCommand
  .command('anomalies')
  .description('Detect anomalies in telemetry data')
  .option('-f, --from <from>', 'From timestamp (ISO string or relative like "1h", "1d")', '24h')
  .option('-t, --to <to>', 'To timestamp (ISO string or relative)', 'now')
  .option('-s, --severity <severity>', 'Minimum severity: low, medium, high, critical', 'medium')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action(async (options) => {
    try {
      const service = createTelemetryService();
      
      if (!service.getAnalyticsInfo().enabled) {
        console.log('❌ Analytics not available - local store must be enabled');
        process.exit(1);
      }

      const fromTime = parseTimeInput(options.from);
      const toTime = parseTimeInput(options.to);

      const anomalies = await service.detectAnomalies(fromTime, toTime);
      
      // Filter by severity
      const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
      const minSeverity = severityOrder[options.severity as keyof typeof severityOrder];
      const filteredAnomalies = anomalies.filter(
        a => severityOrder[a.severity] >= minSeverity
      );

      if (options.format === 'json') {
        console.log(JSON.stringify(filteredAnomalies, null, 2));
      } else {
        displayAnomalies(filteredAnomalies);
      }

    } catch (error) {
      console.error('❌ Error detecting anomalies:', (error as Error).message);
      process.exit(1);
    }
  });

// Aggregations command
analyticsCommand
  .command('aggregations')
  .description('Show hourly and daily aggregations')
  .option('-t, --type <type>', 'Aggregation type: hourly, daily', 'daily')
  .option('-f, --from <from>', 'From timestamp (ISO string or relative)', '7d')
  .option('-t, --to <to>', 'To timestamp (ISO string or relative)', 'now')
  .option('--format <format>', 'Output format: table, json', 'table')
  .action(async (options) => {
    try {
      const service = createTelemetryService();
      
      if (!service.getAnalyticsInfo().enabled) {
        console.log('❌ Analytics not available - local store must be enabled');
        process.exit(1);
      }

      const fromTime = parseTimeInput(options.from);
      const toTime = parseTimeInput(options.to);

      if (options.type === 'hourly') {
        const aggregations = await service.getHourlyAggregations(fromTime, toTime);
        
        if (options.format === 'json') {
          console.log(JSON.stringify(aggregations, null, 2));
        } else {
          displayHourlyAggregations(aggregations);
        }
      } else {
        const aggregations = await service.getDailyAggregations(fromTime, toTime);
        
        if (options.format === 'json') {
          console.log(JSON.stringify(aggregations, null, 2));
        } else {
          displayDailyAggregations(aggregations);
        }
      }

    } catch (error) {
      console.error('❌ Error retrieving aggregations:', (error as Error).message);
      process.exit(1);
    }
  });

// ========================================
// HELPER FUNCTIONS
// ========================================

function createTelemetryService(): DrizzleTelemetryService {
  const config: TelemetryConfig = {
    isEnabled: true,
    localStore: {
      isEnabled: true,
      path: '.vibekit/telemetry.db',
    },
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    serviceName: 'vibekit-cli',
    serviceVersion: '1.0.0',
  };

  return new DrizzleTelemetryService(config);
}

function parseTimeInput(input: string): number {
  if (input === 'now') {
    return Date.now();
  }

  // Try parsing as ISO string
  const isoDate = new Date(input);
  if (!isNaN(isoDate.getTime())) {
    return isoDate.getTime();
  }

  // Parse relative time (e.g., "1h", "2d", "30m")
  const match = input.match(/^(\d+)([hmsdw])$/);
  if (match) {
    const value = parseInt(match[1]);
    const unit = match[2];
    const now = Date.now();

    switch (unit) {
      case 'm': return now - (value * 60 * 1000);
      case 'h': return now - (value * 60 * 60 * 1000);
      case 'd': return now - (value * 24 * 60 * 60 * 1000);
      case 'w': return now - (value * 7 * 24 * 60 * 60 * 1000);
      case 's': return now - (value * 1000);
      default: throw new Error(`Unknown time unit: ${unit}`);
    }
  }

  throw new Error(`Invalid time format: ${input}`);
}

function displayDashboard(dashboard: any, timeWindow: string): void {
  console.log('🔥 Real-time Metrics:');
  console.log(`   Active Sessions: ${dashboard.realTime.activeSessions}`);
  console.log(`   Events/minute: ${dashboard.realTime.eventsLastMinute}`);
  console.log(`   Avg Response Time: ${dashboard.realTime.avgResponseTime.toFixed(2)}ms`);
  console.log(`   Error Rate: ${(dashboard.realTime.errorRateLastMinute * 100).toFixed(2)}%`);

  if (dashboard.performance.length > 0) {
    const perf = dashboard.performance[0];
    console.log(`\n📈 Performance (${timeWindow}):`);
    console.log(`   Total Sessions: ${perf.totalSessions}`);
    console.log(`   Total Events: ${perf.totalEvents}`);
    console.log(`   Avg Session Duration: ${perf.avgSessionDuration.toFixed(2)}ms`);
    console.log(`   P95 Session Duration: ${perf.p95SessionDuration.toFixed(2)}ms`);
    console.log(`   Error Rate: ${(perf.errorRate * 100).toFixed(2)}%`);
  }

  if (dashboard.anomalies.length > 0) {
    console.log(`\n⚠️  Anomalies Detected:`);
    dashboard.anomalies.slice(0, 3).forEach((anomaly: any) => {
      console.log(`   ${getSeverityIcon(anomaly.severity)} ${anomaly.type}: ${anomaly.description}`);
    });
  }

  console.log(`\n📋 Recent Sessions: ${dashboard.sessionSummaries.length}`);
  dashboard.sessionSummaries.slice(0, 5).forEach((session: any) => {
    const duration = session.duration ? `${(session.duration / 1000).toFixed(1)}s` : 'ongoing';
    console.log(`   ${session.agentType} (${session.mode}): ${session.totalEvents} events, ${duration}`);
  });
}

function displaySessionsTable(sessions: any[]): void {
  if (sessions.length === 0) {
    console.log('📭 No sessions found');
    return;
  }

  console.log('📋 Session Summaries:\n');
  console.table(sessions.map(s => ({
    'Session ID': s.sessionId.substring(0, 12) + '...',
    'Agent': s.agentType,
    'Mode': s.mode,
    'Status': s.status,
    'Events': s.totalEvents,
    'Duration': s.duration ? `${(s.duration / 1000).toFixed(1)}s` : 'ongoing',
    'Errors': s.errorEvents,
    'Started': new Date(s.startTime).toLocaleString(),
  })));
}

function displaySessionsCSV(sessions: any[]): void {
  console.log('sessionId,agentType,mode,status,totalEvents,duration,errorEvents,startTime');
  sessions.forEach(s => {
    console.log(`${s.sessionId},${s.agentType},${s.mode},${s.status},${s.totalEvents},${s.duration || 0},${s.errorEvents},${s.startTime}`);
  });
}

function displayPerformanceMetrics(metrics: any[], timeWindow: string): void {
  if (metrics.length === 0) {
    console.log('📊 No performance data available');
    return;
  }

  console.log(`📈 Performance Metrics (${timeWindow}):\n`);
  
  metrics.forEach(metric => {
    console.log(`Time Window: ${new Date(metric.timeWindow).toLocaleString()}`);
    console.log(`📊 Sessions: ${metric.totalSessions}`);
    console.log(`📈 Events: ${metric.totalEvents}`);
    console.log(`⏱️  Avg Duration: ${metric.avgSessionDuration.toFixed(2)}ms`);
    console.log(`📉 P50 Duration: ${metric.p50SessionDuration.toFixed(2)}ms`);
    console.log(`📊 P95 Duration: ${metric.p95SessionDuration.toFixed(2)}ms`);
    console.log(`🔸 P99 Duration: ${metric.p99SessionDuration.toFixed(2)}ms`);
    console.log(`❌ Error Rate: ${(metric.errorRate * 100).toFixed(2)}%`);
    
    console.log('\n🤖 Agent Breakdown:');
    Object.entries(metric.agentTypeBreakdown).forEach(([agent, count]) => {
      console.log(`   ${agent}: ${count}`);
    });
    
    console.log('\n🔧 Mode Breakdown:');
    Object.entries(metric.modeBreakdown).forEach(([mode, count]) => {
      console.log(`   ${mode}: ${count}`);
    });
    console.log('');
  });
}

function displayRealTimeMetrics(metrics: any): void {
  console.log('🔥 Real-time Telemetry Metrics:\n');
  console.log(`📊 Active Sessions: ${metrics.activeSessions}`);
  console.log(`⚡ Events (last minute): ${metrics.eventsLastMinute}`);
  console.log(`⏱️  Avg Response Time: ${metrics.avgResponseTime.toFixed(2)}ms`);
  console.log(`❌ Error Rate (last minute): ${(metrics.errorRateLastMinute * 100).toFixed(2)}%`);
  
  if (Object.keys(metrics.activeAgents).length > 0) {
    console.log('\n🤖 Active Agents:');
    Object.entries(metrics.activeAgents).forEach(([agent, count]) => {
      console.log(`   ${agent}: ${count} session(s)`);
    });
  }
  
  if (metrics.topErrors.length > 0) {
    console.log('\n⚠️  Top Errors:');
    metrics.topErrors.forEach((error: any) => {
      console.log(`   ${error.type}: ${error.count}`);
    });
  }
  
  console.log(`\n🕐 Last Updated: ${new Date(metrics.lastUpdated).toLocaleString()}`);
}

function displayPercentiles(percentiles: any, metric: string): void {
  if (!percentiles) {
    console.log(`📊 No percentile data available for ${metric}`);
    return;
  }

  console.log(`📊 Percentile Analysis - ${metric}:\n`);
  console.log(`📈 Count: ${percentiles.count}`);
  console.log(`📉 Min: ${percentiles.min.toFixed(2)}`);
  console.log(`🔸 P50 (Median): ${percentiles.p50.toFixed(2)}`);
  console.log(`🔹 P75: ${percentiles.p75.toFixed(2)}`);
  console.log(`🔸 P90: ${percentiles.p90.toFixed(2)}`);
  console.log(`🔹 P95: ${percentiles.p95.toFixed(2)}`);
  console.log(`🔴 P99: ${percentiles.p99.toFixed(2)}`);
  console.log(`📊 Max: ${percentiles.max.toFixed(2)}`);
  console.log(`🕐 Time Window: ${new Date(percentiles.timeWindow).toLocaleString()}`);
}

function displayAllPercentiles(allPercentiles: any): void {
  console.log('📊 All Percentile Metrics:\n');
  
  Object.entries(allPercentiles).forEach(([metric, data]: [string, any]) => {
    if (data) {
      console.log(`📈 ${metric.replace('_', ' ').toUpperCase()}:`);
      console.log(`   P50: ${data.p50.toFixed(2)} | P95: ${data.p95.toFixed(2)} | P99: ${data.p99.toFixed(2)}`);
      console.log(`   Range: ${data.min.toFixed(2)} - ${data.max.toFixed(2)} (${data.count} samples)`);
    } else {
      console.log(`📈 ${metric.replace('_', ' ').toUpperCase()}: No data available`);
    }
    console.log('');
  });
}

function displayAnomalies(anomalies: any[]): void {
  if (anomalies.length === 0) {
    console.log('✅ No anomalies detected');
    return;
  }

  console.log(`⚠️  Anomaly Detection Results (${anomalies.length} found):\n`);
  
  anomalies.forEach((anomaly) => {
    console.log(`${getSeverityIcon(anomaly.severity)} ${anomaly.type.toUpperCase()}`);
    console.log(`   Severity: ${anomaly.severity}`);
    console.log(`   Description: ${anomaly.description}`);
    console.log(`   Value: ${anomaly.value.toFixed(2)} (expected: ${anomaly.expectedValue.toFixed(2)})`);
    console.log(`   Deviation: ${anomaly.deviationScore.toFixed(2)}x`);
    console.log(`   Time: ${new Date(anomaly.detectedAt).toLocaleString()}`);
    console.log('');
  });
}

function displayHourlyAggregations(aggregations: any[]): void {
  if (aggregations.length === 0) {
    console.log('📊 No hourly data available');
    return;
  }

  console.log('⏰ Hourly Aggregations:\n');
  console.table(aggregations.map(agg => ({
    'Hour': new Date(agg.hour).toLocaleString(),
    'Sessions': agg.totalSessions,
    'Events': agg.totalEvents,
    'Agents': agg.uniqueAgents,
    'Avg Duration': `${agg.avgSessionDuration.toFixed(1)}ms`,
    'Errors': agg.errorCount,
    'Error Rate': `${(agg.errorRate * 100).toFixed(1)}%`,
    'Top Agent': agg.topAgentType,
  })));
}

function displayDailyAggregations(aggregations: any[]): void {
  if (aggregations.length === 0) {
    console.log('📊 No daily data available');
    return;
  }

  console.log('�� Daily Aggregations:\n');
  console.table(aggregations.map(agg => ({
    'Date': agg.date,
    'Sessions': agg.totalSessions,
    'Events': agg.totalEvents,
    'Agents': agg.uniqueAgents,
    'Avg Duration': `${agg.avgSessionDuration.toFixed(1)}ms`,
    'Errors': agg.errorCount,
    'Error Rate': `${(agg.errorRate * 100).toFixed(1)}%`,
    'Peak Hour': `${agg.peakHour}:00`,
  })));
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚪';
  }
} 