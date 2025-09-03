/**
 * Log sanitization utility for removing sensitive data from logs
 * 
 * This module provides comprehensive sanitization of log data to prevent
 * accidental exposure of sensitive information like API keys, tokens, and passwords.
 */

/**
 * Patterns for detecting sensitive data
 */
const SENSITIVE_PATTERNS = [
  // API Keys and Tokens
  { pattern: /sk-ant-[a-zA-Z0-9_-]+/gi, name: 'anthropic_api_key' },
  { pattern: /sk-[a-zA-Z0-9_-]{20,}/gi, name: 'openai_api_key' },
  { pattern: /gsk_[a-zA-Z0-9_-]+/gi, name: 'groq_api_key' },
  { pattern: /AIza[a-zA-Z0-9_-]{35}/gi, name: 'google_api_key' },
  { pattern: /xoxb-[a-zA-Z0-9_-]+/gi, name: 'slack_bot_token' },
  { pattern: /xoxp-[a-zA-Z0-9_-]+/gi, name: 'slack_user_token' },
  
  // OAuth and Bearer tokens
  { pattern: /Bearer\s+[a-zA-Z0-9_.-]+/gi, name: 'bearer_token' },
  { pattern: /token["\s:=]+[a-zA-Z0-9_.-]+/gi, name: 'generic_token' },
  { pattern: /oauth["\s:=]+[a-zA-Z0-9_.-]+/gi, name: 'oauth_token' },
  
  // Passwords and secrets
  { pattern: /password["\s:=]+[^,}\s"']+/gi, name: 'password' },
  { pattern: /secret["\s:=]+[^,}\s"']+/gi, name: 'secret' },
  { pattern: /key["\s:=]+[^,}\s"']+/gi, name: 'key' },
  
  // Database connection strings
  { pattern: /mongodb:\/\/[^,}\s"']+/gi, name: 'mongodb_uri' },
  { pattern: /postgres:\/\/[^,}\s"']+/gi, name: 'postgres_uri' },
  { pattern: /mysql:\/\/[^,}\s"']+/gi, name: 'mysql_uri' },
  
  // AWS credentials
  { pattern: /AKIA[0-9A-Z]{16}/gi, name: 'aws_access_key' },
  { pattern: /aws_secret_access_key["\s:=]+[^,}\s"']+/gi, name: 'aws_secret' },
  
  // GitHub tokens
  { pattern: /ghp_[a-zA-Z0-9]{36}/gi, name: 'github_pat' },
  { pattern: /gho_[a-zA-Z0-9]{36}/gi, name: 'github_oauth' },
  { pattern: /ghu_[a-zA-Z0-9]{36}/gi, name: 'github_user' },
  
  // Email addresses (optional, can be disabled)
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, name: 'email', optional: true },
  
  // IP addresses (optional, can be disabled)  
  { pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/gi, name: 'ip_address', optional: true },
  
  // File paths that might contain sensitive info
  { pattern: /\/[^,}\s"']*\.env[^,}\s"']*/gi, name: 'env_file_path' },
  { pattern: /\/[^,}\s"']*\.key[^,}\s"']*/gi, name: 'key_file_path' },
  { pattern: /\/[^,}\s"']*\.pem[^,}\s"']*/gi, name: 'pem_file_path' },
];

/**
 * Sensitive field names that should be redacted
 */
const SENSITIVE_FIELD_NAMES = [
  'password', 'pwd', 'pass', 'secret', 'token', 'key', 'auth', 'authorization',
  'apikey', 'api_key', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
  'oauth', 'bearer', 'credential', 'credentials', 'privatekey', 'private_key',
  'publickey', 'public_key', 'certificate', 'cert', 'signature', 'hash'
];

/**
 * Sanitization options
 */
export interface SanitizeOptions {
  redactEmails?: boolean;
  redactIPs?: boolean;
  maxStringLength?: number;
  placeholder?: string;
  preserveLength?: boolean;
}

/**
 * Default sanitization options
 */
const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  redactEmails: false,  // Don't redact emails by default
  redactIPs: false,     // Don't redact IPs by default
  maxStringLength: 1000,
  placeholder: '[REDACTED]',
  preserveLength: false
};

/**
 * Sanitize a string by removing sensitive patterns
 */
export function sanitizeString(input: string, options: SanitizeOptions = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let sanitized = input;
  
  // Apply sensitive patterns
  for (const { pattern, name, optional } of SENSITIVE_PATTERNS) {
    // Skip optional patterns based on options
    if (optional && name === 'email' && !opts.redactEmails) continue;
    if (optional && name === 'ip_address' && !opts.redactIPs) continue;
    
    sanitized = sanitized.replace(pattern, (match) => {
      if (opts.preserveLength) {
        return '*'.repeat(match.length);
      }
      return opts.placeholder;
    });
  }
  
  // Truncate if too long
  if (sanitized.length > opts.maxStringLength) {
    sanitized = sanitized.substring(0, opts.maxStringLength) + '...[TRUNCATED]';
  }
  
  return sanitized;
}

/**
 * Check if a field name is sensitive
 */
function isSensitiveField(fieldName: string): boolean {
  const lowerField = fieldName.toLowerCase();
  return SENSITIVE_FIELD_NAMES.some(sensitive => 
    lowerField.includes(sensitive)
  );
}

/**
 * Sanitize an object recursively
 */
export function sanitizeObject(obj: any, options: SanitizeOptions = {}, depth = 0): any {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Prevent infinite recursion
  if (depth > 10) {
    return '[MAX_DEPTH_REACHED]';
  }
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj, opts);
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return obj;
  }
  
  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: sanitizeString(obj.message, opts),
      stack: opts.redactIPs ? sanitizeString(obj.stack || '', opts) : obj.stack
    };
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, opts, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Check if field name is sensitive
      if (isSensitiveField(key)) {
        sanitized[key] = opts.placeholder;
      } else {
        sanitized[key] = sanitizeObject(value, opts, depth + 1);
      }
    }
    
    return sanitized;
  }
  
  // For unknown types, convert to string and sanitize
  return sanitizeString(String(obj), opts);
}

/**
 * Main sanitization function that handles any input type
 */
export function sanitizeLogData(data: any, options: SanitizeOptions = {}): any {
  try {
    return sanitizeObject(data, options);
  } catch (error) {
    // If sanitization fails, return a safe fallback
    return {
      _sanitization_error: 'Failed to sanitize log data',
      _original_type: typeof data,
      _error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Quick sanitize for simple string messages
 */
export function sanitizeMessage(message: string, options: SanitizeOptions = {}): string {
  return sanitizeString(message, options);
}

/**
 * Check if data contains sensitive information (without sanitizing)
 */
export function containsSensitiveData(data: any): boolean {
  if (typeof data === 'string') {
    return SENSITIVE_PATTERNS.some(({ pattern, optional }) => 
      !optional && pattern.test(data)
    );
  }
  
  if (typeof data === 'object' && data !== null) {
    // Check field names
    for (const key of Object.keys(data)) {
      if (isSensitiveField(key)) {
        return true;
      }
    }
    
    // Recursively check values
    for (const value of Object.values(data)) {
      if (containsSensitiveData(value)) {
        return true;
      }
    }
  }
  
  if (Array.isArray(data)) {
    return data.some(item => containsSensitiveData(item));
  }
  
  return false;
}

/**
 * Sanitization statistics for monitoring
 */
export interface SanitizationStats {
  itemsProcessed: number;
  itemsRedacted: number;
  patternsMatched: Record<string, number>;
  processingTimeMs: number;
}

/**
 * Sanitize with statistics collection
 */
export function sanitizeWithStats(data: any, options: SanitizeOptions = {}): {
  sanitized: any;
  stats: SanitizationStats;
} {
  const startTime = Date.now();
  const stats: SanitizationStats = {
    itemsProcessed: 0,
    itemsRedacted: 0,
    patternsMatched: {},
    processingTimeMs: 0
  };
  
  // Enhanced sanitization that tracks statistics
  const sanitized = sanitizeLogData(data, options);
  
  stats.processingTimeMs = Date.now() - startTime;
  
  return { sanitized, stats };
}