import type { TelemetryEvent, ExportFormat, ExportResult } from '../core/types.js';
import type { PluginManager } from '../plugins/PluginManager.js';

export interface Exporter {
  format: string;
  export(events: TelemetryEvent[], options?: any): Promise<ExportResult>;
}

/**
 * Export manager that integrates with the plugin system
 */
export class PluginAwareExportManager {
  private exporters = new Map<string, Exporter>();
  
  constructor(
    private pluginManager: PluginManager,
    defaultExporters?: Map<string, Exporter>
  ) {
    // Register default exporters
    if (defaultExporters) {
      for (const [format, exporter] of defaultExporters) {
        this.exporters.set(format, exporter);
      }
    }
    
    // Register custom exporters from plugins
    const customExporters = this.pluginManager.getCustomExporters();
    for (const [format, exporter] of customExporters) {
      this.exporters.set(format, exporter);
    }
  }
  
  /**
   * Export events with plugin hooks
   */
  async export(
    events: TelemetryEvent[],
    format: ExportFormat | string,
    options?: any
  ): Promise<ExportResult> {
    const exporter = this.exporters.get(format);
    if (!exporter) {
      throw new Error(`Unsupported export format: ${format}`);
    }
    
    try {
      // Execute beforeExport hooks
      const processedEvents = await this.pluginManager.executeExportHooks(
        'beforeExport',
        [events, format, options],
        format
      );
      
      if (!processedEvents || processedEvents.length === 0) {
        return {
          success: true,
          format,
          data: '',
          metadata: {
            totalEvents: 0,
            exportedAt: new Date().toISOString(),
          },
        };
      }
      
      // Perform the export
      let result = await exporter.export(processedEvents, options);
      
      // Transform export data if needed
      const transformedData = await this.pluginManager.executeExportHooks(
        'transformExportData',
        [result.data, format],
        format
      );
      
      if (transformedData && transformedData !== result.data) {
        result = {
          ...result,
          data: transformedData,
        };
      }
      
      // Execute afterExport hooks
      await this.pluginManager.executeExportHooks(
        'afterExport',
        [result, format, options],
        format
      );
      
      return result;
    } catch (error) {
      // Execute error hooks
      await this.pluginManager.executeExportHooks(
        'onExportError',
        [error, format, options],
        format
      );
      throw error;
    }
  }
  
  /**
   * Register a new exporter
   */
  registerExporter(format: string, exporter: Exporter): void {
    this.exporters.set(format, exporter);
  }
  
  /**
   * Get available export formats
   */
  getAvailableFormats(): string[] {
    return Array.from(this.exporters.keys());
  }
  
  /**
   * Check if a format is supported
   */
  supportsFormat(format: string): boolean {
    return this.exporters.has(format);
  }
  
  /**
   * Get an exporter by format
   */
  getExporter(format: string): Exporter | undefined {
    return this.exporters.get(format);
  }
}