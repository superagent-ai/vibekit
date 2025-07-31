export const DEFAULT_CONFIG = {
  serviceName: 'vibekit-telemetry',
  serviceVersion: '1.0.0',
  environment: 'development',
  
  storage: [
    {
      type: 'sqlite' as const,
      enabled: true,
      options: {
        path: '.vibekit/telemetry.db',
        streamBatchSize: 100,
        streamFlushInterval: 5000,
      }
    }
  ],
  
  streaming: {
    enabled: false,
    type: 'websocket' as const,
    port: 3001,
  },
  
  security: {
    pii: {
      enabled: true,
    },
    encryption: {
      enabled: false,
    },
    retention: {
      enabled: true,
      maxAge: 30, // 30 days
    },
  },
  
  reliability: {
    circuitBreaker: {
      enabled: true,
      threshold: 5,
      timeout: 60000,
    },
    rateLimit: {
      enabled: true,
      maxRequests: 100,
      windowMs: 60000,
    },
    retry: {
      enabled: true,
      maxRetries: 3,
      backoff: 1000,
    },
  },
  
  analytics: {
    enabled: false,
  },
  
  dashboard: {
    enabled: false,
    port: 3000,
  },
  
  plugins: [],
};

export const EVENT_TYPES = {
  START: 'start',
  STREAM: 'stream',
  END: 'end',
  ERROR: 'error',
  CUSTOM: 'custom',
} as const;

export const STORAGE_TYPES = {
  SQLITE: 'sqlite',
  OTLP: 'otlp',
  MEMORY: 'memory',
  CUSTOM: 'custom',
} as const;

export const STREAMING_TYPES = {
  WEBSOCKET: 'websocket',
  SSE: 'sse',
  GRPC: 'grpc',
} as const;

export const DEFAULT_PII_PATTERNS = new Map<string, RegExp>([
  ['email', /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g],
  ['phone', /(\+\d{1,3}[- ]?)?\d{10}/g],
  ['ssn', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['creditCard', /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g],
  ['apiKey', /\b[A-Za-z0-9]{32,}\b/g],
]);