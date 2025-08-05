import type { TelemetryEvent, QueryFilter, ExportFormat, ExportResult } from '../../core/types.js';
import type { StorageProvider } from '../../storage/StorageProvider.js';

// Hook context provides information about the current operation
export interface HookContext {
  plugin: string;
  operation: string;
  timestamp: number;
  metadata?: Record<string, any>;
}

// Storage hook types
export interface StorageHooks {
  beforeStore?: (
    events: TelemetryEvent[],
    provider: string,
    context: HookContext
  ) => Promise<TelemetryEvent[]>;
  
  afterStore?: (
    events: TelemetryEvent[],
    provider: string,
    result: any,
    context: HookContext
  ) => Promise<void>;
  
  onStorageError?: (
    error: Error,
    events: TelemetryEvent[],
    provider: string,
    context: HookContext
  ) => Promise<void>;
  
  beforeDelete?: (
    filter: any,
    provider: string,
    context: HookContext
  ) => Promise<any>;
  
  afterDelete?: (
    filter: any,
    result: any,
    provider: string,
    context: HookContext
  ) => Promise<void>;
}

// Query hook types
export interface QueryHooks {
  beforeQuery?: (
    filter: QueryFilter,
    provider: string,
    context: HookContext
  ) => Promise<QueryFilter>;
  
  afterQuery?: (
    results: TelemetryEvent[],
    filter: QueryFilter,
    provider: string,
    context: HookContext
  ) => Promise<TelemetryEvent[]>;
  
  onQueryError?: (
    error: Error,
    filter: QueryFilter,
    provider: string,
    context: HookContext
  ) => Promise<void>;
  
  transformQueryResult?: (
    result: any,
    filter: QueryFilter,
    context: HookContext
  ) => Promise<any>;
  
  beforeCount?: (
    filter: QueryFilter,
    provider: string,
    context: HookContext
  ) => Promise<QueryFilter>;
  
  afterCount?: (
    count: number,
    filter: QueryFilter,
    provider: string,
    context: HookContext
  ) => Promise<number>;
}

// Export hook types
export interface ExportHooks {
  beforeExport?: (
    events: TelemetryEvent[],
    format: ExportFormat,
    options: any,
    context: HookContext
  ) => Promise<TelemetryEvent[]>;
  
  afterExport?: (
    result: ExportResult,
    format: ExportFormat,
    options: any,
    context: HookContext
  ) => Promise<void>;
  
  onExportError?: (
    error: Error,
    format: ExportFormat,
    options: any,
    context: HookContext
  ) => Promise<void>;
  
  transformExportData?: (
    data: any,
    format: ExportFormat,
    context: HookContext
  ) => Promise<any>;
}

// Analytics hook types
export interface AnalyticsHooks {
  beforeAnalytics?: (
    operation: string,
    params: any,
    context: HookContext
  ) => Promise<any>;
  
  afterAnalytics?: (
    operation: string,
    result: any,
    params: any,
    context: HookContext
  ) => Promise<any>;
  
  onAnalyticsError?: (
    error: Error,
    operation: string,
    params: any,
    context: HookContext
  ) => Promise<void>;
}

// Hook execution options
export interface HookExecutionOptions {
  // Continue executing hooks even if one fails
  continueOnError?: boolean;
  // Maximum time to wait for a hook to complete
  timeout?: number;
  // Execute hooks in parallel (order not guaranteed)
  parallel?: boolean;
  // Skip specific plugins
  skipPlugins?: string[];
}

// Hook result for tracking execution
export interface HookResult<T = any> {
  plugin: string;
  hook: string;
  success: boolean;
  duration: number;
  result?: T;
  error?: Error;
}

// Plugin hook registry
export interface PluginHookRegistry {
  storage: Map<string, StorageHooks>;
  query: Map<string, QueryHooks>;
  export: Map<string, ExportHooks>;
  analytics: Map<string, AnalyticsHooks>;
  custom: Map<string, Map<string, Function>>;
}