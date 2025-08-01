export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export interface LoggerConfig {
  level: LogLevel;
  prefix?: string;
  timestamp?: boolean;
}

class Logger {
  private config: LoggerConfig;
  
  constructor(config: Partial<LoggerConfig> = {}) {
    this.config = {
      level: this.getLogLevelFromEnv(),
      timestamp: true,
      ...config
    };
  }
  
  private getLogLevelFromEnv(): LogLevel {
    const envLevel = process.env.TELEMETRY_LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'ERROR': return LogLevel.ERROR;
      case 'WARN': return LogLevel.WARN;
      case 'INFO': return LogLevel.INFO;
      case 'DEBUG': return LogLevel.DEBUG;
      default: return process.env.NODE_ENV === 'production' ? LogLevel.WARN : LogLevel.INFO;
    }
  }
  
  private formatMessage(level: string, message: string): string {
    const parts: string[] = [];
    
    if (this.config.timestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }
    
    if (this.config.prefix) {
      parts.push(`[${this.config.prefix}]`);
    }
    
    parts.push(`[${level}]`);
    parts.push(message);
    
    return parts.join(' ');
  }
  
  error(message: string, ...args: any[]): void {
    if (this.config.level >= LogLevel.ERROR) {
      console.error(this.formatMessage('ERROR', message), ...args);
    }
  }
  
  warn(message: string, ...args: any[]): void {
    if (this.config.level >= LogLevel.WARN) {
      console.warn(this.formatMessage('WARN', message), ...args);
    }
  }
  
  info(message: string, ...args: any[]): void {
    if (this.config.level >= LogLevel.INFO) {
      console.info(this.formatMessage('INFO', message), ...args);
    }
  }
  
  debug(message: string, ...args: any[]): void {
    if (this.config.level >= LogLevel.DEBUG) {
      console.debug(this.formatMessage('DEBUG', message), ...args);
    }
  }
  
  // Create a child logger with additional prefix
  child(prefix: string): Logger {
    return new Logger({
      ...this.config,
      prefix: this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix
    });
  }
}

// Export singleton instance
export const logger = new Logger();

// Export factory for creating component-specific loggers
export function createLogger(prefix: string): Logger {
  return logger.child(prefix);
}