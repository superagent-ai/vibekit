import type { TelemetryError } from './ErrorHandler.js';

export interface AlertChannel {
  name: string;
  type: 'slack' | 'pagerduty' | 'email' | 'webhook' | 'custom';
  config: Record<string, any>;
  severities: Array<'low' | 'medium' | 'high' | 'critical'>;
  enabled: boolean;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  condition: AlertCondition;
  channels: string[]; // Channel names
  cooldown?: number; // Minimum time between alerts in ms
  metadata?: Record<string, any>;
}

export interface AlertCondition {
  type: 'error_count' | 'error_rate' | 'circuit_breaker' | 'custom';
  threshold: number;
  window?: number; // Time window in ms
  severity?: string;
  pattern?: RegExp;
}

export interface Alert {
  id: string;
  ruleId: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  data: Record<string, any>;
  channels: string[];
}

export class AlertingService {
  private channels = new Map<string, AlertChannel>();
  private rules = new Map<string, AlertRule>();
  private alerts: Alert[] = [];
  private lastAlertTimes = new Map<string, number>();
  private alertHandlers = new Map<string, (alert: Alert) => Promise<void>>();
  
  constructor() {
    this.setupDefaultHandlers();
  }
  
  private setupDefaultHandlers(): void {
    // Slack handler
    this.alertHandlers.set('slack', async (alert: Alert) => {
      const channel = this.channels.get(alert.channels[0]);
      if (!channel || channel.type !== 'slack') return;
      
      const webhookUrl = channel.config.webhookUrl;
      if (!webhookUrl) {
        console.error('Slack webhook URL not configured');
        return;
      }
      
      const color = this.getSeverityColor(alert.severity);
      const payload = {
        attachments: [{
          color,
          title: alert.title,
          text: alert.message,
          fields: Object.entries(alert.data).map(([key, value]) => ({
            title: key,
            value: String(value),
            short: true,
          })),
          timestamp: Math.floor(alert.timestamp / 1000),
          footer: 'VibeKit Telemetry',
        }],
      };
      
      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          console.error('Failed to send Slack alert:', response.statusText);
        }
      } catch (error) {
        console.error('Error sending Slack alert:', error);
      }
    });
    
    // PagerDuty handler
    this.alertHandlers.set('pagerduty', async (alert: Alert) => {
      const channel = this.channels.get(alert.channels[0]);
      if (!channel || channel.type !== 'pagerduty') return;
      
      const { integrationKey, routingKey } = channel.config;
      if (!integrationKey) {
        console.error('PagerDuty integration key not configured');
        return;
      }
      
      const severity = this.mapSeverityToPagerDuty(alert.severity);
      const payload = {
        routing_key: routingKey || integrationKey,
        event_action: 'trigger',
        dedup_key: alert.id,
        payload: {
          summary: alert.message,
          source: 'vibekit-telemetry',
          severity,
          timestamp: new Date(alert.timestamp).toISOString(),
          custom_details: alert.data,
        },
      };
      
      try {
        const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.pagerduty+json;version=2',
          },
          body: JSON.stringify(payload),
        });
        
        if (!response.ok) {
          console.error('Failed to send PagerDuty alert:', response.statusText);
        }
      } catch (error) {
        console.error('Error sending PagerDuty alert:', error);
      }
    });
    
    // Webhook handler
    this.alertHandlers.set('webhook', async (alert: Alert) => {
      const channel = this.channels.get(alert.channels[0]);
      if (!channel || channel.type !== 'webhook') return;
      
      const { url, headers = {}, method = 'POST' } = channel.config;
      if (!url) {
        console.error('Webhook URL not configured');
        return;
      }
      
      try {
        const response = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: JSON.stringify({
            alert,
            timestamp: new Date(alert.timestamp).toISOString(),
            source: 'vibekit-telemetry',
          }),
        });
        
        if (!response.ok) {
          console.error('Failed to send webhook alert:', response.statusText);
        }
      } catch (error) {
        console.error('Error sending webhook alert:', error);
      }
    });
    
    // Email handler (placeholder - would need SMTP config)
    this.alertHandlers.set('email', async (alert: Alert) => {
      const channel = this.channels.get(alert.channels[0]);
      if (!channel || channel.type !== 'email') return;
      
      console.log('Email alerting not yet implemented. Would send to:', channel.config.recipients);
      console.log('Alert:', alert);
    });
  }
  
  addChannel(name: string, channel: AlertChannel): void {
    this.channels.set(name, channel);
  }
  
  removeChannel(name: string): void {
    this.channels.delete(name);
  }
  
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }
  
  removeRule(id: string): void {
    this.rules.delete(id);
  }
  
  async checkRules(context: {
    errors?: TelemetryError[];
    circuitBreakerStates?: Record<string, any>;
    rateLimiterStats?: any;
    customMetrics?: Record<string, number>;
  }): Promise<Alert[]> {
    const triggeredAlerts: Alert[] = [];
    
    for (const rule of this.rules.values()) {
      // Check cooldown
      const lastAlertTime = this.lastAlertTimes.get(rule.id) || 0;
      if (rule.cooldown && Date.now() - lastAlertTime < rule.cooldown) {
        continue;
      }
      
      // Evaluate condition
      const shouldAlert = this.evaluateCondition(rule.condition, context);
      
      if (shouldAlert) {
        const alert = this.createAlert(rule, context);
        triggeredAlerts.push(alert);
        this.alerts.push(alert);
        this.lastAlertTimes.set(rule.id, Date.now());
        
        // Send to channels
        await this.sendAlert(alert);
      }
    }
    
    // Clean old alerts (keep last 1000)
    if (this.alerts.length > 1000) {
      this.alerts = this.alerts.slice(-1000);
    }
    
    return triggeredAlerts;
  }
  
  private evaluateCondition(condition: AlertCondition, context: any): boolean {
    switch (condition.type) {
      case 'error_count':
        if (!context.errors) return false;
        const recentErrors = context.errors.filter((e: TelemetryError) => 
          Date.now() - e.timestamp < (condition.window || 300000) // 5 min default
        );
        return recentErrors.length >= condition.threshold;
      
      case 'error_rate':
        if (!context.errors) return false;
        const windowErrors = context.errors.filter((e: TelemetryError) =>
          Date.now() - e.timestamp < (condition.window || 300000)
        );
        const errorRate = windowErrors.length / ((condition.window || 300000) / 1000); // errors per second
        return errorRate >= condition.threshold;
      
      case 'circuit_breaker':
        if (!context.circuitBreakerStates) return false;
        const openCircuits = Object.values(context.circuitBreakerStates)
          .filter((state: any) => state.state === 'open').length;
        return openCircuits >= condition.threshold;
      
      case 'custom':
        if (!context.customMetrics) return false;
        // Custom logic would go here
        return false;
      
      default:
        return false;
    }
  }
  
  private createAlert(rule: AlertRule, context: any): Alert {
    const severity = this.determineSeverity(rule, context);
    
    return {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      title: `Alert: ${rule.name}`,
      message: this.buildAlertMessage(rule, context),
      severity,
      timestamp: Date.now(),
      data: {
        rule: rule.name,
        condition: rule.condition,
        context: this.sanitizeContext(context),
      },
      channels: rule.channels,
    };
  }
  
  private determineSeverity(rule: AlertRule, context: any): Alert['severity'] {
    // Logic to determine severity based on rule and context
    if (rule.condition.type === 'circuit_breaker') {
      const openCircuits = Object.values(context.circuitBreakerStates || {})
        .filter((state: any) => state.state === 'open').length;
      if (openCircuits > 5) return 'critical';
      if (openCircuits > 2) return 'high';
      return 'medium';
    }
    
    if (rule.condition.type === 'error_count' || rule.condition.type === 'error_rate') {
      const errors = context.errors || [];
      const criticalErrors = errors.filter((e: TelemetryError) => e.severity === 'critical').length;
      if (criticalErrors > 0) return 'critical';
      
      const highErrors = errors.filter((e: TelemetryError) => e.severity === 'high').length;
      if (highErrors > 5) return 'high';
      
      return 'medium';
    }
    
    return 'medium';
  }
  
  private buildAlertMessage(rule: AlertRule, context: any): string {
    let message = rule.description || `Rule ${rule.name} triggered`;
    
    if (rule.condition.type === 'error_count') {
      const errorCount = context.errors?.length || 0;
      message += ` - ${errorCount} errors in the last ${(rule.condition.window || 300000) / 60000} minutes`;
    } else if (rule.condition.type === 'circuit_breaker') {
      const openCircuits = Object.entries(context.circuitBreakerStates || {})
        .filter(([_, state]: [string, any]) => state.state === 'open')
        .map(([key]) => key);
      message += ` - Open circuits: ${openCircuits.join(', ')}`;
    }
    
    return message;
  }
  
  private sanitizeContext(context: any): any {
    // Remove sensitive data and reduce size
    const sanitized: any = {};
    
    if (context.errors) {
      sanitized.errorCount = context.errors.length;
      sanitized.errorSeverities = context.errors.reduce((acc: any, e: TelemetryError) => {
        acc[e.severity] = (acc[e.severity] || 0) + 1;
        return acc;
      }, {});
    }
    
    if (context.circuitBreakerStates) {
      sanitized.circuitBreakers = Object.entries(context.circuitBreakerStates)
        .map(([key, state]: [string, any]) => ({
          key,
          state: state.state,
          failures: state.failures,
        }));
    }
    
    return sanitized;
  }
  
  private async sendAlert(alert: Alert): Promise<void> {
    for (const channelName of alert.channels) {
      const channel = this.channels.get(channelName);
      if (!channel || !channel.enabled) continue;
      
      // Check if alert severity matches channel configuration
      if (!channel.severities.includes(alert.severity)) continue;
      
      const handler = this.alertHandlers.get(channel.type);
      if (handler) {
        try {
          await handler(alert);
        } catch (error) {
          console.error(`Failed to send alert to ${channel.type} channel ${channelName}:`, error);
        }
      } else if (channel.type === 'custom' && channel.config.handler) {
        try {
          await channel.config.handler(alert);
        } catch (error) {
          console.error(`Failed to send alert to custom channel ${channelName}:`, error);
        }
      }
    }
  }
  
  private getSeverityColor(severity: Alert['severity']): string {
    switch (severity) {
      case 'critical': return '#FF0000';
      case 'high': return '#FF8C00';
      case 'medium': return '#FFD700';
      case 'low': return '#90EE90';
    }
  }
  
  private mapSeverityToPagerDuty(severity: Alert['severity']): string {
    switch (severity) {
      case 'critical': return 'critical';
      case 'high': return 'error';
      case 'medium': return 'warning';
      case 'low': return 'info';
    }
  }
  
  getAlerts(options?: {
    ruleId?: string;
    severity?: Alert['severity'][];
    since?: number;
    limit?: number;
  }): Alert[] {
    let filtered = [...this.alerts];
    
    if (options?.ruleId) {
      filtered = filtered.filter(a => a.ruleId === options.ruleId);
    }
    
    if (options?.severity) {
      filtered = filtered.filter(a => options.severity!.includes(a.severity));
    }
    
    if (options?.since) {
      const since = Date.now() - (options.since ?? 300000);
      filtered = filtered.filter(a => a.timestamp >= since);
    }
    
    // Sort by timestamp descending
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    
    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }
    
    return filtered;
  }
  
  getChannels(): AlertChannel[] {
    return Array.from(this.channels.values());
  }
  
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }
  
  registerCustomHandler(type: string, handler: (alert: Alert) => Promise<void>): void {
    this.alertHandlers.set(type, handler);
  }
  
  getAlertHistory(duration?: number): Alert[] {
    const cutoff = duration ? Date.now() - duration : 0;
    return this.alerts
      .filter(alert => !duration || alert.timestamp >= cutoff)
      .sort((a, b) => b.timestamp - a.timestamp);
  }
  
  shutdown(): void {
    this.channels.clear();
    this.rules.clear();
    this.alerts = [];
    this.lastAlertTimes.clear();
  }
}