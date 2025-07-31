import type { Plugin, TelemetryEvent, QueryFilter, ExportFormat, ExportResult } from '../core/types.js';
import { HookExecutor } from './hooks/HookExecutor.js';
import type { HookContext, HookExecutionOptions } from './hooks/types.js';

export class PluginManager {
  private plugins = new Map<string, Plugin>();
  private hookExecutor = new HookExecutor();
  private customExporters = new Map<string, any>();
  private customStorageProviders = new Map<string, any>();
  
  constructor(private telemetryService: any) {}
  
  async initialize(plugins?: Plugin[]): Promise<void> {
    if (plugins) {
      for (const plugin of plugins) {
        await this.register(plugin);
      }
    }
  }
  
  async register(plugin: Plugin): Promise<void> {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin ${plugin.name} is already registered`);
    }
    
    // Initialize plugin
    if (plugin.initialize) {
      await plugin.initialize(this.telemetryService);
    }
    
    // Register hooks with executor
    this.hookExecutor.registerPlugin(plugin);
    
    // Register custom storage providers
    if (plugin.registerStorageProvider) {
      plugin.registerStorageProvider((name: string, provider: any) => {
        this.customStorageProviders.set(name, provider);
      });
    }
    
    // Register custom exporters
    if (plugin.registerExporter) {
      plugin.registerExporter((format: string, exporter: any) => {
        this.customExporters.set(format, exporter);
      });
    }
    
    this.plugins.set(plugin.name, plugin);
  }
  
  async unregister(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      return;
    }
    
    // Shutdown plugin
    if (plugin.shutdown) {
      try {
        await plugin.shutdown();
      } catch (error) {
        console.error(`Error shutting down plugin ${pluginName}:`, error);
      }
    }
    
    // Unregister hooks
    this.hookExecutor.unregisterPlugin(pluginName);
    
    this.plugins.delete(pluginName);
  }
  
  /**
   * Process event tracking (legacy support + new system)
   */
  async processEvent(event: TelemetryEvent): Promise<TelemetryEvent> {
    let processedEvent = event;
    
    // Execute beforeTrack hooks (legacy)
    for (const plugin of this.plugins.values()) {
      if (plugin.beforeTrack) {
        const result = await plugin.beforeTrack(processedEvent);
        if (result === null) {
          throw new Error(`Plugin ${plugin.name} rejected event`);
        }
        processedEvent = result;
      }
    }
    
    // Execute afterTrack hooks (legacy)
    for (const plugin of this.plugins.values()) {
      if (plugin.afterTrack) {
        await plugin.afterTrack(processedEvent);
      }
    }
    
    return processedEvent;
  }
  
  /**
   * Execute storage hooks
   */
  async executeStorageHooks(
    operation: 'beforeStore' | 'afterStore' | 'onStorageError' | 'beforeDelete' | 'afterDelete',
    args: any[],
    provider: string,
    options?: HookExecutionOptions
  ): Promise<any> {
    const context: HookContext = {
      plugin: 'storage',
      operation,
      timestamp: Date.now(),
      metadata: { provider },
    };
    
    return this.hookExecutor.executeStorageHooks(operation, args, context, options);
  }
  
  /**
   * Execute query hooks
   */
  async executeQueryHooks(
    operation: 'beforeQuery' | 'afterQuery' | 'onQueryError' | 'transformQueryResult' | 'beforeCount' | 'afterCount',
    args: any[],
    provider: string,
    options?: HookExecutionOptions
  ): Promise<any> {
    const context: HookContext = {
      plugin: 'query',
      operation,
      timestamp: Date.now(),
      metadata: { provider },
    };
    
    return this.hookExecutor.executeQueryHooks(operation, args, context, options);
  }
  
  /**
   * Execute export hooks
   */
  async executeExportHooks(
    operation: 'beforeExport' | 'afterExport' | 'onExportError' | 'transformExportData',
    args: any[],
    format: ExportFormat,
    options?: HookExecutionOptions
  ): Promise<any> {
    const context: HookContext = {
      plugin: 'export',
      operation,
      timestamp: Date.now(),
      metadata: { format },
    };
    
    return this.hookExecutor.executeExportHooks(operation, args, context, options);
  }
  
  /**
   * Execute analytics hooks
   */
  async executeAnalyticsHooks(
    operation: 'beforeAnalytics' | 'afterAnalytics' | 'onAnalyticsError',
    args: any[],
    analyticsOp: string,
    options?: HookExecutionOptions
  ): Promise<any> {
    const context: HookContext = {
      plugin: 'analytics',
      operation,
      timestamp: Date.now(),
      metadata: { analyticsOperation: analyticsOp },
    };
    
    return this.hookExecutor.executeAnalyticsHooks(operation, args, context, options);
  }
  
  /**
   * Execute custom hooks
   */
  async executeCustomHook(
    hookName: string,
    args: any[],
    options?: HookExecutionOptions
  ): Promise<any[]> {
    return this.hookExecutor.executeCustomHook(hookName, args, options);
  }
  
  /**
   * Get custom exporters registered by plugins
   */
  getCustomExporters(): Map<string, any> {
    return new Map(this.customExporters);
  }
  
  /**
   * Get custom storage providers registered by plugins
   */
  getCustomStorageProviders(): Map<string, any> {
    return new Map(this.customStorageProviders);
  }
  
  /**
   * Get all registered plugins
   */
  getPlugins(): Plugin[] {
    return Array.from(this.plugins.values());
  }
  
  /**
   * Get a specific plugin
   */
  getPlugin(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }
  
  /**
   * Check if a plugin is registered
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }
  
  /**
   * Get hook execution stats
   */
  getHookStats(): any {
    return this.hookExecutor.getRegisteredHooks();
  }
  
  /**
   * Legacy method - redirects to unregister
   */
  removePlugin(name: string): boolean {
    if (this.plugins.has(name)) {
      this.unregister(name).catch(console.error);
      return true;
    }
    return false;
  }
  
  async shutdown(): Promise<void> {
    // Shutdown all plugins
    const shutdownPromises: Promise<void>[] = [];
    
    for (const plugin of this.plugins.values()) {
      if (plugin.shutdown) {
        shutdownPromises.push(
          plugin.shutdown().catch(error => 
            console.error(`Error shutting down plugin ${plugin.name}:`, error)
          )
        );
      }
    }
    
    await Promise.all(shutdownPromises);
    
    this.plugins.clear();
    this.customExporters.clear();
    this.customStorageProviders.clear();
  }
}