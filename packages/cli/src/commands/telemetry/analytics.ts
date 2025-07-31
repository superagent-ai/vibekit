/**
 * Analytics CLI Commands (Simplified for Consolidated TelemetryService)
 * 
 * Basic analytics commands that work with the unified telemetry service.
 * Advanced analytics features are available when local storage is enabled.
 */

import { Command } from 'commander';
import { TelemetryService, TelemetryConfig } from '@vibe-kit/telemetry';

// Create analytics command
export const analyticsCommand = new Command('analytics')
  .description('Telemetry analytics and insights commands');

// Analytics dashboard command
analyticsCommand
  .command('dashboard')
  .description('Show analytics dashboard')
  .option('-w, --window <window>', 'Time window: hour, day, week', 'day')
  .option('-f, --format <format>', 'Output format: table, json', 'table')
  .action(async (options) => {
    try {
      const service = createTelemetryService();
      await service.initialize();

      console.log(`📊 Analytics Dashboard (${options.window} view)\n`);

      // Get metrics and insights
      const metrics = await service.getMetrics();
      const insights = await service.getInsights();
      
      const dashboard = {
        source: 'telemetry-service',
        timeWindow: options.window,
        totalSessions: insights?.metrics?.sessions?.active || 0,
        totalEvents: insights?.metrics?.events?.total || 0,
        metrics: metrics,
        insights: insights,
        message: 'Analytics data from telemetry service',
        recentSessions: []
      };

      if (options.format === 'json') {
        console.log(JSON.stringify(dashboard, null, 2));
      } else {
        displayDashboard(dashboard);
      }

      await service.shutdown();

    } catch (error) {
      console.error('❌ Error generating analytics dashboard:', (error as Error).message);
      process.exit(1);
    }
  });

// Basic info command
analyticsCommand
  .command('info')
  .description('Show telemetry system information')
  .action(async () => {
    try {
      const service = createTelemetryService();
      await service.initialize();

      console.log('📋 Telemetry System Information\n');
      console.log('✅ Consolidated telemetry service active');
      console.log('📡 OpenTelemetry streaming: enabled');
      const storageEnabled = service['config'].storage?.some((s: any) => s.enabled && s.type === 'sqlite') || false;
      console.log('🗄️  Local storage: ' + (storageEnabled ? 'enabled' : 'disabled'));
      console.log('📊 Analytics: available when local storage is enabled');

      await service.shutdown();

    } catch (error) {
      console.error('❌ Error getting system info:', (error as Error).message);
      process.exit(1);
    }
  });

// ========================================
// HELPER FUNCTIONS
// ========================================

function createTelemetryService(): TelemetryService {
  const config: TelemetryConfig = {
    serviceName: 'vibekit-cli',
    serviceVersion: '1.0.0',
    storage: [{
      type: 'sqlite',
      enabled: true,
      options: {
        path: '.vibekit/telemetry.db',
      }
    }],
    analytics: {
      enabled: true
    }
  };

  return new TelemetryService(config);
}

function displayDashboard(dashboard: any): void {
  console.log('📈 Dashboard Data:');
  console.log(`   Source: ${dashboard.source}`);
  console.log(`   Time Window: ${dashboard.timeWindow}`);
  console.log(`   Total Sessions: ${dashboard.totalSessions}`);
  console.log(`   Total Events: ${dashboard.totalEvents}`);
  console.log(`   Message: ${dashboard.message}`);
  
  if (dashboard.metrics?.events?.byType) {
    console.log('\n📋 Event Type Distribution:');
    Object.entries(dashboard.metrics.events.byType).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
  }
  
  if (dashboard.metrics?.performance) {
    console.log('\n📊 Performance Metrics:');
    console.log(`   Error Rate: ${dashboard.metrics.performance.errorRate || 0}%`);
    console.log(`   Avg Duration: ${dashboard.metrics.performance.avgDuration || 0}ms`);
  }
  
  if (dashboard.source === 'opentelemetry-only') {
    console.log('\n💡 Tip: Enable local storage in telemetry config for detailed analytics');
  }
} 