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

      const dashboard = await service.getAnalyticsDashboard(options.window);

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
      console.log('🗄️  Local storage: ' + (service['config'].localStore?.isEnabled ? 'enabled' : 'disabled'));
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
    isEnabled: true,
    localStore: {
      isEnabled: true,
      path: '.vibekit/telemetry.db',
    },
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
    serviceName: 'vibekit-cli',
    serviceVersion: '1.0.0',
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
  
  if (dashboard.recentSessions && dashboard.recentSessions.length > 0) {
    console.log('\n📋 Recent Sessions:');
    dashboard.recentSessions.slice(0, 5).forEach((session: any, index: number) => {
      console.log(`   ${index + 1}. ${session.sessionId?.slice(0, 8)}... (${session.agentType || 'unknown'})`);
    });
  }
  
  if (dashboard.source === 'opentelemetry-only') {
    console.log('\n💡 Tip: Enable local storage in telemetry config for detailed analytics');
  }
} 