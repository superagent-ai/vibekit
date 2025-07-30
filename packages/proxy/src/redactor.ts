import fastRedact from 'fast-redact'
import { RedactionRule, RedactionMetrics, AuditLogEntry } from './types.js'

export class SecretRedactor {
  private redactFn: any
  private rules: RedactionRule[] = []
  private metrics: RedactionMetrics = {
    totalRedactions: 0,
    redactionsByType: {}
  }
  private auditLog: AuditLogEntry[] = []
  private readonly REDACTED_VALUE = '[REDACTED]'

  constructor(rules: RedactionRule[] = []) {
    this.updateRules(rules)
  }

  updateRules(rules: RedactionRule[]): void {
    this.rules = rules
    this.buildRedactor()
  }

  private buildRedactor(): void {
    const paths: string[] = []
    
    // Add environment variable patterns
    for (const rule of this.rules) {
      if (rule.type === 'env_var') {
        // Convert wildcard patterns to paths for fast-redact
        if (rule.value.includes('*')) {
          // For patterns like "AWS_*", we'll handle these in custom logic
          continue
        } else {
          // For exact matches, add to paths
          paths.push(rule.value)
        }
      }
    }

    this.redactFn = fastRedact({
      paths,
      censor: this.REDACTED_VALUE,
      serialize: false
    })
  }

  redact(data: any, responseId?: string): any {
    if (!data) return data

    let redactedData = data
    let hasRedactions = false

    // Handle string data (for streaming)
    if (typeof data === 'string') {
      redactedData = this.redactString(data, responseId)
      hasRedactions = redactedData !== data
    } else if (typeof data === 'object') {
      // Deep clone to avoid mutations
      redactedData = JSON.parse(JSON.stringify(data))
      
      // Apply fast-redact for known paths
      redactedData = this.redactFn(redactedData)
      
      // Apply custom redaction logic
      redactedData = this.redactObjectRecursive(redactedData, responseId)
      
      hasRedactions = JSON.stringify(redactedData) !== JSON.stringify(data)
    }

    if (hasRedactions) {
      this.updateMetrics()
    }

    return redactedData
  }

  private redactString(text: string, responseId?: string): string {
    let redactedText = text
    
    for (const rule of this.rules) {
      if (rule.type === 'pattern' && rule.regex) {
        const matches = text.match(rule.regex)
        if (matches) {
          redactedText = redactedText.replace(rule.regex, this.REDACTED_VALUE)
          this.logRedaction(rule.name, responseId, 'pattern')
        }
      } else if (rule.type === 'env_var') {
        const envValue = process.env[rule.value]
        if (envValue && text.includes(envValue)) {
          redactedText = redactedText.replaceAll(envValue, this.REDACTED_VALUE)
          this.logRedaction(rule.value, responseId, 'env_var')
        }
        
        // Handle wildcard patterns
        if (rule.value.includes('*')) {
          const pattern = rule.value.replace('*', '.*')
          const envRegex = new RegExp(`^${pattern}$`)
          
          for (const [key, value] of Object.entries(process.env)) {
            if (envRegex.test(key) && value && text.includes(value)) {
              redactedText = redactedText.replaceAll(value, this.REDACTED_VALUE)
              this.logRedaction(key, responseId, 'env_var')
            }
          }
        }
      }
    }
    
    return redactedText
  }

  private redactObjectRecursive(obj: any, responseId?: string): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.redactObjectRecursive(item, responseId))
    }

    const result = { ...obj }
    
    for (const [key, value] of Object.entries(result)) {
      if (typeof value === 'string') {
        result[key] = this.redactString(value, responseId)
      } else if (typeof value === 'object') {
        result[key] = this.redactObjectRecursive(value, responseId)
      }
    }

    return result
  }

  private logRedaction(secretName: string, responseId: string | undefined, type: 'env_var' | 'pattern'): void {
    const entry: AuditLogEntry = {
      timestamp: new Date(),
      secretKeyName: secretName,
      responseId: responseId || 'unknown',
      redactionType: type
    }
    
    this.auditLog.push(entry)
    
    // Keep only last 1000 entries to prevent memory issues
    if (this.auditLog.length > 1000) {
      this.auditLog.shift()
    }
  }

  private updateMetrics(): void {
    this.metrics.totalRedactions++
    this.metrics.lastRedactionTime = new Date()
  }

  getMetrics(): RedactionMetrics {
    return { ...this.metrics }
  }

  getRecentRedactions(minutes = 5): AuditLogEntry[] {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000)
    return this.auditLog.filter(entry => entry.timestamp >= cutoff)
  }

  getAuditLog(): AuditLogEntry[] {
    return [...this.auditLog]
  }
}