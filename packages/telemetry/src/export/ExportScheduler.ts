import { EventEmitter } from 'events';
import type { TelemetryEvent, ExportResult, QueryFilter, ExportFormat } from '../core/types.js';
import { JSONExporter } from './formats/JSONExporter.js';
import { CSVExporter } from './formats/CSVExporter.js';
import { OTLPExporter } from './formats/OTLPExporter.js';
import { ParquetExporter } from './formats/ParquetExporter.js';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';

interface ScheduleConfig {
  id: string;
  name: string;
  enabled: boolean;
  cron: string; // Cron expression
  format: 'json' | 'csv' | 'otlp' | 'parquet';
  destination: {
    type: 'file' | 'http' | 's3' | 'gcs';
    path?: string;
    endpoint?: string;
    credentials?: any;
    headers?: Record<string, string>;
  };
  filter?: QueryFilter;
  options?: {
    compression?: boolean;
    maxFileSize?: number; // bytes
    retention?: number; // days
    batchSize?: number;
  };
  notifications?: {
    onSuccess?: string[]; // webhook URLs
    onFailure?: string[]; // webhook URLs
    email?: string[];
  };
}

interface ScheduleExecution {
  scheduleId: string;
  executionId: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  result?: ExportResult;
  error?: string;
  eventsProcessed?: number;
}

interface CronParser {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
}

export class ExportScheduler extends EventEmitter {
  private schedules = new Map<string, ScheduleConfig>();
  private timers = new Map<string, NodeJS.Timeout>();
  private executions = new Map<string, ScheduleExecution>();
  private isRunning = false;
  private telemetryService: any;
  
  // Export format instances
  private jsonExporter = new JSONExporter();
  private csvExporter = new CSVExporter();
  private otlpExporter = new OTLPExporter();
  private parquetExporter = new ParquetExporter();
  
  constructor(telemetryService: any) {
    super();
    this.telemetryService = telemetryService;
  }
  
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    
    // Schedule all enabled schedules
    for (const schedule of this.schedules.values()) {
      if (schedule.enabled) {
        this.scheduleExport(schedule);
      }
    }
    
    this.emit('started');
    console.log('Export scheduler started');
  }
  
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    
    this.isRunning = false;
    this.emit('stopped');
    console.log('Export scheduler stopped');
  }
  
  addSchedule(config: ScheduleConfig): void {
    // Validate cron expression
    if (!this.isValidCron(config.cron)) {
      throw new Error(`Invalid cron expression: ${config.cron}`);
    }
    
    this.schedules.set(config.id, config);
    
    if (this.isRunning && config.enabled) {
      this.scheduleExport(config);
    }
    
    this.emit('scheduleAdded', config);
  }
  
  removeSchedule(scheduleId: string): boolean {
    const timer = this.timers.get(scheduleId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(scheduleId);
    }
    
    const removed = this.schedules.delete(scheduleId);
    if (removed) {
      this.emit('scheduleRemoved', scheduleId);
    }
    
    return removed;
  }
  
  updateSchedule(scheduleId: string, updates: Partial<ScheduleConfig>): boolean {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) return false;
    
    const updatedSchedule = { ...schedule, ...updates };
    
    // Validate cron if updated
    if (updates.cron && !this.isValidCron(updates.cron)) {
      throw new Error(`Invalid cron expression: ${updates.cron}`);
    }
    
    this.schedules.set(scheduleId, updatedSchedule);
    
    // Reschedule if running
    if (this.isRunning) {
      const timer = this.timers.get(scheduleId);
      if (timer) {
        clearTimeout(timer);
      }
      
      if (updatedSchedule.enabled) {
        this.scheduleExport(updatedSchedule);
      }
    }
    
    this.emit('scheduleUpdated', updatedSchedule);
    return true;
  }
  
  getSchedule(scheduleId: string): ScheduleConfig | undefined {
    return this.schedules.get(scheduleId);
  }
  
  getAllSchedules(): ScheduleConfig[] {
    return Array.from(this.schedules.values());
  }
  
  getExecution(executionId: string): ScheduleExecution | undefined {
    return this.executions.get(executionId);
  }
  
  getExecutionHistory(scheduleId?: string): ScheduleExecution[] {
    const executions = Array.from(this.executions.values());
    
    if (scheduleId) {
      return executions.filter(ex => ex.scheduleId === scheduleId);
    }
    
    return executions.sort((a, b) => b.startTime - a.startTime);
  }
  
  private scheduleExport(schedule: ScheduleConfig): void {
    const nextExecution = this.getNextExecutionTime(schedule.cron);
    const delay = nextExecution - Date.now();
    
    if (delay < 0) {
      // Should execute immediately
      this.executeSchedule(schedule);
      return;
    }
    
    const timer = setTimeout(() => {
      this.executeSchedule(schedule);
    }, delay);
    
    this.timers.set(schedule.id, timer);
    
    console.log(`Scheduled export '${schedule.name}' for ${new Date(nextExecution).toISOString()}`);
  }
  
  private async executeSchedule(schedule: ScheduleConfig): Promise<void> {
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    
    const execution: ScheduleExecution = {
      scheduleId: schedule.id,
      executionId,
      startTime: Date.now(),
      status: 'running',
    };
    
    this.executions.set(executionId, execution);
    this.emit('executionStarted', execution);
    
    try {
      console.log(`Executing export schedule: ${schedule.name}`);
      
      // Query events based on filter
      const events = await this.telemetryService.query(schedule.filter || {});
      execution.eventsProcessed = events.length;
      
      // Execute export based on format and destination
      const result = await this.performExport(schedule, events);
      
      execution.status = 'completed';
      execution.endTime = Date.now();
      execution.result = result;
      
      console.log(`Export completed: ${schedule.name} (${events.length} events)`);
      
      // Send success notifications
      if (schedule.notifications?.onSuccess) {
        await this.sendNotifications(schedule.notifications.onSuccess, {
          type: 'success',
          schedule,
          execution,
          result,
        });
      }
      
      this.emit('executionCompleted', execution);
      
    } catch (error) {
      execution.status = 'failed';
      execution.endTime = Date.now();
      execution.error = error instanceof Error ? error.message : String(error);
      
      console.error(`Export failed: ${schedule.name}`, error);
      
      // Send failure notifications
      if (schedule.notifications?.onFailure) {
        await this.sendNotifications(schedule.notifications.onFailure, {
          type: 'failure',
          schedule,
          execution,
          error: execution.error,
        });
      }
      
      this.emit('executionFailed', execution);
    }
    
    // Schedule next execution
    if (schedule.enabled && this.isRunning) {
      this.scheduleExport(schedule);
    }
  }
  
  private async performExport(schedule: ScheduleConfig, events: TelemetryEvent[]): Promise<ExportResult> {
    const { format, destination, options = {} } = schedule;
    
    switch (destination.type) {
      case 'file':
        return this.exportToFile(format, events, destination.path!, options);
        
      case 'http':
        return this.exportToHTTP(format, events, destination.endpoint!, destination.headers);
        
      case 's3':
        return this.exportToS3(format, events, destination, options);
        
      case 'gcs':
        return this.exportToGCS(format, events, destination, options);
        
      default:
        throw new Error(`Unsupported destination type: ${destination.type}`);
    }
  }
  
  private async exportToFile(
    format: string,
    events: TelemetryEvent[],
    basePath: string,
    options: any
  ): Promise<ExportResult> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `telemetry_${timestamp}.${format}`;
    const filePath = join(basePath, fileName);
    
    // Ensure directory exists
    await mkdir(dirname(filePath), { recursive: true });
    
    switch (format) {
      case 'json':
        const jsonData = await this.jsonExporter.export(events);
        await writeFile(filePath, jsonData.data);
        break;
        
      case 'csv':
        const csvData = await this.csvExporter.export(events);
        await writeFile(filePath, csvData.data);
        break;
        
      case 'otlp':
        const otlpData = await this.otlpExporter.export(events);
        await writeFile(filePath, otlpData.data);
        break;
        
      case 'parquet':
        return this.parquetExporter.exportToFile(events, filePath);
        
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
    
    return {
      success: true,
      format: format as ExportFormat,
      data: `Exported ${events.length} events to ${filePath}`,
      size: events.length,
      exportedAt: Date.now(),
    };
  }
  
  private async exportToHTTP(
    format: string,
    events: TelemetryEvent[],
    endpoint: string,
    headers: Record<string, string> = {}
  ): Promise<ExportResult> {
    let data: string;
    let contentType: string;
    
    switch (format) {
      case 'json':
        const jsonResult = await this.jsonExporter.export(events);
        data = jsonResult.data;
        contentType = 'application/json';
        break;
        
      case 'csv':
        const csvResult = await this.csvExporter.export(events);
        data = csvResult.data;
        contentType = 'text/csv';
        break;
        
      case 'otlp':
        return this.otlpExporter.exportToCollector(events, endpoint, headers);
        
      default:
        throw new Error(`HTTP export not supported for format: ${format}`);
    }
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
        'User-Agent': 'vibekit-telemetry-scheduler/1.0.0',
        ...headers,
      },
      body: data,
    });
    
    if (!response.ok) {
      throw new Error(`HTTP export failed: ${response.status} ${response.statusText}`);
    }
    
    return {
      success: true,
      format: format as ExportFormat,
      data: `Exported ${events.length} events to ${endpoint}`,
      size: events.length,
      exportedAt: Date.now(),
    };
  }
  
  private async exportToS3(
    format: string,
    events: TelemetryEvent[],
    destination: any,
    options: any
  ): Promise<ExportResult> {
    // This would require AWS SDK integration
    // For now, throw not implemented
    throw new Error('S3 export not implemented - requires AWS SDK integration');
  }
  
  private async exportToGCS(
    format: string,
    events: TelemetryEvent[],
    destination: any,
    options: any
  ): Promise<ExportResult> {
    // This would require Google Cloud SDK integration
    // For now, throw not implemented
    throw new Error('GCS export not implemented - requires Google Cloud SDK integration');
  }
  
  private async sendNotifications(webhooks: string[], payload: any): Promise<void> {
    const promises = webhooks.map(async (webhook) => {
      try {
        const response = await fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          console.warn(`Webhook notification failed: ${webhook} (${response.status})`);
        }
      } catch (error) {
        console.error(`Webhook notification error: ${webhook}`, error);
      }
    });
    
    await Promise.allSettled(promises);
  }
  
  private isValidCron(cron: string): boolean {
    // Basic cron validation (5 parts: minute hour day month dayOfWeek)
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    
    // Validate each part (simplified validation)
    const patterns = [
      /^(\*|([0-5]?\d)(,([0-5]?\d))*|([0-5]?\d)-([0-5]?\d))$/, // minute (0-59)
      /^(\*|([01]?\d|2[0-3])(,([01]?\d|2[0-3]))*|([01]?\d|2[0-3])-([01]?\d|2[0-3]))$/, // hour (0-23)
      /^(\*|([1-2]?\d|3[01])(,([1-2]?\d|3[01]))*|([1-2]?\d|3[01])-([1-2]?\d|3[01]))$/, // day (1-31)
      /^(\*|([1-9]|1[0-2])(,([1-9]|1[0-2]))*|([1-9]|1[0-2])-([1-9]|1[0-2]))$/, // month (1-12)
      /^(\*|[0-6](,[0-6])*|[0-6]-[0-6])$/, // dayOfWeek (0-6)
    ];
    
    return parts.every((part, index) => patterns[index].test(part));
  }
  
  private getNextExecutionTime(cron: string): number {
    // Simplified cron parser - in production, use a proper cron library
    const now = new Date();
    const parts = cron.split(' ');
    
    // For this implementation, we'll just handle simple cases
    // In production, use a library like node-cron or cron-parser
    
    if (cron === '0 0 * * *') { // Daily at midnight
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow.getTime();
    }
    
    if (cron === '0 * * * *') { // Every hour
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1);
      nextHour.setMinutes(0, 0, 0);
      return nextHour.getTime();
    }
    
    if (cron === '*/5 * * * *') { // Every 5 minutes
      const next = new Date(now);
      next.setMinutes(Math.ceil(next.getMinutes() / 5) * 5, 0, 0);
      return next.getTime();
    }
    
    // Default: execute in 1 hour
    return now.getTime() + 60 * 60 * 1000;
  }
  
  // Manual execution (for testing/immediate export)
  async executeNow(scheduleId: string): Promise<ScheduleExecution> {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }
    
    await this.executeSchedule(schedule);
    
    // Return the latest execution for this schedule
    const executions = this.getExecutionHistory(scheduleId);
    return executions[0];
  }
  
  // Cleanup old executions
  cleanupExecutions(maxAge: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - maxAge;
    
    for (const [id, execution] of this.executions.entries()) {
      if (execution.startTime < cutoff) {
        this.executions.delete(id);
      }
    }
  }
}