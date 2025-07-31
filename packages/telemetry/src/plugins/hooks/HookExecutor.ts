import type { 
  HookContext, 
  HookExecutionOptions, 
  HookResult,
  PluginHookRegistry 
} from './types.js';
import type { Plugin } from '../../core/types.js';

export class HookExecutor {
  private registry: PluginHookRegistry = {
    storage: new Map(),
    query: new Map(),
    export: new Map(),
    analytics: new Map(),
    custom: new Map(),
  };
  
  private defaultOptions: HookExecutionOptions = {
    continueOnError: true,
    timeout: 5000,
    parallel: false,
    skipPlugins: [],
  };
  
  /**
   * Register hooks from a plugin
   */
  registerPlugin(plugin: Plugin): void {
    // Register storage hooks
    const storageHooks: any = {};
    if (plugin.beforeStore) storageHooks.beforeStore = plugin.beforeStore.bind(plugin);
    if (plugin.afterStore) storageHooks.afterStore = plugin.afterStore.bind(plugin);
    if (plugin.onStorageError) storageHooks.onStorageError = plugin.onStorageError.bind(plugin);
    
    if (Object.keys(storageHooks).length > 0) {
      this.registry.storage.set(plugin.name, storageHooks);
    }
    
    // Register query hooks
    const queryHooks: any = {};
    if (plugin.beforeQuery) queryHooks.beforeQuery = plugin.beforeQuery.bind(plugin);
    if (plugin.afterQuery) queryHooks.afterQuery = plugin.afterQuery.bind(plugin);
    if (plugin.onQueryError) queryHooks.onQueryError = plugin.onQueryError.bind(plugin);
    if (plugin.transformQueryResult) queryHooks.transformQueryResult = plugin.transformQueryResult.bind(plugin);
    
    if (Object.keys(queryHooks).length > 0) {
      this.registry.query.set(plugin.name, queryHooks);
    }
    
    // Register export hooks
    const exportHooks: any = {};
    if (plugin.beforeExport) exportHooks.beforeExport = plugin.beforeExport.bind(plugin);
    if (plugin.afterExport) exportHooks.afterExport = plugin.afterExport.bind(plugin);
    if (plugin.onExportError) exportHooks.onExportError = plugin.onExportError.bind(plugin);
    
    if (Object.keys(exportHooks).length > 0) {
      this.registry.export.set(plugin.name, exportHooks);
    }
    
    // Register analytics hooks
    const analyticsHooks: any = {};
    if (plugin.beforeAnalytics) analyticsHooks.beforeAnalytics = plugin.beforeAnalytics.bind(plugin);
    if (plugin.afterAnalytics) analyticsHooks.afterAnalytics = plugin.afterAnalytics.bind(plugin);
    
    if (Object.keys(analyticsHooks).length > 0) {
      this.registry.analytics.set(plugin.name, analyticsHooks);
    }
    
    // Register custom hooks
    if (plugin.hooks) {
      const customHooks = new Map<string, Function>();
      for (const [name, hook] of Object.entries(plugin.hooks)) {
        customHooks.set(name, hook.bind(plugin));
      }
      this.registry.custom.set(plugin.name, customHooks);
    }
  }
  
  /**
   * Unregister a plugin's hooks
   */
  unregisterPlugin(pluginName: string): void {
    this.registry.storage.delete(pluginName);
    this.registry.query.delete(pluginName);
    this.registry.export.delete(pluginName);
    this.registry.analytics.delete(pluginName);
    this.registry.custom.delete(pluginName);
  }
  
  /**
   * Execute hooks of a specific type
   */
  async executeHooks<T = any>(
    category: keyof PluginHookRegistry,
    hookName: string,
    args: any[],
    options: HookExecutionOptions = {}
  ): Promise<HookResult<T>[]> {
    const opts = { ...this.defaultOptions, ...options };
    const hooks = this.registry[category];
    const results: HookResult<T>[] = [];
    
    // Collect all hooks to execute
    const hooksToExecute: Array<{ plugin: string; hook: Function }> = [];
    
    for (const [pluginName, pluginHooks] of hooks) {
      if (opts.skipPlugins?.includes(pluginName)) continue;
      
      const hook = (pluginHooks as any)[hookName];
      if (hook) {
        hooksToExecute.push({ plugin: pluginName, hook });
      }
    }
    
    // Execute hooks
    if (opts.parallel) {
      // Parallel execution
      const promises = hooksToExecute.map(({ plugin, hook }) =>
        this.executeHook(plugin, hookName, hook, args, opts.timeout)
      );
      
      const parallelResults = await Promise.all(promises);
      results.push(...parallelResults);
    } else {
      // Sequential execution
      for (const { plugin, hook } of hooksToExecute) {
        try {
          const result = await this.executeHook(plugin, hookName, hook, args, opts.timeout);
          results.push(result);
          
          if (!result.success && !opts.continueOnError) {
            break;
          }
        } catch (error) {
          if (!opts.continueOnError) {
            throw error;
          }
        }
      }
    }
    
    return results;
  }
  
  /**
   * Execute a single hook with timeout
   */
  private async executeHook<T = any>(
    pluginName: string,
    hookName: string,
    hook: Function,
    args: any[],
    timeout?: number
  ): Promise<HookResult<T>> {
    const startTime = Date.now();
    
    try {
      let result: T;
      
      if (timeout) {
        result = await Promise.race([
          hook(...args),
          new Promise<T>((_, reject) => 
            setTimeout(() => reject(new Error('Hook timeout')), timeout)
          ),
        ]);
      } else {
        result = await hook(...args);
      }
      
      return {
        plugin: pluginName,
        hook: hookName,
        success: true,
        duration: Date.now() - startTime,
        result,
      };
    } catch (error) {
      return {
        plugin: pluginName,
        hook: hookName,
        success: false,
        duration: Date.now() - startTime,
        error: error as Error,
      };
    }
  }
  
  /**
   * Execute storage hooks
   */
  async executeStorageHooks(
    hookName: keyof import('./types.js').StorageHooks,
    args: any[],
    context: HookContext,
    options?: HookExecutionOptions
  ): Promise<any> {
    const results = await this.executeHooks('storage', hookName, [...args, context], options);
    
    // For before hooks, return the last successful result
    if (hookName.startsWith('before')) {
      const lastSuccess = results.filter(r => r.success).pop();
      return lastSuccess?.result || args[0];
    }
  }
  
  /**
   * Execute query hooks
   */
  async executeQueryHooks(
    hookName: keyof import('./types.js').QueryHooks,
    args: any[],
    context: HookContext,
    options?: HookExecutionOptions
  ): Promise<any> {
    const results = await this.executeHooks('query', hookName, [...args, context], options);
    
    // For before/after hooks, return the transformed result
    if (hookName.startsWith('before') || hookName.startsWith('after')) {
      const lastSuccess = results.filter(r => r.success).pop();
      return lastSuccess?.result || args[0];
    }
  }
  
  /**
   * Execute export hooks
   */
  async executeExportHooks(
    hookName: keyof import('./types.js').ExportHooks,
    args: any[],
    context: HookContext,
    options?: HookExecutionOptions
  ): Promise<any> {
    const results = await this.executeHooks('export', hookName, [...args, context], options);
    
    // For transform hooks, return the transformed result
    if (hookName.startsWith('before') || hookName.includes('transform')) {
      const lastSuccess = results.filter(r => r.success).pop();
      return lastSuccess?.result || args[0];
    }
  }
  
  /**
   * Execute analytics hooks
   */
  async executeAnalyticsHooks(
    hookName: keyof import('./types.js').AnalyticsHooks,
    args: any[],
    context: HookContext,
    options?: HookExecutionOptions
  ): Promise<any> {
    const results = await this.executeHooks('analytics', hookName, [...args, context], options);
    
    // For before/after hooks, return the transformed result
    if (hookName.startsWith('before') || hookName.startsWith('after')) {
      const lastSuccess = results.filter(r => r.success).pop();
      return lastSuccess?.result || args[0];
    }
  }
  
  /**
   * Execute custom hooks
   */
  async executeCustomHook(
    hookName: string,
    args: any[],
    options?: HookExecutionOptions
  ): Promise<any[]> {
    const results: any[] = [];
    const opts = { ...this.defaultOptions, ...options };
    
    for (const [pluginName, customHooks] of this.registry.custom) {
      if (opts.skipPlugins?.includes(pluginName)) continue;
      
      const hook = customHooks.get(hookName);
      if (hook) {
        try {
          const result = await this.executeHook(
            pluginName,
            hookName,
            hook,
            args,
            opts.timeout
          );
          
          if (result.success) {
            results.push(result.result);
          } else if (!opts.continueOnError) {
            throw result.error;
          }
        } catch (error) {
          if (!opts.continueOnError) {
            throw error;
          }
        }
      }
    }
    
    return results;
  }
  
  /**
   * Get registered hooks for debugging
   */
  getRegisteredHooks(): {
    storage: string[];
    query: string[];
    export: string[];
    analytics: string[];
    custom: Record<string, string[]>;
  } {
    const getHookNames = (map: Map<string, any>) => {
      const names: string[] = [];
      for (const [plugin, hooks] of map) {
        for (const hookName of Object.keys(hooks)) {
          names.push(`${plugin}.${hookName}`);
        }
      }
      return names;
    };
    
    const customHooks: Record<string, string[]> = {};
    for (const [plugin, hooks] of this.registry.custom) {
      customHooks[plugin] = Array.from(hooks.keys());
    }
    
    return {
      storage: getHookNames(this.registry.storage),
      query: getHookNames(this.registry.query),
      export: getHookNames(this.registry.export),
      analytics: getHookNames(this.registry.analytics),
      custom: customHooks,
    };
  }
  
  /**
   * Clean up resources
   */
  shutdown(): void {
    // Clear all registries
    this.registry.storage.clear();
    this.registry.query.clear();
    this.registry.export.clear();
    this.registry.analytics.clear();
    this.registry.custom.clear();
  }
}