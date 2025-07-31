import type { TelemetryEvent, ExportResult } from '../../core/types.js';

export class CSVExporter {
  async export(events: TelemetryEvent[], options?: any): Promise<ExportResult> {
    if (events.length === 0) {
      return {
      success: true,
        format: 'csv',
        data: '',
        size: 0,
        exportedAt: Date.now(),
      };
    }
    
    // Define CSV headers
    const headers = [
      'id',
      'sessionId',
      'eventType',
      'category',
      'action',
      'label',
      'value',
      'timestamp',
      'duration',
      'metadata',
      'context',
    ];
    
    // Create CSV content
    const rows = [
      headers.join(','), // Header row
      ...events.map(event => [
        this.escapeCsvValue(event.id || ''),
        this.escapeCsvValue(event.sessionId),
        this.escapeCsvValue(event.eventType),
        this.escapeCsvValue(event.category),
        this.escapeCsvValue(event.action),
        this.escapeCsvValue(event.label || ''),
        event.value || '',
        event.timestamp,
        event.duration || '',
        this.escapeCsvValue(event.metadata ? JSON.stringify(event.metadata) : ''),
        this.escapeCsvValue(event.context ? JSON.stringify(event.context) : ''),
      ].join(','))
    ];
    
    const csvString = rows.join('\n');
    
    return {
      success: true,
      format: 'csv',
      data: csvString,
      size: Buffer.byteLength(csvString, 'utf8'),
      exportedAt: Date.now(),
    };
  }
  
  private escapeCsvValue(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}