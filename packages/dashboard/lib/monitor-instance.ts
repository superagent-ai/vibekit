/**
 * Central MonitorService instance for the VibeKit dashboard
 * 
 * This replaces the old performance-monitor.ts with the new @vibe-kit/monitor package
 */

import { MonitorService, createMonitor } from '@vibe-kit/monitor';

// Create a singleton monitor instance
export const monitorService = createMonitor({
  retentionMinutes: 60,  // Keep metrics for 1 hour
  maxRequests: 1000,     // Store up to 1000 request metrics
  maxErrors: 100,        // Store up to 100 errors
});

// Auto-start the monitor service
let isStarted = false;

export async function getMonitorService(): Promise<MonitorService> {
  if (!isStarted) {
    try {
      await monitorService.start();
      isStarted = true;
      console.log('✅ MonitorService started successfully');
    } catch (error) {
      console.error('❌ Failed to start MonitorService:', error);
    }
  }
  return monitorService;
}

// Cleanup on process exit
process.on('SIGTERM', async () => {
  if (isStarted) {
    try {
      await monitorService.stop();
      console.log('✅ MonitorService stopped gracefully');
    } catch (error) {
      console.error('❌ Error stopping MonitorService:', error);
    }
  }
});

process.on('SIGINT', async () => {
  if (isStarted) {
    try {
      await monitorService.stop();
      console.log('✅ MonitorService stopped gracefully');
    } catch (error) {
      console.error('❌ Error stopping MonitorService:', error);
    }
  }
});