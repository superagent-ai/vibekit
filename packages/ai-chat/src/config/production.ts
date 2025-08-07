export const productionConfig = {
  // API Configuration
  api: {
    baseUrl: process.env.API_BASE_URL || 'https://api.anthropic.com',
    timeout: parseInt(process.env.API_TIMEOUT || '30000'),
    maxRetries: parseInt(process.env.API_MAX_RETRIES || '3'),
  },
  
  // Rate Limiting
  rateLimiting: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    maxRequests: parseInt(process.env.RATE_LIMIT_REQUESTS || '100'),
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '60000'), // 1 minute
    maxTokensPerMinute: parseInt(process.env.MAX_TOKENS_PER_MINUTE || '10000'),
  },
  
  // Session Management
  sessions: {
    maxPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER || '50'),
    ttl: parseInt(process.env.SESSION_TTL || '86400000'), // 24 hours
    maxMessages: parseInt(process.env.MAX_MESSAGES_PER_SESSION || '1000'),
    cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL || '3600000'), // 1 hour
  },
  
  // Storage
  storage: {
    type: process.env.STORAGE_TYPE || 'json', // 'json' | 'sqlite' | 'postgres'
    path: process.env.STORAGE_PATH || '.vibekit/chats',
    backupEnabled: process.env.BACKUP_ENABLED === 'true',
    backupInterval: parseInt(process.env.BACKUP_INTERVAL || '86400000'), // 24 hours
  },
  
  // Security
  security: {
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    trustedProxies: process.env.TRUSTED_PROXIES?.split(',') || [],
    encryptSessions: process.env.ENCRYPT_SESSIONS === 'true',
    sanitizeInput: process.env.SANITIZE_INPUT !== 'false',
    maxInputLength: parseInt(process.env.MAX_INPUT_LENGTH || '10000'),
  },
  
  // Monitoring
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    logLevel: process.env.LOG_LEVEL || 'info',
    metricsEnabled: process.env.METRICS_ENABLED === 'true',
    sentryDsn: process.env.SENTRY_DSN,
    otlpEndpoint: process.env.OTLP_ENDPOINT,
  },
  
  // Model Configuration
  models: {
    default: process.env.DEFAULT_MODEL || 'claude-3-5-sonnet-20241022',
    temperature: parseFloat(process.env.MODEL_TEMPERATURE || '0.7'),
    maxTokens: parseInt(process.env.MODEL_MAX_TOKENS || '4096'),
    topP: parseFloat(process.env.MODEL_TOP_P || '1'),
  },
  
  // MCP Configuration
  mcp: {
    enabled: process.env.MCP_ENABLED !== 'false',
    maxConcurrentTools: parseInt(process.env.MCP_MAX_CONCURRENT || '5'),
    toolTimeout: parseInt(process.env.MCP_TOOL_TIMEOUT || '30000'),
    allowedServers: process.env.MCP_ALLOWED_SERVERS?.split(',') || [],
  },
  
  // Performance
  performance: {
    streamingEnabled: process.env.STREAMING_ENABLED !== 'false',
    cacheEnabled: process.env.CACHE_ENABLED === 'true',
    cacheTTL: parseInt(process.env.CACHE_TTL || '300000'), // 5 minutes
    connectionPoolSize: parseInt(process.env.CONNECTION_POOL_SIZE || '10'),
  },
};

export type ProductionConfig = typeof productionConfig;