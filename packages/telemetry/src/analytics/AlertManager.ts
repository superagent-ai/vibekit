import type { 
  AnalyticsConfig,
  Metrics
} from '../core/types.js';
import type { Anomaly } from './AnomalyDetector.js';
import { createLogger } from '../utils/logger.js';

export interface Alert {
  id: string;
  type: 'anomaly' | 'threshold' | 'rate' | 'custom';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
  timestamp: number;
  triggered: boolean;
  triggeredAt?: number;
  resolvedAt?: number;
  metadata?: Record<string, any>;
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  condition: AlertCondition;
  severity: Alert['severity'];
  cooldown?: number; // Minimum time between alerts in ms
  actions?: AlertAction[];
}

export interface AlertCondition {
  type: 'threshold' | 'rate' | 'anomaly' | 'composite';
  metric?: string;
  operator?: '>' | '<' | '>=' | '<=' | '==' | '!=';
  value?: number;
  window?: number; // Time window in ms
  conditions?: AlertCondition[]; // For composite conditions
  logic?: 'AND' | 'OR'; // For composite conditions
}

export interface AlertAction {
  type: 'webhook' | 'email' | 'log' | 'custom';
  config: Record<string, any>;
}

export class AlertManager {
  private config: AnalyticsConfig;
  private logger = createLogger('AlertManager');
  private rules: Map<string, AlertRule> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private lastAlertTimes: Map<string, number> = new Map();
  private webhooks: string[] = [];
  
  constructor(config: AnalyticsConfig) {
    this.config = config;
    this.webhooks = config.alerts?.webhooks || [];
    this.initializeDefaultRules();
  }
  
  /**
   * Initialize default alert rules
   */
  private initializeDefaultRules(): void {
    // High error rate rule
    this.addRule({
      id: 'high-error-rate',
      name: 'High Error Rate',
      description: 'Triggers when error rate exceeds 10%',
      enabled: true,
      condition: {
        type: 'threshold',
        metric: 'performance.errorRate',
        operator: '>',
        value: 0.1,
      },
      severity: 'high',
      cooldown: 300000, // 5 minutes
    });
    
    // Session failure rate rule
    this.addRule({
      id: 'session-failures',
      name: 'High Session Failure Rate',
      description: 'Triggers when more sessions fail than complete',
      enabled: true,
      condition: {
        type: 'composite',
        logic: 'AND',
        conditions: [
          {
            type: 'threshold',
            metric: 'sessions.errored',
            operator: '>',
            value: 10,
          },
          {
            type: 'rate',
            metric: 'sessions.errored/sessions.completed',
            operator: '>',
            value: 1,
          },
        ],
      },
      severity: 'critical',
      cooldown: 600000, // 10 minutes
    });
    
    // Performance degradation rule
    this.addRule({
      id: 'performance-degradation',
      name: 'Performance Degradation',
      description: 'Triggers when average duration exceeds threshold',
      enabled: true,
      condition: {
        type: 'threshold',
        metric: 'performance.avgDuration',
        operator: '>',
        value: 10000, // 10 seconds
      },
      severity: 'medium',
      cooldown: 900000, // 15 minutes
    });
  }
  
  /**
   * Add or update an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }
  
  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }
  
  /**
   * Check metrics against alert rules
   */
  async checkMetrics(metrics: Metrics): Promise<Alert[]> {
    if (!this.config.enabled || !this.config.alerts?.enabled) {
      return [];
    }
    
    const triggeredAlerts: Alert[] = [];
    
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      
      // Check cooldown
      const lastAlertTime = this.lastAlertTimes.get(rule.id) || 0;
      if (rule.cooldown && Date.now() - lastAlertTime < rule.cooldown) {
        continue;
      }
      
      // Evaluate condition
      const triggered = this.evaluateCondition(rule.condition, metrics);
      
      if (triggered) {
        const alert = this.createAlert(rule, metrics);
        this.alerts.set(alert.id, alert);
        this.lastAlertTimes.set(rule.id, Date.now());
        triggeredAlerts.push(alert);
        
        // Execute actions
        await this.executeActions(alert, rule.actions || []);
      }
    }
    
    return triggeredAlerts;
  }
  
  /**
   * Check for anomaly-based alerts
   */
  async checkAnomaly(anomaly: Anomaly): Promise<Alert[]> {
    if (!this.config.enabled || !this.config.alerts?.enabled) {
      return [];
    }
    
    const triggeredAlerts: Alert[] = [];
    
    // Check anomaly against rules
    for (const rule of this.rules.values()) {
      if (!rule.enabled || rule.condition.type !== 'anomaly') continue;
      
      // Check if anomaly matches rule criteria
      if (
        (!rule.condition.metric || anomaly.metric.includes(rule.condition.metric)) &&
        anomaly.severity === rule.severity
      ) {
        const alert: Alert = {
          id: `anomaly-${anomaly.id}`,
          type: 'anomaly',
          severity: anomaly.severity,
          title: `Anomaly Alert: ${anomaly.metric}`,
          message: anomaly.message,
          metric: anomaly.metric,
          value: anomaly.value,
          threshold: anomaly.baseline,
          timestamp: anomaly.timestamp,
          triggered: true,
          triggeredAt: Date.now(),
          metadata: {
            anomaly,
            rule: rule.id,
          },
        };
        
        this.alerts.set(alert.id, alert);
        triggeredAlerts.push(alert);
        
        // Execute actions
        await this.executeActions(alert, rule.actions || []);
      }
    }
    
    return triggeredAlerts;
  }
  
  /**
   * Evaluate an alert condition
   */
  private evaluateCondition(condition: AlertCondition, metrics: Metrics): boolean {
    switch (condition.type) {
      case 'threshold':
        return this.evaluateThresholdCondition(condition, metrics);
      
      case 'rate':
        return this.evaluateRateCondition(condition, metrics);
      
      case 'composite':
        return this.evaluateCompositeCondition(condition, metrics);
      
      case 'anomaly':
        // Anomaly conditions are handled separately
        return false;
      
      default:
        return false;
    }
  }
  
  /**
   * Evaluate a threshold condition
   */
  private evaluateThresholdCondition(condition: AlertCondition, metrics: Metrics): boolean {
    if (!condition.metric || condition.value === undefined || !condition.operator) {
      return false;
    }
    
    const value = this.getMetricValue(condition.metric, metrics);
    if (value === null) return false;
    
    switch (condition.operator) {
      case '>': return value > condition.value;
      case '<': return value < condition.value;
      case '>=': return value >= condition.value;
      case '<=': return value <= condition.value;
      case '==': return value === condition.value;
      case '!=': return value !== condition.value;
      default: return false;
    }
  }
  
  /**
   * Evaluate a rate condition
   */
  private evaluateRateCondition(condition: AlertCondition, metrics: Metrics): boolean {
    if (!condition.metric || condition.value === undefined || !condition.operator) {
      return false;
    }
    
    // Parse rate metric (e.g., "errors/events")
    const [numerator, denominator] = condition.metric.split('/');
    const numValue = this.getMetricValue(numerator, metrics);
    const denomValue = this.getMetricValue(denominator, metrics);
    
    if (numValue === null || denomValue === null || denomValue === 0) {
      return false;
    }
    
    const rate = numValue / denomValue;
    
    switch (condition.operator) {
      case '>': return rate > condition.value;
      case '<': return rate < condition.value;
      case '>=': return rate >= condition.value;
      case '<=': return rate <= condition.value;
      case '==': return rate === condition.value;
      case '!=': return rate !== condition.value;
      default: return false;
    }
  }
  
  /**
   * Evaluate a composite condition
   */
  private evaluateCompositeCondition(condition: AlertCondition, metrics: Metrics): boolean {
    if (!condition.conditions || condition.conditions.length === 0) {
      return false;
    }
    
    const results = condition.conditions.map(c => this.evaluateCondition(c, metrics));
    
    if (condition.logic === 'AND') {
      return results.every(r => r);
    } else {
      return results.some(r => r);
    }
  }
  
  /**
   * Get metric value from metrics object
   */
  private getMetricValue(metricPath: string, metrics: Metrics): number | null {
    const parts = metricPath.split('.');
    let value: any = metrics;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return null;
      }
    }
    
    return typeof value === 'number' ? value : null;
  }
  
  /**
   * Create an alert from a rule
   */
  private createAlert(rule: AlertRule, metrics: Metrics): Alert {
    const metric = rule.condition.metric;
    const value = metric ? this.getMetricValue(metric, metrics) : undefined;
    
    return {
      id: `${rule.id}-${Date.now()}`,
      type: 'threshold',
      severity: rule.severity,
      title: rule.name,
      message: rule.description || `Alert triggered for ${rule.name}`,
      metric,
      value: value ?? undefined,
      threshold: rule.condition.value,
      timestamp: Date.now(),
      triggered: true,
      triggeredAt: Date.now(),
      metadata: {
        rule: rule.id,
        metrics,
      },
    };
  }
  
  /**
   * Execute alert actions
   */
  private async executeActions(alert: Alert, actions: AlertAction[]): Promise<void> {
    for (const action of actions) {
      try {
        switch (action.type) {
          case 'webhook':
            await this.sendWebhook(alert, action.config.url || this.webhooks[0]);
            break;
          
          case 'log':
            this.logger.info(`[ALERT] ${alert.severity.toUpperCase()}: ${alert.title} - ${alert.message}`);
            break;
          
          case 'email':
            // Email implementation would go here
            this.logger.info(`[ALERT] Would send email: ${alert.title}`);
            break;
          
          case 'custom':
            if (action.config.handler && typeof action.config.handler === 'function') {
              await action.config.handler(alert);
            }
            break;
        }
      } catch (error) {
        this.logger.error(`Failed to execute alert action ${action.type}:`, error);
      }
    }
    
    // Send to configured webhooks
    if (this.webhooks.length > 0 && !actions.some(a => a.type === 'webhook')) {
      for (const webhook of this.webhooks) {
        await this.sendWebhook(alert, webhook);
      }
    }
  }
  
  /**
   * Send alert to webhook
   */
  private async sendWebhook(alert: Alert, webhookUrl: string): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          alert,
          timestamp: Date.now(),
          source: 'vibekit-telemetry',
        }),
      });
      
      if (!response.ok) {
        this.logger.error(`Webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error('Failed to send webhook:', error);
    }
  }
  
  /**
   * Get all alerts
   */
  getAlerts(options?: {
    severity?: Alert['severity'][];
    triggered?: boolean;
    resolved?: boolean;
    limit?: number;
  }): Alert[] {
    let alerts = Array.from(this.alerts.values());
    
    if (options?.severity) {
      alerts = alerts.filter(a => options.severity!.includes(a.severity));
    }
    
    if (options?.triggered !== undefined) {
      alerts = alerts.filter(a => a.triggered === options.triggered);
    }
    
    if (options?.resolved !== undefined) {
      alerts = alerts.filter(a => (a.resolvedAt !== undefined) === options.resolved);
    }
    
    // Sort by timestamp descending
    alerts.sort((a, b) => b.timestamp - a.timestamp);
    
    if (options?.limit) {
      alerts = alerts.slice(0, options.limit);
    }
    
    return alerts;
  }
  
  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert && !alert.resolvedAt) {
      alert.resolvedAt = Date.now();
    }
  }
  
  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    this.rules.clear();
    this.alerts.clear();
    this.lastAlertTimes.clear();
  }
}