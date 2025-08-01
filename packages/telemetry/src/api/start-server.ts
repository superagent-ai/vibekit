#!/usr/bin/env node
import { TelemetryService, TelemetryConfig } from '../index.js';
import { TelemetryAPIServer } from './TelemetryAPIServer.js';

async function start() {
  const config: TelemetryConfig = {
    serviceName: 'vibekit-dashboard',
    serviceVersion: '1.0.0',
    storage: [{
      type: 'sqlite',
      enabled: true,
      options: {
        path: process.env.TELEMETRY_DB_PATH || '.vibekit/telemetry.db',
        streamBatchSize: 50,
        streamFlushInterval: 1000,
      }
    }],
    analytics: {
      enabled: true
    }
  };
  
  console.log('Initializing telemetry service...');
  const telemetryService = new TelemetryService(config);
  await telemetryService.initialize();
  
  console.log('Starting API server...');
  // Set CORS environment variable for development
  process.env.TELEMETRY_ALLOWED_ORIGINS = '*';
  
  const server = new TelemetryAPIServer(telemetryService, {
    port: parseInt(process.env.PORT || '3000'),
    enableDatabaseWatcher: false // Disabled to prevent error feedback loops
  });
  
  await server.start();
  console.log(`Telemetry API Server started on port ${process.env.PORT || '3000'}`);
}

start().catch((error) => {
  console.error('Failed to start telemetry server:', error);
  process.exit(1);
});