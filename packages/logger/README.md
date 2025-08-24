# @vibe-kit/logger

Unified structured logging for VibeKit packages.

## Overview

This package provides a centralized, structured logging solution for the VibeKit monorepo. It automatically suppresses log output during tests while providing rich, contextual logging during development and production.

## Features

- **Environment-aware**: Automatically suppresses logs in test environments unless explicitly enabled
- **Structured logging**: Consistent log format with context and metadata
- **Multiple log levels**: debug, info, warn, error
- **Component isolation**: Each logger instance is scoped to a specific component/module
- **Type-safe**: Full TypeScript support with proper type definitions

## Installation

This package is designed for internal use within the VibeKit monorepo:

```json
{
  "dependencies": {
    "@vibe-kit/logger": "file:../logger"
  }
}
```

## Usage

### Basic Usage

```typescript
import { createLogger } from '@vibe-kit/logger';

// Create a logger instance for your module
const log = createLogger('my-component');

// Use different log levels
log.debug('Debug message', { userId: '123' });
log.info('Info message', { action: 'user-login' });
log.warn('Warning message', { issue: 'deprecated-api' });
log.error('Error message', { error: error.message, stack: error.stack });
```

### With Context

```typescript
import { createLogger } from '@vibe-kit/logger';

const log = createLogger('api-handler');

log.info('Processing request', {
  method: 'POST',
  path: '/api/users',
  userId: user.id,
  timestamp: new Date().toISOString()
});
```

### In Tests

By default, logs are suppressed during tests (`NODE_ENV=test`). To enable logging in tests:

```bash
VIBEKIT_TEST_LOGS=true npm test
```

Or in your test files:

```typescript
import { createLogger } from '@vibe-kit/logger';

// This will be silent during tests unless VIBEKIT_TEST_LOGS is set
const log = createLogger('my-test');

describe('My Component', () => {
  it('should work', () => {
    log.info('Running test'); // Silent in test environment
    // ... test code
  });
});
```

## API Reference

### `createLogger(component: string): StructuredLogger`

Creates a new logger instance scoped to a specific component.

**Parameters:**
- `component` - A string identifier for the component/module using this logger

**Returns:** A `StructuredLogger` instance

### `StructuredLogger`

#### Methods

- `debug(message: string, context?: LogContext): void` - Debug level logging
- `info(message: string, context?: LogContext): void` - Info level logging  
- `warn(message: string, context?: LogContext): void` - Warning level logging
- `error(message: string, context?: LogContext): void` - Error level logging

#### Types

```typescript
interface LogContext {
  [key: string]: any;
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

## Environment Variables

- `NODE_ENV=test` - Automatically suppresses logs in test environment
- `VIBEKIT_TEST_LOGS=true` - Enables logging even in test environment

## Integration

This logger is integrated into the following VibeKit packages:

- `@vibe-kit/ai-chat` - Chat functionality and streaming
- `@vibe-kit/mcp-client` - MCP client operations
- `@vibe-kit/mcp-server` - MCP server operations  
- `@vibe-kit/projects` - Project management
- `@vibe-kit/taskmaster` - Task management and kanban
- `@vibe-kit/dashboard` - Dashboard UI components

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm run test
```

### Type Checking

```bash
npm run type-check
```

## License

MIT