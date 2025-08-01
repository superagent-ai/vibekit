#!/usr/bin/env node

import { Command } from 'commander';
import { TelemetryService } from '../core/TelemetryService.js';
import { TelemetryAPIServer } from '../api/TelemetryAPIServer.js';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { createLogger } from '../utils/logger.js';

const program = new Command();
const logger = createLogger('TelemetryCLI');

program
  .name('telemetry')
  .description('VibeKit Telemetry CLI')
  .version('0.0.1');

program
  .command('init')
  .description('Initialize telemetry configuration')
  .option('-c, --config <path>', 'Configuration file path', './telemetry.config.js')
  .action(async (options) => {
    logger.info('Initializing telemetry configuration...');
    
    const configTemplate = `export default {
  serviceName: 'my-service',
  serviceVersion: '0.0.1',
  environment: 'development',
  
  storage: [
    {
      type: 'sqlite',
      enabled: true,
      options: {
        path: './.telemetry/data.db',
      }
    }
  ],
  
  streaming: {
    enabled: false,
    type: 'websocket',
    port: 3001,
  },
  
  security: {
    pii: {
      enabled: true,
    },
    encryption: {
      enabled: false,
    },
    retention: {
      enabled: true,
      maxAge: 30, // days
    },
  },
  
  analytics: {
    enabled: true,
  },
  
  dashboard: {
    enabled: true,
    port: 3000,
  },
};`;

    try {
      await mkdir(dirname(options.config), { recursive: true });
      await writeFile(options.config, configTemplate);
      logger.info(`Configuration file created at: ${options.config}`);
      logger.info('Edit the configuration file to customize your telemetry setup');
    } catch (error) {
      logger.error('Failed to create configuration file:', error);
      process.exit(1);
    }
  });

program
  .command('api')
  .description('Start telemetry API server')
  .option('-p, --port <port>', 'API server port', '3000')
  .option('-c, --config <path>', 'Configuration file path', './telemetry.config.js')
  .action(async (options) => {
    console.log(`🚀 Starting telemetry API server on port ${options.port}...`);
    
    try {
      // Load configuration
      let config;
      try {
        const configModule = await import(options.config);
        config = configModule.default;
      } catch (error) {
        console.log('⚠️  No configuration file found, using defaults');
        config = {
          serviceName: 'telemetry-dashboard',
          serviceVersion: '0.0.1',
          storage: [{ type: 'sqlite', enabled: true, options: { path: './.telemetry/data.db' } }],
          analytics: { enabled: true },
        };
      }
      
      // Initialize telemetry service
      const telemetry = new TelemetryService(config);
      await telemetry.initialize();
      
      // Start API server
      const apiServer = new TelemetryAPIServer(telemetry, { port: parseInt(options.port) });
      await apiServer.start();
      
      console.log(`✅ Telemetry API running at http://localhost:${options.port}`);
      console.log('Press Ctrl+C to stop');
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\\n🛑 Shutting down...');
        await apiServer.shutdown();
        await telemetry.shutdown();
        process.exit(0);
      });
      
    } catch (error) {
      console.error('❌ Failed to start dashboard:', error);
      process.exit(1);
    }
  });

program
  .command('query')
  .description('Query telemetry events')
  .option('-c, --category <category>', 'Filter by category')
  .option('-a, --action <action>', 'Filter by action')
  .option('-s, --session <sessionId>', 'Filter by session ID')
  .option('-t, --type <eventType>', 'Filter by event type')
  .option('-l, --limit <limit>', 'Limit results', '100')
  .option('--config <path>', 'Configuration file path', './telemetry.config.js')
  .option('--format <format>', 'Output format (json, table)', 'table')
  .action(async (options) => {
    console.log('🔍 Querying telemetry events...');
    
    try {
      // Load configuration
      let config;
      try {
        const configModule = await import(options.config);
        config = configModule.default;
      } catch (error) {
        config = {
          serviceName: 'telemetry-query',
          serviceVersion: '0.0.1',
          storage: [{ type: 'sqlite', enabled: true, options: { path: './.telemetry/data.db' } }],
        };
      }
      
      // Initialize telemetry service
      const telemetry = new TelemetryService(config);
      await telemetry.initialize();
      
      // Build filter
      const filter: any = {};
      if (options.category) filter.category = options.category;
      if (options.action) filter.action = options.action;
      if (options.session) filter.sessionId = options.session;
      if (options.type) filter.eventType = options.type;
      if (options.limit) filter.limit = parseInt(options.limit);
      
      // Query events
      const events = await telemetry.query(filter);
      
      if (options.format === 'json') {
        console.log(JSON.stringify(events, null, 2));
      } else {
        // Table format
        console.log(`\\n📊 Found ${events.length} events\\n`);
        
        if (events.length > 0) {
          console.table(events.map(event => ({
            Time: new Date(event.timestamp).toLocaleString(),
            Type: event.eventType,
            Category: event.category,
            Action: event.action,
            Session: event.sessionId.slice(0, 8) + '...',
            Duration: event.duration ? event.duration + 'ms' : '-',
          })));
        }
      }
      
      await telemetry.shutdown();
      
    } catch (error) {
      console.error('❌ Query failed:', error);
      process.exit(1);
    }
  });

program
  .command('export')
  .description('Export telemetry data')
  .option('-f, --format <format>', 'Export format (json, csv)', 'json')
  .option('-o, --output <file>', 'Output file')
  .option('-c, --category <category>', 'Filter by category')
  .option('-s, --session <sessionId>', 'Filter by session ID')
  .option('--config <path>', 'Configuration file path', './telemetry.config.js')
  .action(async (options) => {
    console.log(`📤 Exporting telemetry data in ${options.format} format...`);
    
    try {
      // Load configuration
      let config;
      try {
        const configModule = await import(options.config);
        config = configModule.default;
      } catch (error) {
        config = {
          serviceName: 'telemetry-export',
          serviceVersion: '0.0.1',
          storage: [{ type: 'sqlite', enabled: true, options: { path: './.telemetry/data.db' } }],
        };
      }
      
      // Initialize telemetry service
      const telemetry = new TelemetryService(config);
      await telemetry.initialize();
      
      // Build filter
      const filter: any = {};
      if (options.category) filter.category = options.category;
      if (options.session) filter.sessionId = options.session;
      
      // Export data
      const exportedData = await telemetry.export({ format: options.format }, filter);
      
      if (options.output) {
        await mkdir(dirname(options.output), { recursive: true });
        await writeFile(options.output, exportedData);
        console.log(`✅ Data exported to: ${options.output}`);
      } else {
        console.log(exportedData);
      }
      
      await telemetry.shutdown();
      
    } catch (error) {
      console.error('❌ Export failed:', error);
      process.exit(1);
    }
  });

program
  .command('health')
  .description('Check telemetry system health')
  .option('--config <path>', 'Configuration file path', './telemetry.config.js')
  .action(async (options) => {
    console.log('🏥 Checking telemetry system health...');
    
    try {
      // Load configuration
      let config;
      try {
        const configModule = await import(options.config);
        config = configModule.default;
      } catch (error) {
        config = {
          serviceName: 'telemetry-health',
          serviceVersion: '0.0.1',
          storage: [{ type: 'sqlite', enabled: true, options: { path: './.telemetry/data.db' } }],
        };
      }
      
      // Initialize telemetry service
      const telemetry = new TelemetryService(config);
      await telemetry.initialize();
      
      // Get health status
      const health = telemetry.getHealthStatus();
      
      console.log('\\n📊 Health Status\\n');
      
      const statusIcon = health.status === 'healthy' ? '✅' : 
                        health.status === 'degraded' ? '⚠️' : '❌';
      
      console.log(`${statusIcon} Overall Status: ${health.status.toUpperCase()}`);
      console.log(`📅 Timestamp: ${health.details.timestamp}`);
      console.log(`🚀 Initialized: ${health.details.initialized}`);
      
      console.log('\\n🗄️  Storage Providers:');
      health.details.providers.storage.forEach((provider: any) => {
        console.log(`  - ${provider.name}: ${provider.supportsQuery ? '✅' : '❌'} Query, ${provider.supportsBatch ? '✅' : '❌'} Batch`);
      });
      
      console.log(`\\n📡 Streaming: ${health.details.providers.streaming.enabled ? '✅ Enabled' : '❌ Disabled'}`);
      console.log(`📈 Analytics: ${health.details.providers.analytics.enabled ? '✅ Enabled' : '❌ Disabled'}`);
      
      await telemetry.shutdown();
      
    } catch (error) {
      console.error('❌ Health check failed:', error);
      process.exit(1);
    }
  });

program.parse();