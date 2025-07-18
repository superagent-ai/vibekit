/**
 * Phase 5.3: Export & Integration Pipeline Service
 * 
 * Provides comprehensive export capabilities for telemetry data including:
 * - Multiple output formats (JSON, CSV, OpenTelemetry OTLP)
 * - Flexible filtering and time range selection
 * - Data transformation and aggregation
 * - Streaming for large datasets
 * - Compression and archival support
 */

import { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and, or, gte, lte, desc, asc, sql, count, sum, avg, inArray } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable, Transform } from 'stream';
import { 
  telemetryEvents, 
  telemetrySessions, 
  telemetryStats,
  telemetryErrors,
  telemetryBuffers,
  telemetryAuditLog,
  TelemetryEvent,
  TelemetrySession,
  TelemetryStats,
  TelemetryError,
  TelemetryBuffer,
  TelemetryAuditLog
} from './schema';

// Export format types
export type ExportFormat = 'json' | 'csv' | 'otlp' | 'parquet';
export type CompressionType = 'none' | 'gzip' | 'brotli';

// Export configuration interface
export interface ExportConfig {
  format: ExportFormat;
  outputPath: string;
  compression?: CompressionType;
  includeMetadata?: boolean;
  pretty?: boolean; // For JSON formatting
  delimiter?: string; // For CSV (default: ',')
  timeZone?: string; // For timestamp formatting
  maxFileSize?: number; // Max file size in bytes for splitting
  chunkSize?: number; // Records per chunk for streaming
}

// Filtering options
export interface ExportFilter {
  // Time range filtering
  fromTime?: number;
  toTime?: number;
  
  // Entity filtering
  sessionIds?: string[];
  agentTypes?: string[];
  modes?: string[];
  eventTypes?: string[];
  errorTypes?: string[];
  
  // Status filtering
  sessionStatuses?: string[];
  resolved?: boolean; // For errors
  
  // Data selection
  tables?: string[]; // Which tables to export
  includeRelated?: boolean; // Include related data
  
  // Pagination
  limit?: number;
  offset?: number;
  
  // Ordering
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

// Export metadata
export interface ExportMetadata {
  exportId: string;
  timestamp: number;
  format: ExportFormat;
  filter: ExportFilter;
  config: ExportConfig;
  stats: {
    totalRecords: number;
    filesGenerated: string[];
    duration: number;
    size: number;
  };
  schema: {
    version: string;
    tables: string[];
  };
}

// OpenTelemetry span interface
export interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano?: string;
  attributes: Record<string, any>;
  status: {
    code: number;
    message?: string;
  };
  events: Array<{
    timeUnixNano: string;
    name: string;
    attributes: Record<string, any>;
  }>;
  resource: {
    attributes: Record<string, any>;
  };
}

// Custom export error class
export class ExportError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ExportError';
  }
}

export class TelemetryExportService {
  private config?: any;

  constructor(private db: BetterSQLite3Database<Record<string, never>>, config?: any) {
    this.config = config;
  }

  /**
   * Initialize the export service (for API compatibility)
   */
  async initialize(): Promise<void> {
    // No initialization needed for basic export service
    // This method exists for API compatibility
  }

  /**
   * Main export method - supports all formats and configurations
   */
  async export(filter: ExportFilter = {}, config: ExportConfig): Promise<ExportMetadata> {
    const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    try {
      // Validate configuration
      this.validateConfig(config);
      
      // Ensure output directory exists
      const outputDir = path.dirname(config.outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      let stats: ExportMetadata['stats'];

      switch (config.format) {
        case 'json':
          stats = await this.exportJSON(filter, config, exportId);
          break;
        case 'csv':
          stats = await this.exportCSV(filter, config, exportId);
          break;
        case 'otlp':
          stats = await this.exportOTLP(filter, config, exportId);
          break;
        case 'parquet':
          throw new ExportError('Parquet format not yet implemented', 'FORMAT_NOT_IMPLEMENTED');
        default:
          throw new ExportError(`Unsupported format: ${config.format}`, 'INVALID_FORMAT');
      }

      const metadata: ExportMetadata = {
        exportId,
        timestamp: Date.now(),
        format: config.format,
        filter,
        config,
        stats: {
          ...stats,
          duration: Date.now() - startTime,
        },
        schema: {
          version: '1.0.0',
          tables: filter.tables || ['events', 'sessions', 'errors', 'stats', 'buffers', 'audit'],
        },
      };

      // Write metadata file
      await this.writeMetadata(metadata, config.outputPath);
      
      return metadata;
    } catch (error) {
      throw new ExportError(
        `Export failed: ${error.message}`,
        'EXPORT_FAILED',
        { exportId, filter, config, error: error.message }
      );
    }
  }

  /**
   * Export to JSON format
   */
  private async exportJSON(
    filter: ExportFilter,
    config: ExportConfig,
    exportId: string
  ): Promise<ExportMetadata['stats']> {
    const data = await this.fetchData(filter);
    const files: string[] = [];
    let totalSize = 0;

    // Format JSON based on configuration
    const jsonData = {
      metadata: {
        exportId,
        timestamp: Date.now(),
        filter,
        schema: '1.0.0',
      },
      data,
    };

    const jsonContent = config.pretty ? 
      JSON.stringify(jsonData, null, 2) : 
      JSON.stringify(jsonData);

    // Apply compression if requested
    const outputPath = this.getOutputPath(config.outputPath, 'json', config.compression);
    
    if (config.compression === 'gzip') {
      const compressed = zlib.gzipSync(jsonContent);
      fs.writeFileSync(outputPath, compressed);
      totalSize = compressed.length;
    } else if (config.compression === 'brotli') {
      const compressed = zlib.brotliCompressSync(jsonContent);
      fs.writeFileSync(outputPath, compressed);
      totalSize = compressed.length;
    } else {
      fs.writeFileSync(outputPath, jsonContent);
      totalSize = Buffer.byteLength(jsonContent);
    }

    files.push(outputPath);

    return {
      totalRecords: this.countRecords(data),
      filesGenerated: files,
      duration: 0, // Will be set by caller
      size: totalSize,
    };
  }

  /**
   * Export to CSV format
   */
  private async exportCSV(
    filter: ExportFilter,
    config: ExportConfig,
    exportId: string
  ): Promise<ExportMetadata['stats']> {
    const data = await this.fetchData(filter);
    const files: string[] = [];
    let totalSize = 0;
    const delimiter = config.delimiter || ',';

    // Export each table as a separate CSV file
    for (const [tableName, records] of Object.entries(data)) {
      if (!records || records.length === 0) continue;

      const csvPath = this.getOutputPath(
        config.outputPath.replace(/\.[^.]+$/, `_${tableName}.csv`),
        'csv',
        config.compression
      );

      const csvContent = this.recordsToCSV(records as any[], delimiter);
      
      if (config.compression === 'gzip') {
        const compressed = zlib.gzipSync(csvContent);
        fs.writeFileSync(csvPath, compressed);
        totalSize += compressed.length;
      } else if (config.compression === 'brotli') {
        const compressed = zlib.brotliCompressSync(csvContent);
        fs.writeFileSync(csvPath, compressed);
        totalSize += compressed.length;
      } else {
        fs.writeFileSync(csvPath, csvContent);
        totalSize += Buffer.byteLength(csvContent);
      }

      files.push(csvPath);
    }

    return {
      totalRecords: this.countRecords(data),
      filesGenerated: files,
      duration: 0,
      size: totalSize,
    };
  }

  /**
   * Export to OpenTelemetry OTLP format
   */
  private async exportOTLP(
    filter: ExportFilter,
    config: ExportConfig,
    exportId: string
  ): Promise<ExportMetadata['stats']> {
    const data = await this.fetchData(filter);
    const spans = this.convertToOTLPSpans(data);
    
    const otlpData = {
      resourceSpans: [{
        resource: {
          attributes: {
            'service.name': 'vibekit-telemetry',
            'service.version': '1.0.0',
            'export.id': exportId,
            'export.timestamp': Date.now(),
          },
        },
        instrumentationLibrarySpans: [{
          instrumentationLibrary: {
            name: 'vibekit-export',
            version: '1.0.0',
          },
          spans,
        }],
      }],
    };

    const jsonContent = config.pretty ? 
      JSON.stringify(otlpData, null, 2) : 
      JSON.stringify(otlpData);

    const outputPath = this.getOutputPath(config.outputPath, 'json', config.compression);
    
    let totalSize = 0;
    if (config.compression === 'gzip') {
      const compressed = zlib.gzipSync(jsonContent);
      fs.writeFileSync(outputPath, compressed);
      totalSize = compressed.length;
    } else if (config.compression === 'brotli') {
      const compressed = zlib.brotliCompressSync(jsonContent);
      fs.writeFileSync(outputPath, compressed);
      totalSize = compressed.length;
    } else {
      fs.writeFileSync(outputPath, jsonContent);
      totalSize = Buffer.byteLength(jsonContent);
    }

    return {
      totalRecords: spans.length,
      filesGenerated: [outputPath],
      duration: 0,
      size: totalSize,
    };
  }

  /**
   * Fetch data based on filter criteria
   */
  private async fetchData(filter: ExportFilter): Promise<Record<string, any[]>> {
    const data: Record<string, any[]> = {};
    const tables = filter.tables || ['events', 'sessions', 'errors', 'stats', 'buffers', 'audit'];

    for (const table of tables) {
      switch (table) {
        case 'events':
          data.events = await this.fetchEvents(filter);
          break;
        case 'sessions':
          data.sessions = await this.fetchSessions(filter);
          break;
        case 'errors':
          data.errors = await this.fetchErrors(filter);
          break;
        case 'stats':
          data.stats = await this.fetchStats(filter);
          break;
        case 'buffers':
          data.buffers = await this.fetchBuffers(filter);
          break;
        case 'audit':
          data.audit = await this.fetchAuditLog(filter);
          break;
      }
    }

    return data;
  }

  /**
   * Fetch events with filtering
   */
  private async fetchEvents(filter: ExportFilter): Promise<TelemetryEvent[]> {
    let query = this.db.select().from(telemetryEvents);
    const conditions = [];

    if (filter.fromTime) {
      conditions.push(gte(telemetryEvents.timestamp, filter.fromTime));
    }
    if (filter.toTime) {
      conditions.push(lte(telemetryEvents.timestamp, filter.toTime));
    }
    if (filter.sessionIds?.length) {
      conditions.push(sql`${telemetryEvents.sessionId} IN (${filter.sessionIds.map(id => `'${id}'`).join(',')})`);
    }
    if (filter.agentTypes?.length) {
      conditions.push(inArray(telemetryEvents.agentType, filter.agentTypes));
    }
    if (filter.eventTypes?.length) {
      conditions.push(inArray(telemetryEvents.eventType, filter.eventTypes));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    if (filter.orderBy) {
      const direction = filter.orderDirection === 'desc' ? desc : asc;
      query = query.orderBy(direction(telemetryEvents[filter.orderBy as keyof typeof telemetryEvents] || telemetryEvents.timestamp));
    } else {
      query = query.orderBy(desc(telemetryEvents.timestamp));
    }

    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.offset(filter.offset);
    }

    return await query;
  }

  /**
   * Fetch sessions with filtering
   */
  private async fetchSessions(filter: ExportFilter): Promise<TelemetrySession[]> {
    let query = this.db.select().from(telemetrySessions);
    const conditions = [];

    if (filter.fromTime) {
      conditions.push(gte(telemetrySessions.startTime, filter.fromTime));
    }
    if (filter.toTime) {
      conditions.push(lte(telemetrySessions.startTime, filter.toTime));
    }
    if (filter.sessionIds?.length) {
      conditions.push(sql`${telemetrySessions.id} IN (${filter.sessionIds.map(id => `'${id}'`).join(',')})`);
    }
    if (filter.agentTypes?.length) {
      // Use inArray for proper type safety
      conditions.push(inArray(telemetrySessions.agentType, filter.agentTypes));
    }
    if (filter.sessionStatuses?.length) {
      conditions.push(inArray(telemetrySessions.status, filter.sessionStatuses));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(telemetrySessions.startTime));

    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.offset(filter.offset);
    }

    return await query;
  }

  /**
   * Fetch errors with filtering
   */
  private async fetchErrors(filter: ExportFilter): Promise<TelemetryError[]> {
    let query = this.db.select().from(telemetryErrors);
    const conditions = [];

    if (filter.fromTime) {
      conditions.push(gte(telemetryErrors.timestamp, filter.fromTime));
    }
    if (filter.toTime) {
      conditions.push(lte(telemetryErrors.timestamp, filter.toTime));
    }
    if (filter.sessionIds?.length) {
      conditions.push(sql`${telemetryErrors.sessionId} IN (${filter.sessionIds.map(id => `'${id}'`).join(',')})`);
    }
    if (filter.errorTypes?.length) {
      conditions.push(sql`${telemetryErrors.errorType} IN (${filter.errorTypes.map(type => `'${type}'`).join(',')})`);
    }
    if (typeof filter.resolved === 'boolean') {
      conditions.push(eq(telemetryErrors.resolved, filter.resolved));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(telemetryErrors.timestamp));

    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.offset(filter.offset);
    }

    return await query;
  }

  /**
   * Fetch stats with filtering
   */
  private async fetchStats(filter: ExportFilter): Promise<TelemetryStats[]> {
    let query = this.db.select().from(telemetryStats);
    const conditions = [];

    if (filter.fromTime) {
      conditions.push(gte(telemetryStats.computedAt, filter.fromTime));
    }
    if (filter.toTime) {
      conditions.push(lte(telemetryStats.computedAt, filter.toTime));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(telemetryStats.computedAt));

    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.offset(filter.offset);
    }

    return await query;
  }

  /**
   * Fetch buffers with filtering
   */
  private async fetchBuffers(filter: ExportFilter): Promise<TelemetryBuffer[]> {
    let query = this.db.select().from(telemetryBuffers);
    const conditions = [];

    if (filter.fromTime) {
      conditions.push(gte(telemetryBuffers.createdAt, filter.fromTime));
    }
    if (filter.toTime) {
      conditions.push(lte(telemetryBuffers.createdAt, filter.toTime));
    }
    if (filter.sessionIds?.length) {
      conditions.push(sql`${telemetryBuffers.sessionId} IN (${filter.sessionIds.map(id => `'${id}'`).join(',')})`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(telemetryBuffers.createdAt));

    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.offset(filter.offset);
    }

    return await query;
  }

  /**
   * Fetch audit log with filtering
   */
  private async fetchAuditLog(filter: ExportFilter): Promise<TelemetryAuditLog[]> {
    let query = this.db.select().from(telemetryAuditLog);
    const conditions = [];

    if (filter.fromTime) {
      conditions.push(gte(telemetryAuditLog.timestamp, filter.fromTime));
    }
    if (filter.toTime) {
      conditions.push(lte(telemetryAuditLog.timestamp, filter.toTime));
    }
    if (filter.sessionIds?.length) {
      conditions.push(sql`${telemetryAuditLog.sessionId} IN (${filter.sessionIds.map(id => `'${id}'`).join(',')})`);
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    query = query.orderBy(desc(telemetryAuditLog.timestamp));

    if (filter.limit) {
      query = query.limit(filter.limit);
    }
    if (filter.offset) {
      query = query.offset(filter.offset);
    }

    return await query;
  }

  /**
   * Convert telemetry data to OpenTelemetry spans
   */
  private convertToOTLPSpans(data: Record<string, any[]>): OTLPSpan[] {
    const spans: OTLPSpan[] = [];
    const sessions = data.sessions || [];
    const events = data.events || [];

    // Group events by session
    const eventsBySession = new Map<string, any[]>();
    events.forEach(event => {
      if (!eventsBySession.has(event.sessionId)) {
        eventsBySession.set(event.sessionId, []);
      }
      eventsBySession.get(event.sessionId)!.push(event);
    });

    // Convert each session to a span with events
    sessions.forEach(session => {
      const sessionEvents = eventsBySession.get(session.id) || [];
      
      const span: OTLPSpan = {
        traceId: this.generateTraceId(session.id),
        spanId: this.generateSpanId(session.id),
        name: `vibekit.session.${session.agentType}`,
        kind: 1, // SPAN_KIND_INTERNAL
        startTimeUnixNano: this.timestampToNano(session.startTime),
        endTimeUnixNano: session.endTime ? this.timestampToNano(session.endTime) : undefined,
        attributes: {
          'agent.type': session.agentType,
          'session.mode': session.mode,
          'session.status': session.status,
          'session.event_count': session.eventCount,
          'session.error_count': session.errorCount,
          'session.duration_ms': session.duration || 0,
          ...(session.sandboxId && { 'sandbox.id': session.sandboxId }),
          ...(session.repoUrl && { 'repo.url': session.repoUrl }),
        },
        status: {
          code: session.errorCount > 0 ? 2 : 1, // ERROR : OK
          message: session.status === 'failed' ? 'Session failed' : undefined,
        },
        events: sessionEvents.map(event => ({
          timeUnixNano: this.timestampToNano(event.timestamp),
          name: `session.${event.eventType}`,
          attributes: {
            'event.type': event.eventType,
            'event.prompt': event.prompt,
            ...(event.streamData && { 'event.stream_data': event.streamData }),
            ...(event.metadata && { 'event.metadata': event.metadata }),
          },
        })),
        resource: {
          attributes: {
            'service.name': 'vibekit',
            'service.version': '1.0.0',
            'telemetry.sdk.name': 'vibekit-export',
            'telemetry.sdk.version': '1.0.0',
          },
        },
      };

      spans.push(span);
    });

    return spans;
  }

  /**
   * Convert records to CSV format
   */
  private recordsToCSV(records: any[], delimiter: string): string {
    if (records.length === 0) return '';

    // Get headers from first record
    const headers = Object.keys(records[0]);
    const csvLines: string[] = [];

    // Add header row
    csvLines.push(headers.map(h => this.escapeCsvValue(h, delimiter)).join(delimiter));

    // Add data rows
    records.forEach(record => {
      const values = headers.map(header => {
        const value = record[header];
        if (value === null || value === undefined) return '';
        return this.escapeCsvValue(String(value), delimiter);
      });
      csvLines.push(values.join(delimiter));
    });

    return csvLines.join('\n');
  }

  /**
   * Escape CSV values
   */
  private escapeCsvValue(value: string, delimiter: string): string {
    // If value contains delimiter, newlines, or quotes, wrap in quotes and escape quotes
    if (value.includes(delimiter) || value.includes('\n') || value.includes('\r') || value.includes('"')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * Count total records in data
   */
  private countRecords(data: Record<string, any[]>): number {
    return Object.values(data).reduce((total, records) => total + (records?.length || 0), 0);
  }

  /**
   * Generate output path with format and compression
   */
  private getOutputPath(basePath: string, format: string, compression?: CompressionType): string {
    let path = basePath;
    
    // Ensure correct extension
    if (!path.endsWith(`.${format}`)) {
      path = path.replace(/\.[^.]+$/, `.${format}`);
    }
    
    // Add compression extension
    if (compression === 'gzip') {
      path += '.gz';
    } else if (compression === 'brotli') {
      path += '.br';
    }
    
    return path;
  }

  /**
   * Generate trace ID for OpenTelemetry
   */
  private generateTraceId(sessionId: string): string {
    // Generate a 32-character hex string (128-bit)
    const hash = require('crypto').createHash('md5').update(sessionId).digest('hex');
    return hash + hash.substr(0, 16); // Pad to 32 chars
  }

  /**
   * Generate span ID for OpenTelemetry
   */
  private generateSpanId(sessionId: string): string {
    // Generate a 16-character hex string (64-bit)
    return require('crypto').createHash('md5').update(sessionId + 'span').digest('hex').substr(0, 16);
  }

  /**
   * Convert timestamp to nanoseconds for OpenTelemetry
   */
  private timestampToNano(timestamp: number): string {
    // Convert milliseconds to nanoseconds
    return (timestamp * 1_000_000).toString();
  }

  /**
   * Write metadata file
   */
  private async writeMetadata(metadata: ExportMetadata, basePath: string): Promise<void> {
    const metadataPath = basePath.replace(/\.[^.]+$/, '.metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  }

  /**
   * Validate export configuration
   */
  private validateConfig(config: ExportConfig): void {
    if (!config.format) {
      throw new ExportError('Export format is required', 'MISSING_FORMAT');
    }
    if (!config.outputPath) {
      throw new ExportError('Output path is required', 'MISSING_OUTPUT_PATH');
    }
    if (config.format === 'csv' && config.delimiter && config.delimiter.length !== 1) {
      throw new ExportError('CSV delimiter must be a single character', 'INVALID_DELIMITER');
    }
  }
} 