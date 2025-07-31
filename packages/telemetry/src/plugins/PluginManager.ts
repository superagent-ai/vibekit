import type { Plugin, TelemetryEvent } from '../core/types.js';

export class PluginManager {
  private plugins: Plugin[] = [];
  
  constructor(private telemetryService: any) {}
  
  async initialize(plugins?: Plugin[]): Promise<void> {
    if (plugins) {
      for (const plugin of plugins) {
        await this.register(plugin);
      }
    }
  }
  
  async register(plugin: Plugin): Promise<void> {
    if (plugin.initialize) {
      await plugin.initialize(this.telemetryService);
    }
    this.plugins.push(plugin);
  }
  
  async processEvent(event: TelemetryEvent): Promise<TelemetryEvent> {
    let processedEvent = event;
    
    for (const plugin of this.plugins) {
      if (plugin.beforeTrack) {
        const result = await plugin.beforeTrack(processedEvent);
        if (result === null) {
          throw new Error(`Plugin ${plugin.name} rejected event`);
        }
        processedEvent = result;
      }
    }
    
    // Execute afterTrack hooks
    for (const plugin of this.plugins) {
      if (plugin.afterTrack) {
        await plugin.afterTrack(processedEvent);
      }
    }
    
    return processedEvent;
  }
  
  getPlugins(): Plugin[] {
    return [...this.plugins];
  }
  
  removePlugin(name: string): boolean {
    const index = this.plugins.findIndex(p => p.name === name);
    if (index >= 0) {
      this.plugins.splice(index, 1);
      return true;
    }
    return false;
  }
  
  async shutdown(): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.shutdown) {
        try {
          await plugin.shutdown();
        } catch (error) {
          console.error(`Error shutting down plugin ${plugin.name}:`, error);
        }
      }
    }
    this.plugins = [];
  }
}