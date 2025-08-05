import { TelemetryService, type TelemetryConfig } from '@vibe-kit/telemetry';
import type { TelemetryConfig as VibeKitTelemetryConfig } from '../types.js';

export class VibeKitTelemetryAdapter {
  private telemetry: TelemetryService;
  
  constructor(config: VibeKitTelemetryConfig & { serviceVersion: string }) {
    // Handle new type-based configuration
    if (config.type === 'local') {
      // Use local telemetry with SQLite
      const telemetryConfig: Partial<TelemetryConfig> = {
        serviceName: config.serviceName || 'vibekit-local',
        serviceVersion: config.serviceVersion,
        environment: 'development',
        
        storage: [{
          type: 'sqlite' as const,
          enabled: true,
          options: {
            path: config.database?.path || '.vibekit/telemetry.db',
            streamBatchSize: config.database?.batchSize || 100,
            streamFlushInterval: config.database?.flushInterval || 1000,
            streamBuffering: true,
            enableWAL: config.database?.enableWAL ?? true,
            pruneDays: config.database?.retentionDays || 0, // 0 = keep forever
          }
        }],
        
        api: {
          enabled: true,
          port: config.api?.port || 3000,
          dashboard: config.api?.dashboard ?? true,
          cors: config.api?.cors ?? true,
        } as any,
        
        analytics: {
          enabled: true,
          metrics: {
            enabled: true,
          },
        } as any,
        
        security: {
          pii: {
            enabled: false, // Disable PII detection for better compatibility
          },
          encryption: {
            enabled: false,
          },
        },
      };
      
      this.telemetry = new TelemetryService(telemetryConfig);
    } else if (config.type === 'remote') {
      // Use remote telemetry with OTLP
      const telemetryConfig: Partial<TelemetryConfig> = {
        serviceName: config.serviceName || 'vibekit',
        serviceVersion: config.serviceVersion,
        environment: 'production',
        
        storage: [{
          type: 'otlp' as const,
          enabled: true,
          options: {
            endpoint: config.endpoint!,
            headers: config.headers || {},
            batchSize: 100,
            timeout: config.timeout || 5000,
          }
        }],
        
        analytics: {
          enabled: true,
        },
      };
      
      // Add resource attributes if provided
      if (config.resourceAttributes) {
        (telemetryConfig as any).resourceAttributes = config.resourceAttributes;
      }
      
      this.telemetry = new TelemetryService(telemetryConfig);
    } else {
      // Legacy configuration support
      const telemetryConfig: Partial<TelemetryConfig> = {
        serviceName: 'vibekit',
        serviceVersion: config.serviceVersion,
        environment: 'development',
        
        storage: [
          // If SQLite is disabled, use memory provider for testing
          ...(config.localStore?.isEnabled === false ? [{
            type: 'memory' as const,
            enabled: true,
          }] : [{
            type: 'sqlite' as const,
            enabled: config.localStore?.isEnabled ?? true,
            options: {
              path: config.localStore?.path || '.vibekit/telemetry.db',
              streamBatchSize: config.localStore?.streamBatchSize || 100,
              streamFlushInterval: config.localStore?.streamFlushIntervalMs || 5000,
              streamBuffering: true,
            }
          }]),
          ...(config.endpoint ? [{
            type: 'otlp' as const,
            enabled: true,
            options: {
              endpoint: config.endpoint,
              headers: config.headers || {},
              batchSize: 100,
              timeout: 5000,
            }
          }] : [])
        ],
        
        streaming: {
          enabled: false, // Disable by default for compatibility
          type: 'websocket' as const,
          port: 3001,
        },
        
        security: {
          pii: {
            enabled: false, // Disable PII detection for better compatibility
          },
          encryption: {
            enabled: false,
          },
          retention: {
            enabled: true,
            maxAge: 30, // 30 days
          },
        },
        
        api: {
          enabled: false, // Enable via CLI commands
        },
        
        analytics: {
          enabled: true,
        },
      };
      
      this.telemetry = new TelemetryService(telemetryConfig);
    }
  }
  
  async initialize(): Promise<void> {
    await this.telemetry.initialize();
  }
  
  // Adapter methods that match existing VibeKit API
  async trackStart(
    agentType: string,
    mode: string,
    prompt: string,
    metadata?: any
  ): Promise<string> {
    return this.telemetry.trackStart(agentType, mode, prompt, metadata);
  }
  
  async trackStream(
    sessionId: string,
    agentType: string,
    mode: string,
    prompt: string,
    data: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.track({
      sessionId,
      eventType: 'stream',
      category: agentType,
      action: mode,
      label: prompt,
      metadata: {
        ...metadata,
        streamData: data,
        sandboxId,
        repoUrl,
      }
    });
  }
  
  async trackEnd(
    sessionId: string,
    agentType: string,
    mode: string,
    prompt: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.trackEnd(sessionId, 'completed', {
      ...metadata,
      agentType,
      mode,
      prompt,
      sandboxId,
      repoUrl,
    });
  }
  
  async trackError(
    sessionId: string,
    error: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.trackError(sessionId, error, metadata);
  }
  
  // Delegate other methods
  async shutdown(): Promise<void> {
    return this.telemetry.shutdown();
  }
  
  async getAnalyticsDashboard(timeWindow?: string): Promise<any> {
    let timeRange;
    
    if (timeWindow) {
      const now = Date.now();
      let start = now;
      
      switch (timeWindow) {
        case '1h':
          start = now - 60 * 60 * 1000;
          break;
        case '24h':
          start = now - 24 * 60 * 60 * 1000;
          break;
        case '7d':
          start = now - 7 * 24 * 60 * 60 * 1000;
          break;
        case '30d':
          start = now - 30 * 24 * 60 * 60 * 1000;
          break;
      }
      
      timeRange = { start, end: now };
    }
    
    return this.telemetry.getInsights({ timeRange });
  }
  
  getTelemetryMetrics(): any {
    // Return a promise that resolves to metrics
    return this.telemetry.getMetrics();
  }
  
  // Expose the underlying telemetry service for advanced usage
  getUnderlyingService(): TelemetryService {
    return this.telemetry;
  }
}