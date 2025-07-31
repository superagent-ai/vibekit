import { v4 as uuidv4 } from 'uuid';
import { TelemetryEventEmitter } from './EventEmitter.js';
import type {
  TelemetryConfig,
  TelemetryEvent,
  QueryFilter,
  Metrics,
  Insights,
  InsightOptions,
  TimeRange,
  ExportFormat,
  ExportResult,
  DashboardOptions,
  Plugin,
} from './types.js';
import { DEFAULT_CONFIG } from './constants.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { StreamingProvider } from '../streaming/StreamingProvider.js';
import { SecurityProvider } from '../security/SecurityProvider.js';
import { ReliabilityManager } from '../reliability/ReliabilityManager.js';
import { AnalyticsEngine } from '../analytics/AnalyticsEngine.js';
import { PluginManager } from '../plugins/PluginManager.js';
import { TelemetryAPIServer } from '../api/TelemetryAPIServer.js';

export class TelemetryService extends TelemetryEventEmitter {
  private config: TelemetryConfig;
  private storageProviders: StorageProvider[] = [];
  private streamingProvider?: StreamingProvider;
  private securityProvider: SecurityProvider;
  private reliabilityManager: ReliabilityManager;
  private analyticsEngine?: AnalyticsEngine;
  private pluginManager: PluginManager;
  private apiServer?: TelemetryAPIServer;
  private isInitialized = false;
  private maintenanceInterval?: NodeJS.Timeout;

  constructor(config: Partial<TelemetryConfig>) {
    super();
    this.config = this.validateAndMergeConfig(config);
    this.pluginManager = new PluginManager(this);
    this.securityProvider = new SecurityProvider(this.config.security);
    this.reliabilityManager = new ReliabilityManager(this.config.reliability);
  }

  private validateAndMergeConfig(config: Partial<TelemetryConfig>): TelemetryConfig {
    // Deep merge with defaults
    const merged = {
      ...DEFAULT_CONFIG,
      ...config,
      storage: config.storage || DEFAULT_CONFIG.storage,
      streaming: { ...DEFAULT_CONFIG.streaming, ...config.streaming },
      security: { ...DEFAULT_CONFIG.security, ...config.security },
      reliability: { ...DEFAULT_CONFIG.reliability, ...config.reliability },
      analytics: { ...DEFAULT_CONFIG.analytics, ...config.analytics },
      api: { ...DEFAULT_CONFIG.api, ...config.api },
    };

    if (!merged.serviceName) {
      throw new Error('serviceName is required in telemetry configuration');
    }

    return merged;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize storage providers
      await this.initializeStorage();
      
      // Initialize streaming if configured
      if (this.config.streaming?.enabled) {
        await this.initializeStreaming();
      }
      
      // Initialize analytics if configured
      if (this.config.analytics?.enabled) {
        await this.initializeAnalytics();
      }
      
      // Initialize plugins
      await this.pluginManager.initialize(this.config.plugins);
      
      // Start background tasks
      this.startMaintenanceTasks();
      
      this.isInitialized = true;
      this.emit('initialized');
    } catch (error) {
      throw new Error(`Failed to initialize telemetry service: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async initializeStorage(): Promise<void> {
    if (!this.config.storage || this.config.storage.length === 0) {
      throw new Error('At least one storage provider must be configured');
    }

    const { SQLiteProvider } = await import('../storage/providers/SQLiteProvider.js');
    const { OTLPProvider } = await import('../storage/providers/OTLPProvider.js');
    const { MemoryProvider } = await import('../storage/providers/MemoryProvider.js');

    for (const storageConfig of this.config.storage) {
      if (!storageConfig.enabled) continue;

      let provider: StorageProvider;
      
      switch (storageConfig.type) {
        case 'sqlite':
          provider = new SQLiteProvider(storageConfig.options || {});
          break;
        case 'otlp':
          provider = new OTLPProvider(storageConfig.options || {});
          break;
        case 'memory':
          provider = new MemoryProvider(storageConfig.options || {});
          break;
        default:
          throw new Error(`Unknown storage provider type: ${storageConfig.type}`);
      }

      await provider.initialize();
      this.storageProviders.push(provider);
    }
  }

  private async initializeStreaming(): Promise<void> {
    if (!this.config.streaming) return;

    const { WebSocketProvider } = await import('../streaming/providers/WebSocketProvider.js');
    const { SSEProvider } = await import('../streaming/providers/SSEProvider.js');
    const { GRPCProvider } = await import('../streaming/providers/GRPCProvider.js');
    
    switch (this.config.streaming.type) {
      case 'websocket':
        this.streamingProvider = new WebSocketProvider();
        break;
      case 'sse':
        this.streamingProvider = new SSEProvider();
        break;
      case 'grpc':
        this.streamingProvider = new GRPCProvider();
        break;
      default:
        throw new Error(`Unknown streaming provider type: ${this.config.streaming.type}`);
    }

    await this.streamingProvider.initialize(this.config.streaming);
  }

  private async initializeAnalytics(): Promise<void> {
    if (!this.config.analytics?.enabled) return;
    
    this.analyticsEngine = new AnalyticsEngine(this.config.analytics);
    await this.analyticsEngine.initialize();
  }

  private startMaintenanceTasks(): void {
    // Run maintenance every 5 minutes
    this.maintenanceInterval = setInterval(async () => {
      try {
        await this.runMaintenance();
      } catch (error) {
        this.emit('event:error', error instanceof Error ? error : new Error(String(error)));
      }
    }, 5 * 60 * 1000);
  }

  private async runMaintenance(): Promise<void> {
    // Clean up old data based on retention policies
    for (const provider of this.storageProviders) {
      if (provider.clean) {
        const retentionDays = this.config.security?.retention?.maxAge || 30;
        const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
        await provider.clean(cutoffDate);
      }
    }
  }

  // Generic event tracking method
  async track(event: Partial<TelemetryEvent>): Promise<void> {
    if (!this.isInitialized) {
      throw new Error('TelemetryService must be initialized before tracking events');
    }

    const correlationId = event.id || `track-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    try {
      // Enrich event with defaults
      const enrichedEvent = await this.enrichEvent(event);
      
      // Apply security measures with error handling
      let sanitizedEvent: TelemetryEvent;
      try {
        sanitizedEvent = await this.securityProvider.sanitize(enrichedEvent);
      } catch (error) {
        console.warn(`Security sanitization failed for event ${enrichedEvent.id}, proceeding with original event:`, error);
        sanitizedEvent = enrichedEvent; // Graceful degradation
        this.emit('security:warning', { event: enrichedEvent, error });
      }
      
      // Apply rate limiting
      await this.reliabilityManager.checkRateLimit(sanitizedEvent);
      
      // Process through plugins with error handling
      let processedEvent: TelemetryEvent;
      try {
        processedEvent = await this.pluginManager.processEvent(sanitizedEvent);
      } catch (error) {
        console.warn(`Plugin processing failed for event ${sanitizedEvent.id}, proceeding with sanitized event:`, error);
        processedEvent = sanitizedEvent; // Graceful degradation
        this.emit('plugin:warning', { event: sanitizedEvent, error });
      }
      
      // Store event (critical operation)
      await this.storeEvent(processedEvent);
      
      // Stream event if configured (non-critical)
      if (this.streamingProvider) {
        try {
          await this.reliabilityManager.executeWithRetry(
            () => this.streamingProvider!.stream(processedEvent),
            'streaming'
          );
        } catch (error) {
          console.warn(`Event streaming failed for event ${processedEvent.id}:`, error);
          this.emit('streaming:error', { event: processedEvent, error });
          // Don't throw - streaming failure shouldn't fail the entire tracking operation
        }
      }
      
      // Update analytics (non-critical)
      if (this.analyticsEngine) {
        try {
          await this.reliabilityManager.executeWithRetry(
            () => this.analyticsEngine!.process(processedEvent),
            'analytics'
          );
        } catch (error) {
          console.warn(`Analytics processing failed for event ${processedEvent.id}:`, error);
          this.emit('analytics:error', { event: processedEvent, error });
          // Don't throw - analytics failure shouldn't fail the entire tracking operation
        }
      }
      
      this.emit('event:tracked', processedEvent);
    } catch (error) {
      const enrichedError = error instanceof Error ? error : new Error(String(error));
      
      // Add correlation context to error
      if (!enrichedError.message.includes(correlationId)) {
        enrichedError.message = `[${correlationId}] ${enrichedError.message}`;
      }
      
      this.emit('event:error', { 
        error: enrichedError, 
        event, 
        correlationId,
        timestamp: Date.now() 
      });
      
      throw enrichedError;
    }
  }

  private async enrichEvent(event: Partial<TelemetryEvent>): Promise<TelemetryEvent> {
    return {
      id: event.id || uuidv4(),
      sessionId: event.sessionId || uuidv4(),
      eventType: event.eventType || 'custom',
      category: event.category || 'unknown',
      action: event.action || 'unknown',
      label: event.label,
      value: event.value,
      timestamp: event.timestamp || Date.now(),
      duration: event.duration,
      metadata: event.metadata,
      context: {
        ...event.context,
        environment: event.context?.environment || this.config.environment,
        version: event.context?.version || this.config.serviceVersion,
      },
    };
  }

  private async storeEvent(event: TelemetryEvent): Promise<void> {
    const errors: Error[] = [];
    let successCount = 0;
    
    // Try each storage provider with enhanced error handling
    for (const provider of this.storageProviders) {
      try {
        await this.reliabilityManager.executeWithGracefulDegradation(
          // Primary operation
          () => provider.store(event),
          // Fallback operation - try to store without reliability checks
          () => provider.store(event),
          `storage:${provider.name}`
        );
        successCount++;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
        this.emit('storage:error', err);
        
        console.warn(`Storage provider ${provider.name} failed to store event ${event.id}:`, err.message);
      }
    }

    // Enhanced error handling for storage failures
    if (successCount === 0) {
      // All providers failed - this is critical
      const criticalError = new Error(`All ${this.storageProviders.length} storage providers failed: ${errors.map(e => e.message).join(', ')}`);
      this.emit('storage:critical', { event, errors, criticalError });
      throw criticalError;
    } else if (errors.length > 0) {
      // Some providers failed - this is degraded operation
      const degradationWarning = `${errors.length}/${this.storageProviders.length} storage providers failed for event ${event.id}`;
      console.warn(degradationWarning, { errors: errors.map(e => e.message) });
      this.emit('storage:degraded', { event, errors, successCount, totalProviders: this.storageProviders.length });
    }
  }

  // Convenience methods for common event types  
  async trackStart(category: string, action: string, label?: string, metadata?: any): Promise<string> {
    const sessionId = uuidv4();
    await this.track({
      sessionId,
      eventType: 'start',
      category,
      action: 'start',
      label,
      metadata,
    });
    return sessionId;
  }

  async trackEnd(sessionId: string, status: string, metadata?: any): Promise<void> {
    return this.track({
      sessionId,
      eventType: 'end',
      category: 'agent',
      action: 'end',
      label: status,
      metadata,
    });
  }

  async trackError(sessionId: string, error: Error | string, metadata?: any): Promise<void> {
    return this.track({
      sessionId,
      eventType: 'error',
      category: 'agent',
      action: 'error',
      label: error instanceof Error ? error.message : error,
      metadata: {
        ...metadata,
        error: error instanceof Error ? {
          message: error.message,
          stack: error.stack,
          name: error.name,
        } : { message: error },
      },
    });
  }

  // Dashboard management
  async startAPIServer(options?: DashboardOptions): Promise<TelemetryAPIServer> {
    if (!this.config.api?.enabled) {
      throw new Error('API server is not enabled in configuration');
    }
    
    this.apiServer = new TelemetryAPIServer(this, options);
    await this.apiServer.start();
    return this.apiServer;
  }

  // Plugin management
  use(plugin: Plugin): void {
    this.pluginManager.register(plugin);
  }

  // Query methods
  async query(filter: QueryFilter): Promise<TelemetryEvent[]> {
    const results: TelemetryEvent[] = [];
    
    for (const provider of this.storageProviders) {
      if (provider.supportsQuery) {
        try {
          const providerResults = await provider.query(filter);
          results.push(...providerResults);
        } catch (error) {
          this.emit('storage:error', error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
    
    return this.deduplicateEvents(results);
  }

  private deduplicateEvents(events: TelemetryEvent[]): TelemetryEvent[] {
    const seen = new Set<string>();
    return events.filter(event => {
      if (event.id && seen.has(event.id)) {
        return false;
      }
      if (event.id) {
        seen.add(event.id);
      }
      return true;
    });
  }

  // Export methods
  async export(format: ExportFormat | { format: string }, filter?: QueryFilter): Promise<string> {
    const events = await this.query(filter || {});
    
    const formatType = typeof format === 'object' && 'format' in format ? format.format : format.type;
    
    switch (formatType) {
      case 'json': {
        const { JSONExporter } = await import('../export/formats/JSONExporter.js');
        const exporter = new JSONExporter();
        const result = await exporter.export(events);
        return result.data;
      }
      case 'csv': {
        const { CSVExporter } = await import('../export/formats/CSVExporter.js');
        const exporter = new CSVExporter();
        const result = await exporter.export(events);
        return result.data;
      }
      case 'otlp': {
        const { OTLPExporter } = await import('../export/formats/OTLPExporter.js');
        const exporter = new OTLPExporter({
          serviceName: this.config.serviceName,
          serviceVersion: this.config.serviceVersion,
        });
        return exporter.export(events);
      }
      case 'parquet': {
        const { ParquetExporter } = await import('../export/formats/ParquetExporter.js');
        const exporter = new ParquetExporter();
        const buffer = await exporter.export(events);
        return buffer.toString('base64'); // Return as base64 string
      }
      default:
        throw new Error(`Unsupported export format: ${formatType}`);
    }
  }

  // Analytics methods
  async getMetrics(timeRange?: TimeRange): Promise<Metrics> {
    if (!this.analyticsEngine) {
      throw new Error('Analytics is not enabled');
    }
    return this.analyticsEngine.getMetrics(timeRange);
  }

  async getInsights(options?: InsightOptions): Promise<Insights> {
    if (!this.analyticsEngine) {
      throw new Error('Analytics is not enabled');
    }
    return this.analyticsEngine.getInsights(options);
  }

  // Lifecycle methods
  async flush(): Promise<void> {
    const promises = this.storageProviders.map(provider => provider.flush?.());
    await Promise.all(promises.filter(Boolean));
  }

  async shutdown(): Promise<void> {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
    }
    
    try {
      // Flush any pending events with timeout
      await Promise.race([
        this.flush(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Flush timeout')), 10000)
        )
      ]);
    } catch (error) {
      console.warn('Error during flush on shutdown:', error);
    }
    
    // Shutdown providers with individual error handling
    const shutdownPromises = [
      ...this.storageProviders.map(p => this.safeShutdown(() => p.shutdown(), `storage:${p.name}`)),
      this.safeShutdown(() => this.streamingProvider?.shutdown(), 'streaming'),
      this.safeShutdown(() => this.analyticsEngine?.shutdown(), 'analytics'),
      this.safeShutdown(() => this.pluginManager.shutdown(), 'plugins'),
      this.safeShutdown(() => this.apiServer?.shutdown(), 'api-server'),
      this.safeShutdown(() => this.reliabilityManager.shutdown(), 'reliability'),
    ].filter(Boolean);
    
    await Promise.allSettled(shutdownPromises);
    
    this.isInitialized = false;
    this.emit('shutdown');
  }

  private async safeShutdown(shutdownFn: () => Promise<void> | void | undefined, context: string): Promise<void> {
    try {
      const result = shutdownFn();
      if (result && typeof result.then === 'function') {
        await result;
      }
    } catch (error) {
      console.warn(`Error during shutdown of ${context}:`, error);
    }
  }

  // Session management methods
  async getActiveSessions(): Promise<Array<{ id: string; eventCount: number; status: string }>> {
    const events = await this.query({});
    const sessionMap = new Map<string, { eventCount: number; hasEnd: boolean }>();
    
    for (const event of events) {
      const session = sessionMap.get(event.sessionId) || { eventCount: 0, hasEnd: false };
      session.eventCount++;
      if (event.eventType === 'end') {
        session.hasEnd = true;
      }
      sessionMap.set(event.sessionId, session);
    }
    
    return Array.from(sessionMap.entries())
      .filter(([_, session]) => !session.hasEnd)
      .map(([id, session]) => ({
        id,
        eventCount: session.eventCount,
        status: 'active'
      }));
  }

  async getSession(sessionId: string): Promise<{ id: string; eventCount: number; status: string } | null> {
    const events = await this.query({ sessionId });
    if (events.length === 0) return null;
    
    const hasEnd = events.some(e => e.eventType === 'end');
    return {
      id: sessionId,
      eventCount: events.length,
      status: hasEnd ? 'completed' : 'active'
    };
  }

  // Health monitoring methods
  getHealthStatus(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: {
      initialized: boolean;
      providers: Record<string, any>;
      reliability: any;
      timestamp: string;
    };
  } {
    const reliabilityHealth = this.reliabilityManager.getHealthStatus();
    
    // Check provider health
    const providerHealth = {
      storage: this.storageProviders.map(p => ({
        name: p.name,
        supportsQuery: p.supportsQuery,
        supportsBatch: p.supportsBatch,
      })),
      streaming: this.streamingProvider ? { enabled: true } : { enabled: false },
      analytics: this.analyticsEngine ? { enabled: true } : { enabled: false },
    };

    return {
      status: reliabilityHealth.status,
      details: {
        initialized: this.isInitialized,
        providers: providerHealth,
        reliability: reliabilityHealth.details,
        timestamp: new Date().toISOString(),
      },
    };
  }

  // Error recovery methods
  async resetCircuitBreakers(): Promise<void> {
    // This would be part of the ReliabilityManager
    const stats = this.reliabilityManager.getCircuitBreakerStats();
    console.log('Circuit breaker stats before reset:', stats);
    
    // Manual reset could be implemented in ReliabilityManager
    console.log('Circuit breakers reset requested');
  }

  async validateConfiguration(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate storage providers
    if (this.storageProviders.length === 0) {
      errors.push('No storage providers configured');
    }

    // Validate reliability configuration
    if (!this.config.reliability?.enabled) {
      errors.push('Reliability features are disabled');
    }

    // Validate security configuration
    if (!this.config.security?.enabled) {
      errors.push('Security features are disabled');
    }

    // Check provider connectivity
    for (const provider of this.storageProviders) {
      try {
        await provider.getStats();
      } catch (error) {
        errors.push(`Storage provider ${provider.name} is not accessible: ${(error as Error).message}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Enhanced error reporting
  getErrorReport(): {
    reliability: any;
    recentErrors: any[];
    healthStatus: any;
    configuration: any;
  } {
    return {
      reliability: this.reliabilityManager.getErrorStats(),
      recentErrors: [], // Could be expanded to track service-level errors
      healthStatus: this.getHealthStatus(),
      configuration: {
        storageProviders: this.storageProviders.length,
        streamingEnabled: !!this.streamingProvider,
        analyticsEnabled: !!this.analyticsEngine,
        securityEnabled: this.config.security?.enabled || false,
        reliabilityEnabled: this.config.reliability?.enabled || false,
      },
    };
  }
}