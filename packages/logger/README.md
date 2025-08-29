# @vibe-kit/logger

Enterprise-grade structured logging system designed for VibeKit's distributed architecture. Provides production-safe, context-aware logging with automatic sanitization, performance monitoring, and comprehensive debugging capabilities.

## Overview

The VibeKit logger is a sophisticated logging solution built for modern TypeScript applications. It provides structured, JSON-based logging with automatic data sanitization, environment-aware configuration, and comprehensive debugging tools.

## Features

### Core Functionality
- 🔒 **Automatic Sanitization**: Removes sensitive data (API keys, passwords, tokens)
- 📊 **Structured Output**: JSON-formatted logs for easy parsing and analysis
- 🎯 **Context-Aware**: Rich context tracking with request/session IDs
- 🌍 **Environment Adaptive**: Different behaviors for dev/test/production
- ⚡ **High Performance**: Minimal overhead with efficient data handling

### Advanced Features
- ⏱️ **Performance Timing**: Built-in timing utilities for operation profiling
- 🔍 **Request Tracing**: Full request lifecycle tracking with correlation IDs
- 📈 **Sampling**: Configurable log sampling for high-traffic scenarios
- 🧪 **Test Integration**: Automatic test environment handling
- 🎨 **Colored Output**: ANSI color support for development readability
- 🔧 **Component Isolation**: Scoped loggers for different modules/components

### Security & Compliance
- 🛡️ **PII Protection**: Automatic detection and redaction of sensitive information
- 📝 **Audit Trail**: Comprehensive logging for compliance requirements
- 🔐 **Safe Defaults**: Production-safe configuration out of the box
- 🚫 **Test Suppression**: Automatic log suppression in test environments

## Installation

This package is designed for internal use within the VibeKit monorepo:

```json
{
  "dependencies": {
    "@vibe-kit/logger": "file:../logger"
  }
}
```

## Quick Start

### Basic Usage

```typescript
import { createLogger } from '@vibe-kit/logger';

// Create a logger instance for your component
const log = createLogger('my-component');

// Use different log levels with context
log.debug('Debug message', { userId: '123', operation: 'data-fetch' });
log.info('User logged in', { userId: 'user-456', method: 'oauth' });
log.warn('Rate limit approaching', { userId: 'user-789', remaining: 10 });
log.error('Database connection failed', { 
  error: error.message, 
  stack: error.stack,
  retryCount: 3 
});
```

### Advanced Usage with Rich Context

```typescript
import { createLogger } from '@vibe-kit/logger';

const log = createLogger('api-handler');

// Request lifecycle logging
log.info('Processing request', {
  method: 'POST',
  path: '/api/users',
  requestId: 'req-abc123',
  userId: user.id,
  userAgent: req.headers['user-agent'],
  ip: req.ip,
  timestamp: new Date().toISOString()
});

// Business logic logging
log.info('User creation started', {
  operation: 'user-creation',
  requestId: 'req-abc123',
  email: user.email, // Will be sanitized automatically
  role: user.role
});

// Error with full context
log.error('User creation failed', {
  operation: 'user-creation',
  requestId: 'req-abc123',
  error: error.message,
  stack: error.stack,
  validationErrors: errors,
  duration: Date.now() - startTime
});
```

### Component-Specific Loggers

Create focused loggers for different parts of your application:

```typescript
// Database operations
const dbLog = createLogger('database');
dbLog.info('Query executed', { query: 'SELECT * FROM users', duration: 45 });

// Authentication
const authLog = createLogger('auth');
authLog.info('Login attempt', { email: 'user@example.com', success: true });

// Background jobs
const jobLog = createLogger('job-processor');
jobLog.info('Job started', { jobId: 'job-123', type: 'email-send' });
```

## Advanced Features

### Performance Timing

Built-in timing utilities for measuring operation performance:

```typescript
import { createLogger } from '@vibe-kit/logger';

const log = createLogger('performance');

// Start a timer
const timer = log.timer('database-query');

// Perform operation
const result = await db.query('SELECT * FROM users');

// Stop timer and log automatically
timer.stop(); // Logs with duration

// Or stop with custom context
timer.stop('info', { 
  query: 'user-fetch', 
  resultCount: result.length 
});
```

### Component Loggers with Base Context

Create loggers with persistent context that applies to all log entries:

```typescript
import { StructuredLogger } from '@vibe-kit/logger';

// Create logger with base context
const log = StructuredLogger.create('user-service', {
  service: 'user-management',
  version: '1.2.3',
  environment: 'production'
});

// All logs will include the base context
log.info('User created', { userId: 'user-123' });
// Output: { service: 'user-management', version: '1.2.3', environment: 'production', userId: 'user-123', ... }
```

### Request Lifecycle Utilities

Convenient utilities for common logging patterns:

```typescript
import { logUtils } from '@vibe-kit/logger';

// Request start
const timer = logUtils.requestStart('POST', '/api/users', 'req-123');

// Process request...
try {
  const result = await processRequest();
  logUtils.requestComplete(timer, 200, 'req-123');
} catch (error) {
  logUtils.requestComplete(timer, 500, 'req-123');
  throw error;
}

// Session events
logUtils.sessionEvent('login', 'session-456', { userId: 'user-789' });

// Execution events
logUtils.executionEvent('started', 'exec-123', { operation: 'data-sync' });
```

### Data Sanitization

Automatic sanitization of sensitive information:

```typescript
import { createLogger, sanitizeLogData } from '@vibe-kit/logger';

const log = createLogger('security');

// These will be automatically sanitized in logs
log.info('User data', {
  email: 'user@example.com',
  password: 'secret123',        // → '[REDACTED]'
  apiKey: 'sk-abc123',          // → '[REDACTED]'
  creditCard: '4111111111111111', // → '[REDACTED]'
  token: 'bearer xyz789'        // → '[REDACTED]'
});

// Manual sanitization
const sensitiveData = {
  user: { email: 'user@example.com', password: 'secret' },
  config: { apiKey: 'sk-123' }
};

const cleanData = sanitizeLogData(sensitiveData);
log.info('Processed data', cleanData);
```

### Environment-Specific Configuration

Different behaviors based on environment:

```typescript
import { getLoggerConfig, LogLevel } from '@vibe-kit/logger';

// Get current configuration
const config = getLoggerConfig();

console.log('Current log level:', config.level);
console.log('Sanitization enabled:', config.sanitize);
console.log('Sample rate:', config.sampleRate);

// Environment-specific settings
// Development: Full logging, colored output, no sampling
// Production: INFO level, JSON format, 1% sampling for DEBUG
// Test: Silent unless VIBEKIT_TEST_LOGS=true
```

### Testing Integration

Comprehensive test environment support:

```typescript
// test/logger.test.ts
import { createLogger } from '@vibe-kit/logger';
import { enableTestLogs, disableTestLogs, captureTestLogs } from '@vibe-kit/logger/test-utils';

describe('Logger Tests', () => {
  beforeEach(() => {
    // Enable logging for specific tests
    enableTestLogs();
  });

  afterEach(() => {
    disableTestLogs();
  });

  it('captures logs during test', () => {
    const logs = captureTestLogs(() => {
      const log = createLogger('test');
      log.info('Test message', { data: 'value' });
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].message).toBe('Test message');
    expect(logs[0].context.data).toBe('value');
  });
});
```

### Global Configuration

Override default configuration:

```bash
# Environment variables
LOG_LEVEL=debug            # Set minimum log level
LOG_SANITIZE=false        # Disable sanitization (dev only)
LOG_SAMPLE_RATE=0.1       # Sample 10% of debug logs
VIBEKIT_TEST_LOGS=true    # Enable logging in tests
LOG_MAX_SIZE=10000        # Max log entry size in chars
```

## API Reference

### Core Functions

#### `createLogger(component: string, baseContext?: LogContext): StructuredLogger`

Creates a new logger instance scoped to a specific component with optional base context.

**Parameters:**
- `component: string` - Identifier for the component/module using this logger
- `baseContext?: LogContext` - Optional context applied to all log entries

**Returns:** A `StructuredLogger` instance

```typescript
const log = createLogger('user-service', { 
  service: 'user-management',
  version: '1.2.3' 
});
```

#### `logger: StructuredLogger`

Global logger instance for convenience (not recommended for production).

```typescript
import { logger } from '@vibe-kit/logger';
logger.info('Global log message');
```

### StructuredLogger Class

#### Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| `debug(message, context?)` | Debug level logging | `message: string, context?: LogContext` |
| `info(message, context?)` | Info level logging | `message: string, context?: LogContext` |
| `warn(message, context?)` | Warning level logging | `message: string, context?: LogContext` |
| `error(message, context?)` | Error level logging | `message: string, context?: LogContext` |
| `timer(operation)` | Create performance timer | `operation: string` → `LogTimer` |

#### Static Methods

| Method | Description | Parameters |
|--------|-------------|------------|
| `getInstance()` | Get singleton instance | None → `StructuredLogger` |
| `create(component, baseContext?)` | Create scoped logger | `component: string, baseContext?: LogContext` |

### LogTimer Class

Returned by `logger.timer()` for performance measurement.

```typescript
interface LogTimer {
  stop(level?: LogLevel, context?: LogContext): void;
}
```

**Usage:**
```typescript
const timer = log.timer('database-query');
// ... perform operation
timer.stop('info', { query: 'users', count: 150 });
```

### Utility Functions

#### `logUtils`

Collection of common logging patterns.

```typescript
interface LogUtils {
  requestStart(method: string, url: string, requestId: string): LogTimer;
  requestComplete(timer: LogTimer, statusCode: number, requestId: string): void;
  sessionEvent(event: string, sessionId: string, context?: LogContext): void;
  executionEvent(event: string, executionId: string, context?: LogContext): void;
}
```

#### Sanitization Functions

```typescript
// Sanitize data before logging
sanitizeLogData(data: any, options?: SanitizeOptions): any;

// Sanitize message strings
sanitizeMessage(message: string): string;

// Sanitize string values
sanitizeString(value: string): string;

// Sanitize object properties
sanitizeObject(obj: any, options?: SanitizeOptions): any;
```

**SanitizeOptions:**
```typescript
interface SanitizeOptions {
  maxSize?: number;        // Max string length (default: 1000)
  redactedText?: string;   // Replacement text (default: '[REDACTED]')
  sensitiveKeys?: string[]; // Additional keys to sanitize
}
```

### Type Definitions

#### LogContext
```typescript
interface LogContext {
  component?: string;      // Component name
  requestId?: string;      // Request correlation ID
  sessionId?: string;      // Session identifier
  executionId?: string;    // Execution trace ID
  projectId?: string;      // Project context
  userId?: string;         // User context
  operation?: string;      // Operation name
  duration?: number;       // Operation duration in ms
  [key: string]: any;      // Additional context
}
```

#### LogEntry
```typescript
interface LogEntry {
  timestamp: string;       // ISO timestamp
  level: string;          // Log level name
  message: string;        // Log message
  context: LogContext;    // Context data
  error?: {               // Error details (if applicable)
    name: string;
    message: string;
    stack?: string;
  };
}
```

#### LogLevel
```typescript
enum LogLevel {
  ERROR = 0,    // Critical errors only
  WARN = 1,     // Warnings and errors
  INFO = 2,     // Info, warnings, and errors
  DEBUG = 3     // All levels
}
```

#### LoggerConfig
```typescript
interface LoggerConfig {
  level: LogLevel;           // Minimum log level
  sanitize: boolean;         // Enable data sanitization
  maxSize: number;          // Max log entry size
  sampleRate: number;       // Sampling rate (0-1)
  enableTimestamp: boolean; // Include timestamps
  enableContext: boolean;   // Include context data
}
```

## Configuration

### Environment Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `NODE_ENV` | Runtime environment | - | `development`, `production`, `test` |
| `LOG_LEVEL` | Minimum log level | `info` | `debug`, `info`, `warn`, `error` |
| `LOG_SANITIZE` | Enable sanitization | `true` | `true`, `false` |
| `LOG_SAMPLE_RATE` | Debug sampling rate | `1.0` | `0.1` (10%) |
| `LOG_MAX_SIZE` | Max entry size (chars) | `5000` | `10000` |
| `VIBEKIT_TEST_LOGS` | Enable in tests | `false` | `true`, `false` |

### Environment-Specific Defaults

#### Development
```typescript
{
  level: LogLevel.DEBUG,
  sanitize: false,
  maxSize: 10000,
  sampleRate: 1.0,
  enableTimestamp: true,
  enableContext: true
}
```

#### Production
```typescript
{
  level: LogLevel.INFO,
  sanitize: true,
  maxSize: 5000,
  sampleRate: 0.01, // 1% sampling for DEBUG
  enableTimestamp: true,
  enableContext: true
}
```

#### Test
```typescript
{
  level: LogLevel.ERROR,
  sanitize: true,
  maxSize: 1000,
  sampleRate: 0,    // No sampling
  enableTimestamp: false,
  enableContext: false
}
```

## Log Output Examples

### Development Output (Colored Console)

```
[2025-01-27 14:30:25.123] [INFO] user-service: User login successful
  ↳ {
      "userId": "user-123",
      "method": "oauth",
      "ip": "192.168.1.100",
      "userAgent": "Chrome/91.0",
      "duration": 45
    }

[2025-01-27 14:30:25.156] [ERROR] database: Connection failed
  ↳ {
      "error": "Connection timeout",
      "host": "db.example.com",
      "retryCount": 3,
      "stack": "Error: Connection timeout\n    at Database.connect..."
    }
```

### Production Output (JSON)

```json
{
  "timestamp": "2025-01-27T14:30:25.123Z",
  "level": "info",
  "message": "User login successful",
  "context": {
    "component": "user-service",
    "userId": "user-123",
    "method": "oauth",
    "ip": "192.168.1.100",
    "userAgent": "Chrome/91.0",
    "duration": 45
  }
}

{
  "timestamp": "2025-01-27T14:30:25.156Z",
  "level": "error",
  "message": "Connection failed",
  "context": {
    "component": "database",
    "host": "db.example.com",
    "retryCount": 3
  },
  "error": {
    "name": "Error",
    "message": "Connection timeout",
    "stack": "Error: Connection timeout\n    at Database.connect..."
  }
}
```

## Integration Examples

### Express.js Middleware

```typescript
import { createLogger, logUtils } from '@vibe-kit/logger';

const log = createLogger('express-middleware');

export function loggingMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = generateRequestId();
  const timer = logUtils.requestStart(req.method, req.path, requestId);

  // Add request context
  req.requestId = requestId;
  req.startTime = Date.now();

  res.on('finish', () => {
    logUtils.requestComplete(timer, res.statusCode, requestId);
  });

  next();
}
```

### Database Integration

```typescript
import { createLogger } from '@vibe-kit/logger';

class DatabaseService {
  private log = createLogger('database');

  async query(sql: string, params: any[] = []) {
    const timer = this.log.timer('database-query');
    
    try {
      this.log.debug('Executing query', { 
        sql: sql.substring(0, 100), 
        paramCount: params.length 
      });
      
      const result = await this.db.query(sql, params);
      
      timer.stop('info', { 
        sql: sql.substring(0, 100),
        rowCount: result.rows.length 
      });
      
      return result;
    } catch (error) {
      timer.stop('error', { 
        sql: sql.substring(0, 100),
        error: error.message 
      });
      throw error;
    }
  }
}
```

### Background Job Processing

```typescript
import { createLogger, logUtils } from '@vibe-kit/logger';

class JobProcessor {
  private log = createLogger('job-processor');

  async processJob(job: Job) {
    const executionId = `exec-${job.id}-${Date.now()}`;
    
    logUtils.executionEvent('started', executionId, {
      jobId: job.id,
      jobType: job.type,
      queuedAt: job.queuedAt
    });

    const timer = this.log.timer('job-execution');

    try {
      await this.executeJob(job);
      
      timer.stop('info', { 
        jobId: job.id,
        executionId,
        success: true 
      });
      
      logUtils.executionEvent('completed', executionId, {
        jobId: job.id,
        result: 'success'
      });
      
    } catch (error) {
      timer.stop('error', { 
        jobId: job.id,
        executionId,
        error: error.message 
      });
      
      logUtils.executionEvent('failed', executionId, {
        jobId: job.id,
        error: error.message
      });
      
      throw error;
    }
  }
}
```

## Best Practices

### 1. Use Component-Specific Loggers
```typescript
// Good
const userLog = createLogger('user-service');
const authLog = createLogger('auth');

// Avoid
const log = createLogger('app');
```

### 2. Include Rich Context
```typescript
// Good
log.info('Order processed', {
  orderId: order.id,
  userId: order.userId,
  amount: order.total,
  paymentMethod: order.payment.method,
  duration: processingTime
});

// Basic
log.info('Order processed');
```

### 3. Use Appropriate Log Levels
```typescript
// ERROR: System failures, exceptions
log.error('Database connection lost', { error: err.message });

// WARN: Recoverable issues, deprecations
log.warn('API key expires soon', { expiresAt: key.expiresAt });

// INFO: Business events, user actions
log.info('User registered', { userId: user.id });

// DEBUG: Detailed troubleshooting info
log.debug('Cache miss', { key: cacheKey, ttl: 300 });
```

### 4. Sanitize Sensitive Data
```typescript
// Automatic sanitization
log.info('User created', {
  email: 'user@example.com',
  password: 'secret123',        // Auto-redacted
  apiKey: 'sk-abc123'          // Auto-redacted
});

// Manual sanitization for custom data
const userData = sanitizeLogData(rawUserData);
log.info('Processing user data', userData);
```

### 5. Use Performance Timers
```typescript
const timer = log.timer('expensive-operation');
try {
  const result = await performExpensiveOperation();
  timer.stop('info', { resultSize: result.length });
  return result;
} catch (error) {
  timer.stop('error', { error: error.message });
  throw error;
}
```

## Package Integration

The logger is integrated into these VibeKit packages:

| Package | Usage |
|---------|--------|
| `@vibe-kit/ai-chat` | Chat streaming, API requests, error handling |
| `@vibe-kit/mcp-client` | MCP server connections, tool execution |
| `@vibe-kit/mcp-server` | Request handling, tool processing |
| `@vibe-kit/projects` | Project operations, file management |
| `@vibe-kit/taskmaster` | Task updates, file watching, SSE events |
| `@vibe-kit/dashboard` | HTTP requests, component lifecycle |

## Troubleshooting

### Logs Not Appearing

1. **Check Environment**: Logs are suppressed in test environment
   ```bash
   VIBEKIT_TEST_LOGS=true npm test
   ```

2. **Check Log Level**: Ensure your level is high enough
   ```bash
   LOG_LEVEL=debug npm run dev
   ```

3. **Check Sampling**: Production may sample debug logs
   ```bash
   LOG_SAMPLE_RATE=1.0 npm start
   ```

### Performance Issues

1. **Reduce Log Level**: Use INFO or WARN in production
2. **Enable Sampling**: Set LOG_SAMPLE_RATE=0.1 for 10% sampling
3. **Limit Context Size**: Use maxSize option for large objects

### Sensitive Data Leaks

1. **Enable Sanitization**: Ensure LOG_SANITIZE=true (default)
2. **Add Custom Keys**: Configure additional sensitive keys
3. **Manual Sanitization**: Use sanitizeLogData() for complex objects

## Development

### Building

```bash
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run tests with logging enabled
VIBEKIT_TEST_LOGS=true npm test

# Run with coverage
npm run test:coverage
```

### Type Checking

```bash
npm run type-check
```

## Contributing

1. Follow existing code patterns
2. Add tests for new features
3. Update documentation
4. Ensure TypeScript compliance
5. Test in all environments (dev/prod/test)

## Dependencies

- **Zero Runtime Dependencies**: Self-contained logging solution
- **Development Dependencies**: TypeScript, Vitest for testing
- **Node.js**: >=18.0.0 for modern JavaScript features

## Changelog

### 0.0.1
- Initial release with structured logging
- Automatic data sanitization
- Environment-aware configuration
- Performance timing utilities
- Test environment integration
- Full TypeScript support

## License

MIT - Part of the VibeKit project

## Support

- **Issues**: [GitHub Issues](https://github.com/superagent-ai/vibekit/issues)
- **Documentation**: [VibeKit Docs](https://docs.vibekit.sh)
- **Community**: [Discord](https://discord.gg/vibekit)