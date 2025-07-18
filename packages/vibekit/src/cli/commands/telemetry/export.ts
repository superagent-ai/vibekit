/**
 * Phase 5.3: Export CLI Commands
 * 
 * Provides CLI interface for exporting telemetry data in multiple formats
 */

import { Command } from 'commander';
import { DrizzleTelemetryService } from '../../db/drizzle-telemetry-service';
import { TelemetryExportService, ExportFilter, ExportConfig } from '../../db/export';
import * as path from 'path';
import * as fs from 'fs';

export const exportCommand = new Command('export')
  .description('Export telemetry data in various formats')
  .option('-f, --format <format>', 'Export format (json, csv, otlp)', 'json')
  .option('-o, --output <path>', 'Output file path', './telemetry-export')
  .option('--compression <type>', 'Compression type (none, gzip, brotli)', 'none')
  .option('--pretty', 'Pretty-print JSON output', false)
  .option('--delimiter <char>', 'CSV delimiter character', ',')
  .option('--from <timestamp>', 'Start timestamp (Unix milliseconds)')
  .option('--to <timestamp>', 'End timestamp (Unix milliseconds)')
  .option('--sessions <ids>', 'Comma-separated session IDs to export')
  .option('--agents <types>', 'Comma-separated agent types to export')
  .option('--events <types>', 'Comma-separated event types to export')
  .option('--errors <types>', 'Comma-separated error types to export')
  .option('--tables <names>', 'Comma-separated table names to export', 'events,sessions,errors')
  .option('--limit <number>', 'Maximum number of records per table', '1000')
  .option('--offset <number>', 'Offset for pagination', '0')
  .option('--order-by <field>', 'Field to order by')
  .option('--order-dir <direction>', 'Order direction (asc, desc)', 'desc')
  .option('--db-path <path>', 'Path to telemetry database')
  .action(async (options) => {
    try {
      console.log('🚀 Starting telemetry data export...');
      
      // Initialize services
      const dbPath = options.dbPath || './.vibekit/telemetry.db';
      const telemetryService = new DrizzleTelemetryService({ path: dbPath });
      await telemetryService.initialize();
      
      const exportService = new TelemetryExportService(telemetryService.db);
      
      // Build export filter
      const filter: ExportFilter = {
        tables: options.tables.split(',').map((t: string) => t.trim()),
        limit: parseInt(options.limit),
        offset: parseInt(options.offset),
        orderDirection: options.orderDir as 'asc' | 'desc',
      };
      
      if (options.from) {
        filter.fromTime = parseInt(options.from);
      }
      if (options.to) {
        filter.toTime = parseInt(options.to);
      }
      if (options.sessions) {
        filter.sessionIds = options.sessions.split(',').map((s: string) => s.trim());
      }
      if (options.agents) {
        filter.agentTypes = options.agents.split(',').map((a: string) => a.trim());
      }
      if (options.events) {
        filter.eventTypes = options.events.split(',').map((e: string) => e.trim());
      }
      if (options.errors) {
        filter.errorTypes = options.errors.split(',').map((e: string) => e.trim());
      }
      if (options.orderBy) {
        filter.orderBy = options.orderBy;
      }
      
      // Build export config
      const config: ExportConfig = {
        format: options.format as 'json' | 'csv' | 'otlp',
        outputPath: path.resolve(options.output),
        compression: options.compression === 'none' ? undefined : options.compression,
        pretty: options.pretty,
        delimiter: options.delimiter,
      };
      
      // Perform export
      const metadata = await exportService.export(filter, config);
      
      console.log('✅ Export completed successfully!');
      console.log(`📊 Records exported: ${metadata.stats.totalRecords}`);
      console.log(`📁 Files generated: ${metadata.stats.filesGenerated.length}`);
      console.log(`📈 Total size: ${formatBytes(metadata.stats.size)}`);
      console.log(`⏱️  Duration: ${metadata.stats.duration}ms`);
      console.log(`📄 Metadata: ${config.outputPath.replace(/\.[^.]+$/, '.metadata.json')}`);
      
      // List generated files
      console.log('\n📋 Generated files:');
      metadata.stats.filesGenerated.forEach(file => {
        const stats = fs.statSync(file);
        console.log(`  • ${path.basename(file)} (${formatBytes(stats.size)})`);
      });
      
    } catch (error) {
      console.error('❌ Export failed:', error.message);
      process.exit(1);
    }
  });

export const listCommand = new Command('list')
  .description('List available telemetry data for export')
  .option('--db-path <path>', 'Path to telemetry database')
  .option('--sessions', 'List sessions summary', false)
  .option('--events', 'List events summary', false)
  .option('--errors', 'List errors summary', false)
  .option('--stats', 'List stats summary', false)
  .option('--all', 'List all table summaries', false)
  .action(async (options) => {
    try {
      const dbPath = options.dbPath || './.vibekit/telemetry.db';
      const telemetryService = new DrizzleTelemetryService({ path: dbPath });
      await telemetryService.initialize();
      
      const analytics = telemetryService.analytics;
      if (!analytics) {
        throw new Error('Analytics service not initialized');
      }
      
      console.log('📊 Telemetry Data Summary\n');
      
      if (options.all || options.sessions) {
        console.log('🔗 Sessions:');
        const sessions = await analytics.getSessionSummaries();
        console.log(`  Total: ${sessions.length}`);
        
        if (sessions.length > 0) {
          const agentCounts = sessions.reduce((acc, s) => {
            acc[s.agentType] = (acc[s.agentType] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          console.log('  By Agent:');
          Object.entries(agentCounts).forEach(([agent, count]) => {
            console.log(`    • ${agent}: ${count}`);
          });
          
          const recent = sessions.slice(0, 3);
          console.log(`  Recent (${recent.length}):`);
          recent.forEach(session => {
            const duration = session.duration ? `${session.duration}ms` : 'ongoing';
            console.log(`    • ${session.sessionId.slice(0, 8)}... (${session.agentType}, ${duration})`);
          });
        }
        console.log();
      }
      
      if (options.all || options.events) {
        console.log('📝 Events:');
        const filter = { tables: ['events'], limit: 1000 };
        const exportService = new TelemetryExportService(telemetryService.db);
        const data = await (exportService as any).fetchData(filter);
        const events = data.events || [];
        
        console.log(`  Total: ${events.length}`);
        
        if (events.length > 0) {
          const typeCounts = events.reduce((acc, e) => {
            acc[e.eventType] = (acc[e.eventType] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          console.log('  By Type:');
          Object.entries(typeCounts).forEach(([type, count]) => {
            console.log(`    • ${type}: ${count}`);
          });
        }
        console.log();
      }
      
      if (options.all || options.errors) {
        console.log('❌ Errors:');
        const filter = { tables: ['errors'], limit: 1000 };
        const exportService = new TelemetryExportService(telemetryService.db);
        const data = await (exportService as any).fetchData(filter);
        const errors = data.errors || [];
        
        console.log(`  Total: ${errors.length}`);
        
        if (errors.length > 0) {
          const typeCounts = errors.reduce((acc, e) => {
            acc[e.errorType] = (acc[e.errorType] || 0) + 1;
            return acc;
          }, {} as Record<string, number>);
          
          console.log('  By Type:');
          Object.entries(typeCounts).forEach(([type, count]) => {
            console.log(`    • ${type}: ${count}`);
          });
          
          const unresolved = errors.filter(e => !e.resolved).length;
          console.log(`  Unresolved: ${unresolved}`);
        }
        console.log();
      }
      
      if (options.all || options.stats) {
        console.log('📈 Statistics:');
        const metrics = await analytics.getRealTimeMetrics();
        console.log(`  Active Sessions: ${metrics.activeSessions}`);
        console.log(`  Events/min: ${metrics.eventsLastMinute}`);
        console.log(`  Error Rate: ${(metrics.errorRateLastMinute * 100).toFixed(1)}%`);
        console.log(`  Avg Response: ${metrics.avgResponseTime.toFixed(1)}ms`);
        console.log();
      }
      
    } catch (error) {
      console.error('❌ Failed to list telemetry data:', error.message);
      process.exit(1);
    }
  });

export const validateCommand = new Command('validate')
  .description('Validate export configuration and test connectivity')
  .option('--db-path <path>', 'Path to telemetry database')
  .option('--output <path>', 'Test output path', './test-export')
  .option('--format <format>', 'Test format (json, csv, otlp)', 'json')
  .action(async (options) => {
    try {
      console.log('🔍 Validating export configuration...');
      
      // Test database connectivity
      const dbPath = options.dbPath || './.vibekit/telemetry.db';
      console.log(`📁 Database: ${dbPath}`);
      
      if (!fs.existsSync(dbPath)) {
        throw new Error(`Database file not found: ${dbPath}`);
      }
      
      const telemetryService = new DrizzleTelemetryService({ path: dbPath });
      await telemetryService.initialize();
      console.log('✅ Database connection successful');
      
      // Test output directory
      const outputDir = path.dirname(path.resolve(options.output));
      console.log(`📂 Output directory: ${outputDir}`);
      
      if (!fs.existsSync(outputDir)) {
        console.log('📁 Creating output directory...');
        fs.mkdirSync(outputDir, { recursive: true });
      }
      console.log('✅ Output directory accessible');
      
      // Test export with small sample
      console.log('🧪 Testing export with sample data...');
      const exportService = new TelemetryExportService(telemetryService.db);
      
      const testConfig: ExportConfig = {
        format: options.format as 'json' | 'csv' | 'otlp',
        outputPath: path.resolve(options.output + '-test.' + options.format),
      };
      
      const testFilter: ExportFilter = {
        limit: 5, // Small sample
        tables: ['sessions', 'events'],
      };
      
      const metadata = await exportService.export(testFilter, testConfig);
      
      console.log('✅ Test export successful');
      console.log(`📊 Sample records: ${metadata.stats.totalRecords}`);
      console.log(`📄 Test file: ${metadata.stats.filesGenerated[0]}`);
      
      // Clean up test files
      metadata.stats.filesGenerated.forEach(file => {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      });
      
      const metadataFile = testConfig.outputPath.replace(/\.[^.]+$/, '.metadata.json');
      if (fs.existsSync(metadataFile)) {
        fs.unlinkSync(metadataFile);
      }
      
      console.log('🧹 Test files cleaned up');
      console.log('✅ Export validation completed successfully!');
      
    } catch (error) {
      console.error('❌ Validation failed:', error.message);
      process.exit(1);
    }
  });

export const convertCommand = new Command('convert')
  .description('Convert between export formats')
  .requiredOption('-i, --input <path>', 'Input file path')
  .requiredOption('-o, --output <path>', 'Output file path')
  .option('--from <format>', 'Input format (json, csv, otlp)', 'json')
  .option('--to <format>', 'Output format (json, csv, otlp)', 'csv')
  .option('--pretty', 'Pretty-print JSON output', false)
  .option('--delimiter <char>', 'CSV delimiter character', ',')
  .action(async (options) => {
    try {
      console.log('🔄 Converting export format...');
      console.log(`📥 Input: ${options.input} (${options.from})`);
      console.log(`📤 Output: ${options.output} (${options.to})`);
      
      if (!fs.existsSync(options.input)) {
        throw new Error(`Input file not found: ${options.input}`);
      }
      
      // Read input data
      let inputData: any;
      if (options.from === 'json') {
        const content = fs.readFileSync(options.input, 'utf8');
        inputData = JSON.parse(content);
      } else {
        throw new Error(`Conversion from ${options.from} format not yet implemented`);
      }
      
      // Convert to output format
      let outputContent: string;
      if (options.to === 'json') {
        outputContent = options.pretty ? 
          JSON.stringify(inputData, null, 2) : 
          JSON.stringify(inputData);
      } else if (options.to === 'csv') {
        // Convert JSON data to CSV format
        const records = inputData.data?.events || inputData.data?.sessions || [];
        if (records.length === 0) {
          throw new Error('No records found in input data for CSV conversion');
        }
        
        const headers = Object.keys(records[0]);
        const csvLines = [headers.join(options.delimiter)];
        
        records.forEach((record: any) => {
          const values = headers.map(header => {
            const value = record[header];
            if (value === null || value === undefined) return '';
            const stringValue = String(value);
            // Escape CSV values if needed
            if (stringValue.includes(options.delimiter) || stringValue.includes('\n') || stringValue.includes('"')) {
              return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
          });
          csvLines.push(values.join(options.delimiter));
        });
        
        outputContent = csvLines.join('\n');
      } else {
        throw new Error(`Conversion to ${options.to} format not yet implemented`);
      }
      
      // Write output
      const outputDir = path.dirname(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(options.output, outputContent);
      
      const stats = fs.statSync(options.output);
      console.log('✅ Conversion completed successfully!');
      console.log(`📄 Output file: ${options.output}`);
      console.log(`📊 Size: ${formatBytes(stats.size)}`);
      
    } catch (error) {
      console.error('❌ Conversion failed:', error.message);
      process.exit(1);
    }
  });

// Utility function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Export all commands
export const exportCommands = [
  exportCommand,
  listCommand,
  validateCommand,
  convertCommand,
]; 