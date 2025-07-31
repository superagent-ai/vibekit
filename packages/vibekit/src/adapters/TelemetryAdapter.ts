import { TelemetryService, type TelemetryConfig } from '@vibe-kit/telemetry';
import type { TelemetryConfig as VibeKitTelemetryConfig } from '../types.js';

export class VibeKitTelemetryAdapter {
  private telemetry: TelemetryService;
  
  constructor(config: VibeKitTelemetryConfig & { serviceVersion: string }) {
    // Convert VibeKit telemetry config to new telemetry package config
    const telemetryConfig: Partial<TelemetryConfig> = {
      serviceName: 'vibekit',
      serviceVersion: config.serviceVersion,
      environment: 'development',
      
      storage: [
        {
          type: 'sqlite',
          enabled: config.localStore?.isEnabled ?? true,
          options: {
            path: config.localStore?.path || '.vibekit/telemetry.db',
            streamBatchSize: config.localStore?.streamBatchSize || 100,
            streamFlushInterval: config.localStore?.streamFlushIntervalMs || 5000,
            streamBuffering: true,
          }
        },
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
          enabled: true,
        },
        encryption: {
          enabled: false,
        },
        retention: {
          enabled: true,
          maxAge: 30, // 30 days
        },
      },
      
      dashboard: {
        enabled: false, // Enable via CLI commands
      },
      
      analytics: {
        enabled: true,
      },
    };
    
    this.telemetry = new TelemetryService(telemetryConfig);
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
  ): Promise<void> {
    return this.telemetry.trackStart(agentType, mode, prompt, metadata);
  }
  
  async trackStream(
    agentType: string,
    mode: string,
    prompt: string,
    data: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.track({
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
    agentType: string,
    mode: string,
    prompt: string,
    sandboxId?: string,
    repoUrl?: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.trackEnd(agentType, mode, prompt, {
      ...metadata,
      sandboxId,
      repoUrl,
    });
  }
  
  async trackError(
    agentType: string,
    mode: string,
    prompt: string,
    error: string,
    metadata?: any
  ): Promise<void> {
    return this.telemetry.trackError(agentType, mode, error, metadata);
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