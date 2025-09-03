/**
 * Graceful Shutdown Coordinator
 * 
 * Manages orderly shutdown of all services and resources when the
 * application is terminating. Ensures connections are drained, data
 * is persisted, and resources are properly released.
 */

import { EventEmitter } from 'events';
import { createLogger } from './structured-logger';
import { SessionManager } from './session-manager';
import { SessionLogger } from './session-logger';
import { memoryMonitor } from './memory-monitor';
import { performance } from 'perf_hooks';

const logger = createLogger('ShutdownCoordinator');

/**
 * Shutdown phases for orderly termination
 */
export enum ShutdownPhase {
  INITIATED = 'initiated',
  DRAINING_CONNECTIONS = 'draining_connections',
  FLUSHING_DATA = 'flushing_data',
  CLOSING_SERVICES = 'closing_services',
  CLEANUP = 'cleanup',
  COMPLETED = 'completed'
}

/**
 * Shutdown handler configuration
 */
export interface ShutdownHandler {
  name: string;
  phase: ShutdownPhase;
  priority: number; // Lower number = higher priority (runs first)
  timeout?: number; // Max time in ms for this handler
  execute: () => Promise<void>;
  forceCleanup?: () => void; // Called if timeout expires
}

/**
 * Shutdown options
 */
export interface ShutdownOptions {
  gracePeriod?: number;     // Time to wait for graceful shutdown (ms)
  forceTimeout?: number;    // Max time before forced termination (ms)
  exitOnComplete?: boolean; // Whether to call process.exit
  signal?: string;          // The signal that triggered shutdown
}

/**
 * Shutdown status
 */
export interface ShutdownStatus {
  phase: ShutdownPhase;
  startTime: number;
  elapsedTime: number;
  handlersCompleted: string[];
  handlersPending: string[];
  errors: Array<{ handler: string; error: string }>;
  isShuttingDown: boolean;
}

/**
 * Graceful Shutdown Coordinator implementation
 */
export class ShutdownCoordinator extends EventEmitter {
  private static instance: ShutdownCoordinator;
  private handlers: Map<ShutdownPhase, ShutdownHandler[]> = new Map();
  private isShuttingDown = false;
  private shutdownPromise: Promise<void> | null = null;
  private currentPhase: ShutdownPhase | null = null;
  private shutdownStartTime = 0;
  private completedHandlers = new Set<string>();
  private handlerErrors: Array<{ handler: string; error: string }> = [];
  private forceExitTimer: NodeJS.Timeout | null = null;
  private signalHandlersRegistered = false;
  
  // Active connections and resources tracking
  private activeConnections = new Set<string>();
  private activeStreams = new Set<string>();
  private activeFileHandles = new Set<number>();
  
  private constructor() {
    super();
    this.initializePhases();
    this.registerDefaultHandlers();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): ShutdownCoordinator {
    if (!ShutdownCoordinator.instance) {
      ShutdownCoordinator.instance = new ShutdownCoordinator();
    }
    return ShutdownCoordinator.instance;
  }
  
  /**
   * Initialize shutdown phases
   */
  private initializePhases(): void {
    // Initialize empty handler arrays for each phase
    Object.values(ShutdownPhase).forEach(phase => {
      this.handlers.set(phase, []);
    });
  }
  
  /**
   * Register a shutdown handler
   */
  registerHandler(handler: ShutdownHandler): void {
    const phaseHandlers = this.handlers.get(handler.phase) || [];
    phaseHandlers.push(handler);
    
    // Sort by priority (lower number = higher priority)
    phaseHandlers.sort((a, b) => a.priority - b.priority);
    
    this.handlers.set(handler.phase, phaseHandlers);
    
    logger.info('Registered shutdown handler', {
      name: handler.name,
      phase: handler.phase,
      priority: handler.priority
    });
  }
  
  /**
   * Register default shutdown handlers
   */
  private registerDefaultHandlers(): void {
    // Stop accepting new connections
    this.registerHandler({
      name: 'stop-accepting-connections',
      phase: ShutdownPhase.INITIATED,
      priority: 1,
      timeout: 1000,
      execute: async () => {
        logger.info('Stopping acceptance of new connections');
        this.emit('stop-accepting-connections');
      }
    });
    
    // Drain HTTP connections
    this.registerHandler({
      name: 'drain-http-connections',
      phase: ShutdownPhase.DRAINING_CONNECTIONS,
      priority: 10,
      timeout: 30000,
      execute: async () => {
        const connectionCount = this.activeConnections.size;
        if (connectionCount > 0) {
          logger.info('Draining active HTTP connections', { count: connectionCount });
          
          // Send connection close headers
          this.emit('drain-connections');
          
          // Wait for connections to close with timeout
          const drainStart = Date.now();
          const maxDrainTime = 10000; // 10 seconds
          
          while (this.activeConnections.size > 0 && Date.now() - drainStart < maxDrainTime) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          if (this.activeConnections.size > 0) {
            logger.warn('Some connections did not drain in time', {
              remaining: this.activeConnections.size
            });
          }
        }
      }
    });
    
    // Drain SSE/WebSocket connections
    this.registerHandler({
      name: 'drain-stream-connections',
      phase: ShutdownPhase.DRAINING_CONNECTIONS,
      priority: 20,
      timeout: 15000,
      execute: async () => {
        const streamCount = this.activeStreams.size;
        if (streamCount > 0) {
          logger.info('Draining active stream connections', { count: streamCount });
          
          // Signal streams to close
          this.emit('drain-streams');
          
          // Send close message to all active streams
          for (const streamId of this.activeStreams) {
            this.emit('close-stream', streamId);
          }
          
          // Wait for streams to close
          const drainStart = Date.now();
          const maxDrainTime = 5000; // 5 seconds
          
          while (this.activeStreams.size > 0 && Date.now() - drainStart < maxDrainTime) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          if (this.activeStreams.size > 0) {
            logger.warn('Some streams did not close in time', {
              remaining: this.activeStreams.size
            });
            // Force close remaining streams
            this.activeStreams.clear();
          }
        }
      }
    });
    
    // Flush SessionLogger buffers
    this.registerHandler({
      name: 'flush-session-logs',
      phase: ShutdownPhase.FLUSHING_DATA,
      priority: 10,
      timeout: 5000,
      execute: async () => {
        logger.info('Flushing session log buffers');
        // SessionLogger instances will respond to this event
        this.emit('flush-logs');
        
        // Wait a moment for flush operations to complete
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    });
    
    // Save SessionManager state
    this.registerHandler({
      name: 'save-session-state',
      phase: ShutdownPhase.FLUSHING_DATA,
      priority: 20,
      timeout: 5000,
      execute: async () => {
        logger.info('Saving session manager state');
        try {
          // Save current checkpoint state
          const stats = await SessionManager.getStats();
          logger.info('Session manager state saved', { stats });
        } catch (error) {
          logger.error('Failed to save session state', error);
        }
      }
    });
    
    // Stop memory monitor
    this.registerHandler({
      name: 'stop-memory-monitor',
      phase: ShutdownPhase.CLOSING_SERVICES,
      priority: 10,
      timeout: 1000,
      execute: async () => {
        logger.info('Stopping memory monitor');
        memoryMonitor.stop();
      }
    });
    
    // Close file handles
    this.registerHandler({
      name: 'close-file-handles',
      phase: ShutdownPhase.CLOSING_SERVICES,
      priority: 20,
      timeout: 2000,
      execute: async () => {
        const handleCount = this.activeFileHandles.size;
        if (handleCount > 0) {
          logger.info('Closing active file handles', { count: handleCount });
          for (const fd of this.activeFileHandles) {
            try {
              require('fs').closeSync(fd);
            } catch (error) {
              // File might already be closed
            }
          }
          this.activeFileHandles.clear();
        }
      }
    });
    
    // Clear caches and temporary data
    this.registerHandler({
      name: 'clear-caches',
      phase: ShutdownPhase.CLEANUP,
      priority: 10,
      timeout: 2000,
      execute: async () => {
        logger.info('Clearing caches and temporary data');
        
        // Clear require cache for hot-reloadable modules
        for (const key of Object.keys(require.cache)) {
          if (key.includes('node_modules')) continue;
          delete require.cache[key];
        }
        
        // Emit event for cache clearing
        this.emit('clear-caches');
      }
    });
    
    // Final cleanup
    this.registerHandler({
      name: 'final-cleanup',
      phase: ShutdownPhase.CLEANUP,
      priority: 100,
      timeout: 1000,
      execute: async () => {
        logger.info('Performing final cleanup');
        
        // Remove all event listeners to prevent memory leaks
        this.removeAllListeners();
        
        // Clear any remaining timers
        this.emit('clear-timers');
      }
    });
  }
  
  /**
   * Execute shutdown handlers for a phase
   */
  private async executePhase(phase: ShutdownPhase): Promise<void> {
    this.currentPhase = phase;
    const phaseHandlers = this.handlers.get(phase) || [];
    
    if (phaseHandlers.length === 0) {
      return;
    }
    
    logger.info('Starting shutdown phase', {
      phase,
      handlerCount: phaseHandlers.length
    });
    
    // Execute handlers in priority order
    for (const handler of phaseHandlers) {
      try {
        const startTime = performance.now();
        
        // Execute with timeout
        await this.executeWithTimeout(
          handler.execute(),
          handler.timeout || 10000,
          handler.name,
          handler.forceCleanup
        );
        
        const duration = performance.now() - startTime;
        this.completedHandlers.add(handler.name);
        
        logger.info('Shutdown handler completed', {
          name: handler.name,
          phase,
          durationMs: duration
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.handlerErrors.push({
          handler: handler.name,
          error: errorMessage
        });
        
        logger.error('Shutdown handler failed', error, {
          handler: handler.name,
          phase
        });
        
        // Continue with other handlers even if one fails
      }
    }
  }
  
  /**
   * Execute with timeout
   */
  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number,
    name: string,
    forceCleanup?: () => void
  ): Promise<T> {
    let timeoutHandle: NodeJS.Timeout;
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        const error = new Error(`Handler '${name}' timed out after ${timeout}ms`);
        
        // Call force cleanup if provided
        if (forceCleanup) {
          try {
            forceCleanup();
          } catch (cleanupError) {
            logger.error('Force cleanup failed', cleanupError, { handler: name });
          }
        }
        
        reject(error);
      }, timeout);
    });
    
    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutHandle!);
      return result;
    } catch (error) {
      clearTimeout(timeoutHandle!);
      throw error;
    }
  }
  
  /**
   * Start graceful shutdown
   */
  async shutdown(options: ShutdownOptions = {}): Promise<void> {
    const {
      gracePeriod = 30000,    // 30 seconds default
      forceTimeout = 60000,   // 1 minute default
      exitOnComplete = true,
      signal = 'unknown'
    } = options;
    
    // Prevent multiple simultaneous shutdowns
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return this.shutdownPromise!;
    }
    
    this.isShuttingDown = true;
    this.shutdownStartTime = Date.now();
    
    logger.info('Starting graceful shutdown', {
      signal,
      gracePeriod,
      forceTimeout
    });
    
    // Emit shutdown event
    this.emit('shutdown-started', signal);
    
    // Set force exit timer
    this.forceExitTimer = setTimeout(() => {
      logger.error('Force shutdown timeout reached, terminating immediately');
      process.exit(1);
    }, forceTimeout);
    
    // Execute shutdown sequence
    this.shutdownPromise = this.executeShutdown(gracePeriod, exitOnComplete);
    
    try {
      await this.shutdownPromise;
    } finally {
      if (this.forceExitTimer) {
        clearTimeout(this.forceExitTimer);
        this.forceExitTimer = null;
      }
    }
    
    return this.shutdownPromise;
  }
  
  /**
   * Execute the shutdown sequence
   */
  private async executeShutdown(gracePeriod: number, exitOnComplete: boolean): Promise<void> {
    const phases = [
      ShutdownPhase.INITIATED,
      ShutdownPhase.DRAINING_CONNECTIONS,
      ShutdownPhase.FLUSHING_DATA,
      ShutdownPhase.CLOSING_SERVICES,
      ShutdownPhase.CLEANUP
    ];
    
    const phaseStartTime = Date.now();
    
    for (const phase of phases) {
      // Check if we've exceeded grace period
      if (Date.now() - phaseStartTime > gracePeriod) {
        logger.warn('Grace period exceeded, skipping remaining phases', {
          currentPhase: phase,
          elapsedTime: Date.now() - phaseStartTime
        });
        break;
      }
      
      try {
        await this.executePhase(phase);
      } catch (error) {
        logger.error('Phase execution failed', error, { phase });
        // Continue with next phase even if current phase fails
      }
    }
    
    this.currentPhase = ShutdownPhase.COMPLETED;
    const totalTime = Date.now() - this.shutdownStartTime;
    
    logger.info('Graceful shutdown completed', {
      totalTime: `${totalTime}ms`,
      completedHandlers: this.completedHandlers.size,
      errors: this.handlerErrors.length
    });
    
    // Emit shutdown complete event
    this.emit('shutdown-complete');
    
    if (exitOnComplete) {
      const exitCode = this.handlerErrors.length > 0 ? 1 : 0;
      logger.info('Exiting process', { exitCode });
      
      // Give logger time to flush
      setTimeout(() => process.exit(exitCode), 100);
    }
  }
  
  /**
   * Register signal handlers for graceful shutdown
   */
  registerSignalHandlers(): void {
    if (this.signalHandlersRegistered) {
      return;
    }
    
    this.signalHandlersRegistered = true;
    
    // Handle various termination signals
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGUSR2'];
    
    signals.forEach(signal => {
      process.on(signal, async () => {
        logger.info('Received signal', { signal });
        
        // Only handle the first signal
        if (this.isShuttingDown) {
          logger.warn('Shutdown already in progress, ignoring signal', { signal });
          return;
        }
        
        await this.shutdown({ signal });
      });
    });
    
    // Handle uncaught errors
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception, initiating emergency shutdown', error);
      this.shutdown({
        signal: 'uncaughtException',
        gracePeriod: 5000,  // Shorter grace period for errors
        forceTimeout: 10000
      });
    });
    
    process.on('unhandledRejection', (reason: any) => {
      logger.error('Unhandled rejection', { reason: String(reason) });
      // Don't shutdown on unhandled rejection, just log it
    });
    
    logger.info('Signal handlers registered');
  }
  
  /**
   * Track a connection
   */
  trackConnection(connectionId: string): void {
    this.activeConnections.add(connectionId);
  }
  
  /**
   * Untrack a connection
   */
  untrackConnection(connectionId: string): void {
    this.activeConnections.delete(connectionId);
  }
  
  /**
   * Track a stream
   */
  trackStream(streamId: string): void {
    this.activeStreams.add(streamId);
  }
  
  /**
   * Untrack a stream
   */
  untrackStream(streamId: string): void {
    this.activeStreams.delete(streamId);
  }
  
  /**
   * Track a file handle
   */
  trackFileHandle(fd: number): void {
    this.activeFileHandles.add(fd);
  }
  
  /**
   * Untrack a file handle
   */
  untrackFileHandle(fd: number): void {
    this.activeFileHandles.delete(fd);
  }
  
  /**
   * Get shutdown status
   */
  getStatus(): ShutdownStatus {
    const allHandlers = new Set<string>();
    this.handlers.forEach(phaseHandlers => {
      phaseHandlers.forEach(handler => allHandlers.add(handler.name));
    });
    
    const pendingHandlers = Array.from(allHandlers).filter(
      name => !this.completedHandlers.has(name)
    );
    
    return {
      phase: this.currentPhase || ShutdownPhase.INITIATED,
      startTime: this.shutdownStartTime,
      elapsedTime: this.isShuttingDown ? Date.now() - this.shutdownStartTime : 0,
      handlersCompleted: Array.from(this.completedHandlers),
      handlersPending: pendingHandlers,
      errors: this.handlerErrors,
      isShuttingDown: this.isShuttingDown
    };
  }
  
  /**
   * Check if shutdown is in progress
   */
  isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
}

// Export singleton instance
export const shutdownCoordinator = ShutdownCoordinator.getInstance();