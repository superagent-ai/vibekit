export interface RedactionRule {
  name: string
  type: 'env_var' | 'pattern'
  value: string
  regex?: RegExp
}

export interface RedactionConfig {
  secrets: {
    env_vars: string[]
    patterns: Array<{
      name: string
      regex: string
    }>
  }
}

export interface ProxyConfig {
  configPath: string
  target: string
  port?: number
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
}

export interface RedactionMetrics {
  totalRedactions: number
  redactionsByType: Record<string, number>
  lastRedactionTime?: Date
}

export interface AuditLogEntry {
  timestamp: Date
  secretKeyName: string
  responseId: string
  redactionType: 'env_var' | 'pattern'
}