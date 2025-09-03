import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MonitorService } from '../src/services/MonitorService';
import { RequestMetric } from '../src/types';

describe('MonitorService', () => {
  let monitor: MonitorService;

  beforeEach(() => {
    monitor = new MonitorService({
      retentionMinutes: 5,
      maxRequests: 100,
      maxErrors: 50,
    });
  });

  afterEach(async () => {
    await monitor.destroy();
  });

  describe('initialization', () => {
    it('should create a monitor service with default options', () => {
      const defaultMonitor = new MonitorService();
      expect(defaultMonitor).toBeInstanceOf(MonitorService);
    });

    it('should start and stop successfully', async () => {
      await monitor.start();
      expect(monitor['isRunning']).toBe(true);

      await monitor.stop();
      expect(monitor['isRunning']).toBe(false);
    });
  });

  describe('health checks', () => {
    it('should return system health', async () => {
      const health = await monitor.checkHealth();

      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('timestamp');
      expect(health).toHaveProperty('uptime');
      expect(health).toHaveProperty('components');
      expect(health).toHaveProperty('metrics');

      expect(['healthy', 'degraded', 'unhealthy']).toContain(health.status);
      expect(Array.isArray(health.components)).toBe(true);
    });

    it('should check specific component health', async () => {
      const componentHealth = await monitor.checkComponent('performance_monitor');

      expect(componentHealth).toHaveProperty('name');
      expect(componentHealth).toHaveProperty('status');
      expect(componentHealth).toHaveProperty('message');
      expect(componentHealth?.name).toBe('performance_monitor');
    });
  });

  describe('performance metrics', () => {
    it('should return performance metrics', () => {
      const metrics = monitor.getPerformanceMetrics();

      expect(metrics).toHaveProperty('requestsPerSecond');
      expect(metrics).toHaveProperty('averageResponseTime');
      expect(metrics).toHaveProperty('p95ResponseTime');
      expect(metrics).toHaveProperty('p99ResponseTime');
      expect(metrics).toHaveProperty('errorRate');
      expect(metrics).toHaveProperty('throughput');

      expect(typeof metrics.requestsPerSecond).toBe('number');
      expect(typeof metrics.averageResponseTime).toBe('number');
    });

    it('should record request metrics', () => {
      const metric: RequestMetric = {
        timestamp: Date.now(),
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        duration: 150,
        size: 1024,
      };

      monitor.recordRequest(metric);

      const requests = monitor.getRequestMetrics();
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject(metric);
    });
  });

  describe('memory monitoring', () => {
    it('should return memory usage', () => {
      const memory = monitor.getMemoryUsage();

      expect(memory).toHaveProperty('heapUsed');
      expect(memory).toHaveProperty('heapTotal');
      expect(memory).toHaveProperty('rss');
      expect(memory).toHaveProperty('heapUsedMB');
      expect(memory).toHaveProperty('heapTotalMB');
      expect(memory).toHaveProperty('rssMB');

      expect(typeof memory.heapUsed).toBe('number');
      expect(typeof memory.heapTotal).toBe('number');
      expect(memory.heapUsed).toBeGreaterThan(0);
    });
  });

  describe('error tracking', () => {
    it('should track and retrieve errors', () => {
      const testError = new Error('Test error');
      const context = { component: 'test', action: 'testing' };

      // Add error listener to handle the emitted error event
      monitor.on('error', () => {
        // Expected behavior - just acknowledge the event
      });

      monitor.trackError(testError, context);

      const errors = monitor.getRecentErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].error).toBe('Test error');
      expect(errors[0].context).toEqual(context);
    });

    it('should limit number of stored errors', async () => {
      const limitedMonitor = new MonitorService({ maxErrors: 2 });
      
      // Add error listener to handle the emitted error events
      limitedMonitor.on('error', () => {
        // Expected behavior - just acknowledge the event
      });

      // Start the monitor to ensure it's properly initialized
      await limitedMonitor.start();

      // Add 3 errors
      limitedMonitor.trackError(new Error('Error 1'));
      limitedMonitor.trackError(new Error('Error 2'));
      limitedMonitor.trackError(new Error('Error 3'));

      const errors = limitedMonitor.getRecentErrors();
      expect(errors.length).toBeLessThanOrEqual(2);
      
      // Clean up
      await limitedMonitor.destroy();
    });
  });

  describe('endpoint analysis', () => {
    it('should identify slowest endpoints', () => {
      // Add some test request metrics
      const metrics: RequestMetric[] = [
        { timestamp: Date.now(), method: 'GET', path: '/api/slow', statusCode: 200, duration: 500, size: 100 },
        { timestamp: Date.now(), method: 'GET', path: '/api/fast', statusCode: 200, duration: 50, size: 100 },
        { timestamp: Date.now(), method: 'GET', path: '/api/slow', statusCode: 200, duration: 600, size: 100 },
      ];

      metrics.forEach(metric => monitor.recordRequest(metric));

      const slowest = monitor.getSlowestEndpoints(10);
      expect(slowest).toHaveLength(2);
      expect(slowest[0].path).toBe('/api/slow');
      expect(slowest[0].avgDuration).toBeGreaterThan(slowest[1].avgDuration);
    });
  });

  describe('metrics export', () => {
    it('should export metrics', () => {
      const exported = monitor.exportMetrics();

      expect(exported).toHaveProperty('timestamp');
      expect(exported).toHaveProperty('version');
      expect(exported).toHaveProperty('performance');
      expect(exported).toHaveProperty('memory');
      expect(exported).toHaveProperty('errors');
      expect(exported).toHaveProperty('requestMetrics');

      expect(typeof exported.timestamp).toBe('number');
      expect(typeof exported.version).toBe('string');
    });
  });

  describe('storage stats', () => {
    it('should return storage statistics', () => {
      const stats = monitor.getStorageStats();

      expect(stats).toHaveProperty('requestCount');
      expect(stats).toHaveProperty('errorCount');
      expect(stats).toHaveProperty('memoryUsageKB');

      expect(typeof stats.requestCount).toBe('number');
      expect(typeof stats.errorCount).toBe('number');
      expect(typeof stats.memoryUsageKB).toBe('number');
    });
  });
});