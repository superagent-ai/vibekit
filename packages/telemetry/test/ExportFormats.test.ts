import { describe, it, expect, beforeEach } from 'vitest';
import { OTLPExporter } from '../src/export/formats/OTLPExporter.js';
import { ParquetExporter } from '../src/export/formats/ParquetExporter.js';
import type { TelemetryEvent } from '../src/core/types.js';

describe('Export Formats', () => {
  let testEvents: TelemetryEvent[];
  
  beforeEach(() => {
    testEvents = [
      {
        id: 'event-1',
        sessionId: 'session-1',
        eventType: 'start',
        category: 'agent',
        action: 'start',
        timestamp: Date.now(),
        context: { environment: 'test', version: '1.0.0' }
      },
      {
        id: 'event-2',
        sessionId: 'session-1',
        eventType: 'stream',
        category: 'agent',
        action: 'generate',
        timestamp: Date.now() + 1000,
        duration: 500,
        metadata: { tokens: 100 },
        context: { environment: 'test', version: '1.0.0' }
      },
      {
        id: 'event-3',
        sessionId: 'session-1',
        eventType: 'end',
        category: 'agent',
        action: 'end',
        timestamp: Date.now() + 2000,
        duration: 2000,
        context: { environment: 'test', version: '1.0.0' }
      }
    ];
  });

  describe('OTLPExporter', () => {
    let exporter: OTLPExporter;
    
    beforeEach(() => {
      exporter = new OTLPExporter({
        serviceName: 'test-service',
        serviceVersion: '1.0.0'
      });
    });

    it('should export events in OTLP format', async () => {
      const result = await exporter.export(testEvents);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.format).toBe('otlp');
      expect(typeof result.data).toBe('string');
      
      const otlpData = JSON.parse(result.data);
      expect(otlpData).toHaveProperty('resourceSpans');
      expect(Array.isArray(otlpData.resourceSpans)).toBe(true);
      expect(otlpData.resourceSpans.length).toBeGreaterThan(0);
      
      const resourceSpan = otlpData.resourceSpans[0];
      expect(resourceSpan).toHaveProperty('resource');
      expect(resourceSpan).toHaveProperty('scopeSpans');
      
      // Check resource attributes
      const resource = resourceSpan.resource;
      const serviceNameAttr = resource.attributes.find((attr: any) => attr.key === 'service.name');
      expect(serviceNameAttr).toBeDefined();
      expect(serviceNameAttr.value.stringValue).toBe('test-service');
      
      // Check spans
      const spans = resourceSpan.scopeSpans[0].spans;
      expect(spans.length).toBeGreaterThan(0);
      
      const mainSpan = spans[0];
      expect(mainSpan).toHaveProperty('traceId');
      expect(mainSpan).toHaveProperty('spanId');
      expect(mainSpan).toHaveProperty('startTimeUnixNano');
      expect(mainSpan).toHaveProperty('attributes');
    });

    it('should export binary format', async () => {
      const buffer = await exporter.exportBinary(testEvents);
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('should handle empty events array', async () => {
      const result = await exporter.export([]);
      
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      const otlpData = JSON.parse(result.data);
      expect(otlpData.resourceSpans).toHaveLength(0);
    });

    it('should generate unique trace and span IDs', async () => {
      const result1 = await exporter.export(testEvents);
      const result2 = await exporter.export(testEvents);
      
      const otlp1 = JSON.parse(result1.data);
      const otlp2 = JSON.parse(result2.data);
      
      const span1 = otlp1.resourceSpans[0]?.scopeSpans[0]?.spans[0];
      const span2 = otlp2.resourceSpans[0]?.scopeSpans[0]?.spans[0];
      
      expect(span1?.traceId).not.toBe(span2?.traceId);
      expect(span1?.spanId).not.toBe(span2?.spanId);
    });
  });

  describe('ParquetExporter', () => {
    let exporter: ParquetExporter;
    
    beforeEach(() => {
      exporter = new ParquetExporter({
        compression: 'SNAPPY',
        enableDictionary: true,
      });
    });

    it('should export events in Parquet format', async () => {
      const buffer = await exporter.export(testEvents);
      
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
      
      // Parse the simplified Parquet structure
      const parquetData = JSON.parse(buffer.toString());
      expect(parquetData).toHaveProperty('metadata');
      expect(parquetData).toHaveProperty('data');
      expect(parquetData).toHaveProperty('rowGroups');
      
      // Check metadata
      expect(parquetData.metadata.numRows).toBe(testEvents.length);
      expect(parquetData.metadata.compression).toBe('SNAPPY');
      expect(parquetData.metadata.schema).toBeDefined();
      
      // Check column statistics
      expect(parquetData.metadata.columnStatistics).toBeDefined();
      expect(parquetData.metadata.columnStatistics.id.count).toBe(testEvents.length);
      expect(parquetData.metadata.columnStatistics.sessionId.distinctCount).toBe(1);
    });

    it('should handle different compression options', async () => {
      const gzipExporter = new ParquetExporter({ compression: 'GZIP' });
      const buffer = await gzipExporter.export(testEvents);
      
      const parquetData = JSON.parse(buffer.toString());
      expect(parquetData.metadata.compression).toBe('GZIP');
    });

    it('should create dictionary encoding for repeated values', async () => {
      // Create events with repeated values
      const repeatedEvents = Array.from({ length: 100 }, (_, i) => ({
        id: `event-${i}`,
        sessionId: i < 50 ? 'session-1' : 'session-2', // Only 2 unique values
        eventType: 'stream',
        category: 'agent',
        action: 'generate',
        timestamp: Date.now() + i,
        context: { environment: 'test', version: '1.0.0' }
      }));
      
      const buffer = await exporter.export(repeatedEvents);
      const parquetData = JSON.parse(buffer.toString());
      
      // Check if dictionary encoding is used for sessionId
      const sessionIdData = parquetData.data.sessionId;
      expect(sessionIdData.encoding).toBe('DICTIONARY');
      expect(sessionIdData.dictionary).toEqual(['session-1', 'session-2']);
    });

    it('should calculate column statistics correctly', async () => {
      const eventsWithNumbers = testEvents.map(event => ({
        ...event,
        value: Math.random() * 100
      }));
      
      const buffer = await exporter.export(eventsWithNumbers);
      const parquetData = JSON.parse(buffer.toString());
      
      const valueStats = parquetData.metadata.columnStatistics.value;
      expect(valueStats.count).toBe(eventsWithNumbers.length);
      expect(valueStats.nullCount).toBe(0);
      expect(valueStats.min).toBeDefined();
      expect(valueStats.max).toBeDefined();
      expect(valueStats.avg).toBeDefined();
    });

    it('should handle null values correctly', async () => {
      const eventsWithNulls = [
        ...testEvents,
        {
          id: 'event-null',
          sessionId: 'session-2',
          eventType: 'test',
          category: 'test',
          action: 'test',
          timestamp: Date.now(),
          label: null,
          value: null,
          context: { environment: 'test', version: '1.0.0' }
        }
      ];
      
      const buffer = await exporter.export(eventsWithNulls);
      const parquetData = JSON.parse(buffer.toString());
      
      const labelStats = parquetData.metadata.columnStatistics.label;
      expect(labelStats.nullCount).toBeGreaterThan(0);
    });

    it('should create row groups for large datasets', async () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `event-${i}`,
        sessionId: `session-${Math.floor(i / 100)}`,
        eventType: 'stream',
        category: 'agent',
        action: 'generate',
        timestamp: Date.now() + i,
        context: { environment: 'test', version: '1.0.0' }
      }));
      
      const exporter = new ParquetExporter({ rowGroupSize: 250 });
      const buffer = await exporter.export(largeDataset);
      const parquetData = JSON.parse(buffer.toString());
      
      expect(parquetData.rowGroups.length).toBe(4); // 1000 / 250 = 4 row groups
      
      parquetData.rowGroups.forEach((rowGroup: any, index: number) => {
        expect(rowGroup.startRow).toBe(index * 250);
        expect(rowGroup.numRows).toBe(250);
        expect(rowGroup.totalByteSize).toBeGreaterThan(0);
      });
    });
  });

  describe('Export Format Integration', () => {
    it('should handle events with complex metadata', async () => {
      const complexEvents: TelemetryEvent[] = [{
        id: 'complex-1',
        sessionId: 'session-complex',
        eventType: 'custom',
        category: 'integration',
        action: 'test',
        timestamp: Date.now(),
        value: 42.5,
        metadata: {
          nested: {
            array: [1, 2, 3],
            object: { key: 'value' }
          },
          string: 'test',
          number: 123,
          boolean: true,
          null: null
        },
        context: { environment: 'test', version: '1.0.0' }
      }];
      
      // Test OTLP export
      const otlpExporter = new OTLPExporter();
      const otlpResult = await otlpExporter.export(complexEvents);
      expect(otlpResult).toBeDefined();
      expect(otlpResult.success).toBe(true);
      
      const otlpData = JSON.parse(otlpResult.data);
      const span = otlpData.resourceSpans[0].scopeSpans[0].spans[0];
      const metadataAttrs = span.attributes.filter((attr: any) => 
        attr.key.startsWith('metadata.')
      );
      expect(metadataAttrs.length).toBeGreaterThan(0);
      
      // Test Parquet export
      const parquetExporter = new ParquetExporter();
      const parquetBuffer = await parquetExporter.export(complexEvents);
      const parquetData = JSON.parse(parquetBuffer.toString());
      expect(parquetData.metadata.numRows).toBe(1);
    });
  });
});