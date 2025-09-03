# @vibe-kit/monitor

A comprehensive system monitoring package for VibeKit that provides health checks, performance metrics, memory monitoring, and error tracking.

## Features

- **System Health Monitoring**: Check overall system health and individual component status
- **Performance Metrics**: Track request performance, response times, throughput, and error rates
- **Memory Monitoring**: Monitor heap usage, RSS, and memory pressure
- **Error Tracking**: Collect and analyze application errors with context
- **Request Analytics**: Identify slowest endpoints and performance bottlenecks
- **In-Memory Storage**: Efficient circular buffers for metrics storage (no database required)
- **Express/Next.js Middleware**: Automatic request monitoring for web applications

## Installation

```bash
npm install @vibe-kit/monitor
```

## Quick Start

```typescript
import { createMonitor } from '@vibe-kit/monitor';

// Create monitor instance
const monitor = createMonitor({
  retentionMinutes: 60,  // Keep metrics for 1 hour
  maxRequests: 1000,     // Store up to 1000 request metrics
  maxErrors: 100,        // Store up to 100 errors
});

// Start monitoring
await monitor.start();

// Record a request
monitor.recordRequest({
  timestamp: Date.now(),
  method: 'GET',
  path: '/api/users',
  statusCode: 200,
  duration: 150,
  size: 1024,
});

// Track an error
monitor.trackError(new Error('Something went wrong'), {
  component: 'api',
  action: 'fetchUser'
});

// Get health status
const health = await monitor.checkHealth();
console.log('System status:', health.status);

// Get performance metrics
const metrics = monitor.getPerformanceMetrics();
console.log('Average response time:', metrics.averageResponseTime);

// Clean shutdown
await monitor.stop();
```

## Express/Next.js Integration

### Express Middleware

```typescript
import express from 'express';
import { createMonitor, createMonitoringMiddleware } from '@vibe-kit/monitor';

const app = express();
const monitor = createMonitor();

// Add monitoring middleware
app.use(createMonitoringMiddleware(monitor, {
  sampleRate: 1.0,           // Monitor 100% of requests
  skipPaths: ['/health'],    // Skip monitoring for health checks
  skipMethods: ['options'],  // Skip OPTIONS requests
}));

await monitor.start();
```

### Next.js API Routes

```typescript
import { createMonitor, withMonitoring } from '@vibe-kit/monitor';

const monitor = createMonitor();

async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Your API logic here
  res.json({ message: 'Hello World' });
}

// Wrap with monitoring
export default withMonitoring(handler, monitor);
```

### Health Check Endpoints

```typescript
import { createHealthCheckHandler, createMetricsHandler } from '@vibe-kit/monitor';

const monitor = createMonitor();
const healthHandler = createHealthCheckHandler(monitor);
const metricsHandler = createMetricsHandler(monitor);

// Health check endpoint
app.get('/health', healthHandler);

// Metrics endpoint
app.get('/metrics', metricsHandler);
```

## API Reference

### MonitorService

The main monitoring service class that coordinates all monitoring activities.

#### Constructor Options

```typescript
interface MonitorOptions {
  retentionMinutes?: number;  // How long to keep metrics (default: 60)
  maxRequests?: number;       // Maximum request metrics to store (default: 1000)
  maxErrors?: number;         // Maximum errors to store (default: 100)
}
```

#### Methods

- `start()`: Start the monitoring service
- `stop()`: Stop the monitoring service
- `destroy()`: Clean shutdown with resource cleanup
- `checkHealth()`: Get comprehensive system health status
- `checkComponent(name)`: Check specific component health
- `recordRequest(metric)`: Record a request metric
- `trackError(error, context?)`: Track an application error
- `getPerformanceMetrics()`: Get current performance metrics
- `getMemoryUsage()`: Get memory usage statistics
- `getRequestMetrics()`: Get all stored request metrics
- `getRecentErrors(limit?)`: Get recent errors
- `getSlowestEndpoints(limit?)`: Get slowest API endpoints
- `getStorageStats()`: Get storage utilization statistics
- `exportMetrics()`: Export all metrics for analysis

### Health Status

The health check system provides three status levels:

- `healthy`: All systems operating normally
- `degraded`: Some issues detected but system still functional
- `unhealthy`: Critical issues requiring immediate attention

### Performance Metrics

Performance metrics include:

```typescript
interface PerformanceMetrics {
  requestsPerSecond: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  errorRate: number;
  throughput: number;
}
```

### Memory Metrics

Memory monitoring provides:

```typescript
interface MemoryMetrics {
  heapUsed: number;
  heapTotal: number;
  rss: number;
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
}
```

## Configuration

### Environment Variables

The monitor package respects these environment variables:

- `NODE_ENV`: Environment mode (affects default settings)
- `MONITOR_RETENTION_MINUTES`: Override default retention period
- `MONITOR_MAX_REQUESTS`: Override maximum request storage
- `MONITOR_MAX_ERRORS`: Override maximum error storage

### Middleware Options

```typescript
interface MiddlewareOptions {
  sampleRate?: number;          // Sampling rate (0-1, default: 1.0)
  includeUserAgent?: boolean;   // Include User-Agent in metrics
  includeHeaders?: boolean;     // Include request headers
  skipPaths?: string[];         // Paths to skip monitoring
  skipMethods?: string[];       // HTTP methods to skip
}
```

## Storage

The monitor package uses efficient in-memory circular buffers for metric storage. This provides:

- **Fast Performance**: No I/O overhead
- **Memory Efficient**: Automatic cleanup of old metrics
- **Zero Dependencies**: No database setup required
- **Process Isolation**: Metrics are process-local

Data is automatically cleaned up based on the `retentionMinutes` setting.

## Events

MonitorService extends EventEmitter and emits these events:

- `started`: When monitoring starts
- `stopped`: When monitoring stops  
- `error`: When an error is tracked
- `health-change`: When system health status changes
- `threshold-exceeded`: When performance thresholds are exceeded

```typescript
monitor.on('error', (trackedError) => {
  console.log('Error tracked:', trackedError.error);
});

monitor.on('health-change', (health) => {
  console.log('Health status changed:', health.status);
});
```

## Examples

### Custom Health Checks

```typescript
// Add custom component monitoring
monitor.on('health-check', (components) => {
  components.push({
    name: 'Database',
    status: isDatabaseHealthy() ? 'healthy' : 'unhealthy',
    message: 'Database connection status',
    details: { connections: getActiveConnections() }
  });
});
```

### Performance Alerting

```typescript
monitor.on('threshold-exceeded', ({ metric, value, threshold }) => {
  if (metric === 'response-time' && value > 1000) {
    sendAlert(`High response time detected: ${value}ms`);
  }
});
```

### Metrics Export

```typescript
// Export metrics for external analysis
setInterval(async () => {
  const exported = monitor.exportMetrics();
  await sendToAnalyticsService(exported);
}, 60000); // Every minute
```

## Best Practices

1. **Sampling**: Use sampling for high-traffic applications to reduce overhead
2. **Cleanup**: Always call `destroy()` on process shutdown
3. **Error Context**: Provide meaningful context when tracking errors
4. **Health Checks**: Use health checks for load balancer configuration
5. **Retention**: Adjust retention based on your memory constraints

## TypeScript Support

The package is written in TypeScript and provides comprehensive type definitions for all APIs.

## License

MIT - see LICENSE file for details

## Contributing

See the main VibeKit repository for contribution guidelines.