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
import { DashboardServer } from '../dashboard/server/DashboardServer.js';

export class TelemetryService extends TelemetryEventEmitter {
  private config: TelemetryConfig;
  private storageProviders: StorageProvider[] = [];
  private streamingProvider?: StreamingProvider;
  private securityProvider: SecurityProvider;
  private reliabilityManager: ReliabilityManager;
  private analyticsEngine?: AnalyticsEngine;
  private pluginManager: PluginManager;
  private dashboardServer?: DashboardServer;
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
      dashboard: { ...DEFAULT_CONFIG.dashboard, ...config.dashboard },
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
    
    switch (this.config.streaming.type) {
      case 'websocket':
        this.streamingProvider = new WebSocketProvider();
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

    try {
      // Enrich event with defaults
      const enrichedEvent = await this.enrichEvent(event);
      
      // Apply security measures
      const sanitizedEvent = await this.securityProvider.sanitize(enrichedEvent);
      
      // Apply rate limiting
      await this.reliabilityManager.checkRateLimit(sanitizedEvent);
      
      // Process through plugins
      const processedEvent = await this.pluginManager.processEvent(sanitizedEvent);
      
      // Store event
      await this.storeEvent(processedEvent);
      
      // Stream event if configured
      if (this.streamingProvider) {
        await this.streamingProvider.stream(processedEvent);
      }
      
      // Update analytics
      if (this.analyticsEngine) {
        await this.analyticsEngine.process(processedEvent);
      }
      
      this.emit('event:tracked', processedEvent);
    } catch (error) {
      this.emit('event:error', error instanceof Error ? error : new Error(String(error)));
      throw error;
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
    
    for (const provider of this.storageProviders) {
      try {
        await this.reliabilityManager.executeWithCircuitBreaker(
          `storage:${provider.name}`,
          () => provider.store(event)
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push(err);
        this.emit('storage:error', err);
      }
    }

    // If all storage providers failed, throw error
    if (errors.length === this.storageProviders.length) {
      throw new Error(`All storage providers failed: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  // Convenience methods for common event types
  async trackStart(category: string, action: string, label?: string, metadata?: any): Promise<void> {
    return this.track({
      eventType: 'start',
      category,
      action,
      label,
      metadata,
    });
  }

  async trackEnd(category: string, action: string, label?: string, metadata?: any): Promise<void> {
    return this.track({
      eventType: 'end',
      category,
      action,
      label,
      metadata,
    });
  }

  async trackError(category: string, action: string, error: Error | string, metadata?: any): Promise<void> {
    return this.track({
      eventType: 'error',
      category,
      action,
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
  async startDashboard(options?: DashboardOptions): Promise<DashboardServer> {
    if (!this.config.dashboard?.enabled) {
      throw new Error('Dashboard is not enabled in configuration');
    }
    
    this.dashboardServer = new DashboardServer(this, options);
    await this.dashboardServer.start();
    return this.dashboardServer;
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
  async export(format: ExportFormat, filter?: QueryFilter): Promise<ExportResult> {
    const events = await this.query(filter || {});
    
    const { JSONExporter } = await import('../export/formats/JSONExporter.js');
    const { CSVExporter } = await import('../export/formats/CSVExporter.js');
    
    let exporter;
    switch (format.type) {
      case 'json':
        exporter = new JSONExporter();
        break;
      case 'csv':
        exporter = new CSVExporter();
        break;
      default:
        throw new Error(`Unsupported export format: ${format.type}`);
    }
    
    return exporter.export(events, format.options);
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
    
    // Flush any pending events
    await this.flush();
    
    // Shutdown providers
    const shutdownPromises = [
      ...this.storageProviders.map(p => p.shutdown()),
      this.streamingProvider?.shutdown(),
      this.analyticsEngine?.shutdown(),
      this.pluginManager.shutdown(),
      this.dashboardServer?.shutdown(),
    ].filter(Boolean);
    
    await Promise.all(shutdownPromises);
    
    this.isInitialized = false;
    this.emit('shutdown');
  }
}