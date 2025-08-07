export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

export interface Logger {
  debug(message: string, context?: Record<string, any>): void;
  info(message: string, context?: Record<string, any>): void;
  warn(message: string, context?: Record<string, any>): void;
  error(message: string, error?: Error, context?: Record<string, any>): void;
}

export class ConsoleLogger implements Logger {
  constructor(
    private serviceName: string,
    private minLevel: LogLevel = LogLevel.INFO
  ) {}
  
  private log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error) {
    if (level < this.minLevel) {
      return;
    }
    
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: `[${this.serviceName}] ${message}`,
      context,
      error,
    };
    
    const logData = {
      ...entry,
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : undefined,
    };
    
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(JSON.stringify(logData));
        break;
      case LogLevel.INFO:
        console.info(JSON.stringify(logData));
        break;
      case LogLevel.WARN:
        console.warn(JSON.stringify(logData));
        break;
      case LogLevel.ERROR:
        console.error(JSON.stringify(logData));
        break;
    }
  }
  
  debug(message: string, context?: Record<string, any>) {
    this.log(LogLevel.DEBUG, message, context);
  }
  
  info(message: string, context?: Record<string, any>) {
    this.log(LogLevel.INFO, message, context);
  }
  
  warn(message: string, context?: Record<string, any>) {
    this.log(LogLevel.WARN, message, context);
  }
  
  error(message: string, error?: Error, context?: Record<string, any>) {
    this.log(LogLevel.ERROR, message, context, error);
  }
}

// Metrics collector for monitoring
export class MetricsCollector {
  private metrics: Map<string, number[]> = new Map();
  
  recordLatency(operation: string, durationMs: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    
    const values = this.metrics.get(operation)!;
    values.push(durationMs);
    
    // Keep only last 1000 values
    if (values.length > 1000) {
      values.shift();
    }
  }
  
  increment(metric: string, value: number = 1) {
    const current = this.metrics.get(metric) || [0];
    current[0] += value;
    this.metrics.set(metric, current);
  }
  
  getStats(operation: string): {
    count: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.metrics.get(operation);
    if (!values || values.length === 0) {
      return null;
    }
    
    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const mean = sorted.reduce((a, b) => a + b, 0) / count;
    
    return {
      count,
      mean,
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }
  
  getAllMetrics(): Record<string, any> {
    const result: Record<string, any> = {};
    
    for (const [key, values] of this.metrics.entries()) {
      if (values.length === 1) {
        // Counter metric
        result[key] = values[0];
      } else {
        // Latency metric
        result[key] = this.getStats(key);
      }
    }
    
    return result;
  }
}