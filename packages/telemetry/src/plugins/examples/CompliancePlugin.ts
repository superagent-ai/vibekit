import type { Plugin, TelemetryEvent, QueryFilter, ExportResult } from '../../core/types.js';
import type { HookContext } from '../hooks/types.js';

/**
 * Example plugin that ensures compliance with data regulations
 */
export class CompliancePlugin implements Plugin {
  name = 'compliance-plugin';
  version = '1.0.0';
  description = 'Ensures compliance with GDPR, CCPA, and other data regulations';
  
  private consentStore = new Map<string, {
    consented: boolean;
    consentDate?: Date;
    preferences?: {
      analytics: boolean;
      marketing: boolean;
      performance: boolean;
    };
  }>();
  
  private auditLog: Array<{
    timestamp: Date;
    operation: string;
    userId?: string;
    details: any;
  }> = [];
  
  constructor(private options: {
    requireConsent?: boolean;
    auditQueries?: boolean;
    auditExports?: boolean;
    redactPII?: boolean;
    dataRetentionDays?: number;
  } = {}) {
    this.options = {
      requireConsent: true,
      auditQueries: true,
      auditExports: true,
      redactPII: true,
      dataRetentionDays: 90,
      ...options,
    };
  }
  
  async initialize(telemetry: any): Promise<void> {
    console.log(`${this.name} initialized with options:`, this.options);
  }
  
  async beforeTrack(event: TelemetryEvent): Promise<TelemetryEvent | null> {
    // Check user consent
    if (this.options.requireConsent && event.context?.userId) {
      const consent = this.consentStore.get(event.context.userId);
      if (!consent?.consented) {
        console.log(`Event blocked - no consent for user ${event.context.userId}`);
        return null; // Block event
      }
    }
    
    // Redact PII if configured
    if (this.options.redactPII) {
      return this.redactPII(event);
    }
    
    return event;
  }
  
  async beforeQuery(
    filter: QueryFilter,
    provider: string,
    context: HookContext
  ): Promise<QueryFilter> {
    // Audit query if configured
    if (this.options.auditQueries) {
      this.auditLog.push({
        timestamp: new Date(),
        operation: 'query',
        userId: filter.userId,
        details: { filter, provider },
      });
    }
    
    // Add data retention filter
    if (this.options.dataRetentionDays) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.options.dataRetentionDays);
      
      return {
        ...filter,
        startTime: Math.max(
          filter.startTime || 0,
          cutoffDate.getTime()
        ),
      };
    }
    
    return filter;
  }
  
  async afterQuery(
    results: TelemetryEvent[],
    filter: QueryFilter,
    provider: string,
    context: HookContext
  ): Promise<TelemetryEvent[]> {
    // Filter results based on user consent
    if (this.options.requireConsent) {
      return results.filter(event => {
        if (!event.context?.userId) return true;
        
        const consent = this.consentStore.get(event.context.userId);
        return consent?.consented === true;
      });
    }
    
    return results;
  }
  
  async beforeExport(
    events: TelemetryEvent[],
    format: string,
    options: any,
    context: HookContext
  ): Promise<TelemetryEvent[]> {
    // Audit export if configured
    if (this.options.auditExports) {
      this.auditLog.push({
        timestamp: new Date(),
        operation: 'export',
        details: {
          format,
          eventCount: events.length,
          options,
        },
      });
    }
    
    // Anonymize data for export
    return events.map(event => this.anonymizeEvent(event));
  }
  
  async onStorageError(
    error: Error,
    events: TelemetryEvent[],
    provider: string,
    context: HookContext
  ): Promise<void> {
    // Log compliance-related storage errors
    console.error('Compliance: Storage error detected', {
      error: error.message,
      eventCount: events.length,
      provider,
    });
    
    // Check if error is due to compliance
    if (error.message.includes('consent') || error.message.includes('privacy')) {
      this.auditLog.push({
        timestamp: new Date(),
        operation: 'storage_error',
        details: {
          error: error.message,
          eventCount: events.length,
        },
      });
    }
  }
  
  private redactPII(event: TelemetryEvent): TelemetryEvent {
    const redacted = { ...event };
    
    // Redact common PII patterns
    if (redacted.metadata) {
      redacted.metadata = this.redactObject(redacted.metadata);
    }
    
    if (redacted.context?.custom) {
      redacted.context = {
        ...redacted.context,
        custom: this.redactObject(redacted.context.custom),
      };
    }
    
    return redacted;
  }
  
  private redactObject(obj: any): any {
    const result: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.redactString(value);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.redactObject(value);
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
  
  private redactString(str: string): string {
    // Email pattern
    str = str.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
    
    // Phone pattern
    str = str.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');
    
    // SSN pattern
    str = str.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');
    
    // Credit card pattern
    str = str.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CREDIT_CARD]');
    
    return str;
  }
  
  private anonymizeEvent(event: TelemetryEvent): TelemetryEvent {
    const anonymized = { ...event };
    
    // Hash user ID
    if (anonymized.context?.userId) {
      anonymized.context.userId = this.hashUserId(anonymized.context.userId);
    }
    
    // Remove or hash other identifiers
    if (anonymized.metadata) {
      if (anonymized.metadata.ipAddress) {
        anonymized.metadata.ipAddress = this.anonymizeIP(anonymized.metadata.ipAddress);
      }
      
      if (anonymized.metadata.userAgent) {
        anonymized.metadata.userAgent = '[REDACTED]';
      }
    }
    
    return anonymized;
  }
  
  private hashUserId(userId: string): string {
    // Simple hash for demo - use proper hashing in production
    return `user_${Buffer.from(userId).toString('base64').substr(0, 8)}`;
  }
  
  private anonymizeIP(ip: string): string {
    // Keep first 3 octets, replace last with 0
    const parts = ip.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.0`;
    }
    return '[IP]';
  }
  
  // Custom hooks for compliance management
  hooks = {
    setUserConsent: (userId: string, consented: boolean, preferences?: any) => {
      this.consentStore.set(userId, {
        consented,
        consentDate: new Date(),
        preferences,
      });
    },
    
    getUserConsent: (userId: string) => {
      return this.consentStore.get(userId);
    },
    
    getAuditLog: (filter?: { startDate?: Date; endDate?: Date; operation?: string }) => {
      let logs = [...this.auditLog];
      
      if (filter?.startDate) {
        logs = logs.filter(log => log.timestamp >= filter.startDate!);
      }
      
      if (filter?.endDate) {
        logs = logs.filter(log => log.timestamp <= filter.endDate!);
      }
      
      if (filter?.operation) {
        logs = logs.filter(log => log.operation === filter.operation);
      }
      
      return logs;
    },
    
    clearOldData: async (days: number) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      
      // Clear old audit logs
      this.auditLog = this.auditLog.filter(log => log.timestamp > cutoffDate);
      
      console.log(`Cleared data older than ${days} days`);
    },
  };
  
  async shutdown(): Promise<void> {
    // Save audit log if needed
    console.log(`${this.name} shutdown - ${this.auditLog.length} audit entries recorded`);
  }
}