import { config } from 'dotenv';
import { TelemetryService } from './core/TelemetryService.js';
import type { TelemetryConfig } from './core/types.js';
import { createLogger } from './utils/logger.js';

// Load environment variables
config();

/**
 * Create a production-ready telemetry service instance with environment-based configuration
 */
export function createTelemetryService(): TelemetryService {
  const config: Partial<TelemetryConfig> = {
    serviceName: process.env.SERVICE_NAME || 'telemetry-service',
    serviceVersion: process.env.SERVICE_VERSION || '0.0.1',
    environment: process.env.NODE_ENV || 'development',
    
    storage: [{
      type: (process.env.TELEMETRY_STORAGE_TYPE || 'sqlite') as any,
      enabled: true,
      options: {
        path: process.env.TELEMETRY_STORAGE_PATH || './data/telemetry.db',
      },
    }],
    
    streaming: {
      enabled: process.env.TELEMETRY_STREAMING_ENABLED === 'true',
      type: (process.env.TELEMETRY_STREAMING_TYPE || 'websocket') as any,
      port: parseInt(process.env.TELEMETRY_STREAMING_PORT || '3001', 10),
    },
    
    security: {
      enabled: process.env.TELEMETRY_SECURITY_ENABLED !== 'false',
      pii: {
        enabled: process.env.TELEMETRY_PII_DETECTION_ENABLED !== 'false',
      },
      encryption: {
        enabled: process.env.TELEMETRY_ENCRYPTION_ENABLED === 'true',
        key: process.env.TELEMETRY_ENCRYPTION_KEY,
      },
      retention: {
        enabled: true,
        maxAge: parseInt(process.env.TELEMETRY_RETENTION_DAYS || '30', 10),
      },
    },
    
    reliability: {
      enabled: true,
      circuitBreaker: {
        enabled: process.env.TELEMETRY_CIRCUIT_BREAKER_ENABLED !== 'false',
        threshold: parseInt(process.env.TELEMETRY_CIRCUIT_BREAKER_THRESHOLD || '5', 10),
        timeout: parseInt(process.env.TELEMETRY_CIRCUIT_BREAKER_TIMEOUT_MS || '60000', 10),
      },
      rateLimit: {
        enabled: process.env.TELEMETRY_RATE_LIMIT_ENABLED !== 'false',
        maxRequests: parseInt(process.env.TELEMETRY_RATE_LIMIT_MAX_REQUESTS || '1000', 10),
        windowMs: parseInt(process.env.TELEMETRY_RATE_LIMIT_WINDOW_MS || '60000', 10),
      },
      retry: {
        enabled: true,
        maxRetries: 3,
        backoff: 1000,
      },
    },
    
    analytics: {
      enabled: process.env.TELEMETRY_ANALYTICS_ENABLED !== 'false',
    },
    
    api: {
      enabled: process.env.TELEMETRY_API_ENABLED === 'true',
      port: parseInt(process.env.TELEMETRY_API_PORT || '3000', 10),
    },
  };
  
  return new TelemetryService(config);
}

/**
 * Initialize telemetry service with production-ready defaults
 */
export async function initializeTelemetry(): Promise<TelemetryService> {
  const logger = createLogger('TelemetryInit');
  const telemetry = createTelemetryService();
  
  // Set up graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down telemetry service...');
    try {
      await telemetry.shutdown();
      logger.info('Telemetry service shut down successfully');
      process.exit(0);
    } catch (error) {
      logger.error('Error shutting down telemetry service:', error);
      process.exit(1);
    }
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  // Initialize the service
  await telemetry.initialize();
  logger.info('Telemetry service initialized successfully');
  
  return telemetry;
}