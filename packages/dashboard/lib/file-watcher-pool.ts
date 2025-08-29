import chokidar, { FSWatcher } from 'chokidar';
import { EventEmitter } from 'events';
import path from 'path';

interface WatcherInfo {
  watcher: FSWatcher;
  refCount: number;
  sessions: Set<string>;
  lastActivity: number;
}

interface FileChangeEvent {
  filepath: string;
  event: 'add' | 'change' | 'unlink';
  stats?: any;
}

/**
 * FileWatcherPool manages shared file watchers to reduce resource usage
 * 
 * Features:
 * - One watcher per file instead of per session
 * - Reference counting for cleanup
 * - Event distribution to multiple listeners
 * - Automatic cleanup of unused watchers
 * - Resource limits to prevent memory leaks
 * - Circuit breaker pattern for watcher creation
 */
export class FileWatcherPool extends EventEmitter {
  private static instance: FileWatcherPool;
  private watchers = new Map<string, WatcherInfo>();
  private sessionSubscriptions = new Map<string, Set<string>>(); // sessionId -> Set of file paths
  private operationLocks = new Map<string, Promise<void>>(); // path -> operation promise
  
  // Orphan detection tracking
  private sessionLastSeen = new Map<string, number>(); // sessionId -> timestamp
  private subscriptionMetrics = {
    totalSubscriptions: 0,
    orphanedSubscriptions: 0,
    cleanupOperations: 0,
    failedCleanups: 0
  };
  
  // Resource limits to prevent memory exhaustion
  private static readonly MAX_WATCHERS = 100;
  private static readonly MAX_SESSIONS_PER_WATCHER = 50;
  private static readonly MAX_TOTAL_SESSIONS = 1000;
  
  private static readonly CLEANUP_INTERVAL = 60000; // 1 minute
  private static readonly IDLE_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private static readonly ORPHAN_TIMEOUT = 10 * 60 * 1000; // 10 minutes
  private cleanupTimer?: NodeJS.Timeout;
  private orphanCheckTimer?: NodeJS.Timeout;
  
  // Circuit breaker for watcher creation
  private failureCount = 0;
  private lastFailureTime = 0;
  private static readonly FAILURE_THRESHOLD = 5;
  private static readonly RESET_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  
  private constructor() {
    super();
    this.startCleanupTimer();
    this.startOrphanDetection();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): FileWatcherPool {
    if (!FileWatcherPool.instance) {
      FileWatcherPool.instance = new FileWatcherPool();
    }
    return FileWatcherPool.instance;
  }
  
  /**
   * Subscribe a session to file changes
   * @param sessionId - Session ID
   * @param filepath - File to watch
   * @param callback - Callback for file changes
   */
  async subscribe(
    sessionId: string,
    filepath: string,
    callback: (event: FileChangeEvent) => void
  ): Promise<void> {
    const normalizedPath = path.resolve(filepath);
    
    // Wait for any pending operations on this path
    const existingOperation = this.operationLocks.get(normalizedPath);
    if (existingOperation) {
      await existingOperation;
    }
    
    // Create a lock for this operation
    const operationPromise = this.performSubscribe(sessionId, normalizedPath, callback);
    this.operationLocks.set(normalizedPath, operationPromise);
    
    try {
      await operationPromise;
    } finally {
      this.operationLocks.delete(normalizedPath);
    }
  }
  
  private async performSubscribe(
    sessionId: string,
    normalizedPath: string,
    callback: (event: FileChangeEvent) => void
  ): Promise<void> {
    // Check resource limits
    await this.enforceResourceLimits(sessionId, normalizedPath);
    
    // Check circuit breaker
    if (!this.canCreateWatcher()) {
      throw new Error('Watcher creation temporarily disabled due to failures');
    }
    
    // Track session subscription
    if (!this.sessionSubscriptions.has(sessionId)) {
      this.sessionSubscriptions.set(sessionId, new Set());
      this.subscriptionMetrics.totalSubscriptions++;
    }
    this.sessionSubscriptions.get(sessionId)!.add(normalizedPath);
    
    // Update last seen time for orphan detection
    this.sessionLastSeen.set(sessionId, Date.now());
    
    // Get or create watcher
    let watcherInfo = this.watchers.get(normalizedPath);
    
    if (!watcherInfo) {
      console.log(`[FileWatcherPool] Creating new watcher for ${normalizedPath}`);
      
      try {
        // Create new watcher with optimized settings
        const watcher = chokidar.watch(normalizedPath, {
          persistent: true,
          usePolling: true,        // Use polling for reliability
          interval: 250,           // Poll every 250ms (reduced from 50ms)
          binaryInterval: 300,     // Check binary files less frequently
          awaitWriteFinish: {      // Wait for writes to finish
            stabilityThreshold: 100, // Wait 100ms for file to be stable
            pollInterval: 25         // Check every 25ms during write
          },
          ignoreInitial: true,     // Don't trigger on initial scan
          atomic: true,            // Handle atomic writes properly
          alwaysStat: false        // Don't always stat (performance)
        });
        
        // Set up event handlers with proper error handling
        watcher.on('add', (path, stats) => {
          try {
            this.handleFileEvent(normalizedPath, 'add', path, stats);
          } catch (error) {
            console.error(`[FileWatcherPool] Error handling add event:`, error);
            this.recordFailure();
          }
        });
        
        watcher.on('change', (path, stats) => {
          try {
            this.handleFileEvent(normalizedPath, 'change', path, stats);
          } catch (error) {
            console.error(`[FileWatcherPool] Error handling change event:`, error);
            this.recordFailure();
          }
        });
        
        watcher.on('unlink', path => {
          try {
            this.handleFileEvent(normalizedPath, 'unlink', path);
          } catch (error) {
            console.error(`[FileWatcherPool] Error handling unlink event:`, error);
            this.recordFailure();
          }
        });
        
        watcher.on('error', error => {
          console.error(`[FileWatcherPool] Watcher error for ${normalizedPath}:`, error);
          this.recordFailure();
          this.emit('error', { filepath: normalizedPath, error });
          
          // Auto-cleanup on persistent errors
          this.cleanupWatcher(normalizedPath).catch(cleanupError => {
            console.error(`[FileWatcherPool] Failed to cleanup errored watcher:`, cleanupError);
          });
        });
        
        watcherInfo = {
          watcher,
          refCount: 0,
          sessions: new Set(),
          lastActivity: Date.now()
        };
        
        this.watchers.set(normalizedPath, watcherInfo);
        this.resetFailureCount(); // Reset failure count on successful creation
        
      } catch (error) {
        this.recordFailure();
        throw new Error(`Failed to create watcher for ${normalizedPath}: ${error}`);
      }
    }
    
    // Increment reference count and add session
    watcherInfo.refCount++;
    watcherInfo.sessions.add(sessionId);
    watcherInfo.lastActivity = Date.now();
    
    // Register callback for this session
    const eventName = this.getEventName(sessionId, normalizedPath);
    this.on(eventName, callback);
    
    console.log(`[FileWatcherPool] Session ${sessionId} subscribed to ${normalizedPath} (refCount: ${watcherInfo.refCount})`);
  }
  
  /**
   * Unsubscribe a session from file changes
   * @param sessionId - Session ID
   * @param filepath - File to stop watching (optional, unsubscribes from all if not provided)
   */
  async unsubscribe(sessionId: string, filepath?: string): Promise<void> {
    const subscriptions = this.sessionSubscriptions.get(sessionId);
    if (!subscriptions) {
      return;
    }
    
    const pathsToUnsubscribe = filepath 
      ? [path.resolve(filepath)]
      : Array.from(subscriptions);
    
    // Process each path with locking to prevent race conditions
    for (const normalizedPath of pathsToUnsubscribe) {
      // Wait for any pending operations on this path
      const existingOperation = this.operationLocks.get(normalizedPath);
      if (existingOperation) {
        await existingOperation;
      }
      
      // Create a lock for this operation
      const operationPromise = this.performUnsubscribe(sessionId, normalizedPath);
      this.operationLocks.set(normalizedPath, operationPromise);
      
      try {
        await operationPromise;
      } finally {
        this.operationLocks.delete(normalizedPath);
      }
    }
    
    // Clean up session if no more subscriptions
    if (subscriptions.size === 0) {
      this.sessionSubscriptions.delete(sessionId);
      this.sessionLastSeen.delete(sessionId);
      this.subscriptionMetrics.totalSubscriptions--;
    }
  }
  
  private async performUnsubscribe(sessionId: string, normalizedPath: string): Promise<void> {
    const subscriptions = this.sessionSubscriptions.get(sessionId);
    if (!subscriptions) {
      return;
    }
    
    const watcherInfo = this.watchers.get(normalizedPath);
    if (!watcherInfo) {
      return;
    }
    
    // Remove session from watcher
    watcherInfo.sessions.delete(sessionId);
    watcherInfo.refCount = Math.max(0, watcherInfo.refCount - 1);
    watcherInfo.lastActivity = Date.now();
    
    // Remove event listeners for this session
    const eventName = this.getEventName(sessionId, normalizedPath);
    this.removeAllListeners(eventName);
    
    // Update session subscriptions
    subscriptions.delete(normalizedPath);
    
    console.log(`[FileWatcherPool] Session ${sessionId} unsubscribed from ${normalizedPath} (refCount: ${watcherInfo.refCount})`);
    
    // Clean up watcher if no longer needed
    if (watcherInfo.refCount === 0) {
      await this.cleanupWatcher(normalizedPath);
    }
  }
  
  /**
   * Unsubscribe a session from all file watchers
   * @param sessionId - Session ID
   */
  async unsubscribeAll(sessionId: string): Promise<void> {
    await this.unsubscribe(sessionId);
  }
  
  /**
   * Update last seen time for a session to prevent it from being considered orphaned
   * @param sessionId - Session ID to mark as active
   */
  markSessionActive(sessionId: string): void {
    if (this.sessionSubscriptions.has(sessionId)) {
      this.sessionLastSeen.set(sessionId, Date.now());
    }
  }
  
  /**
   * Handle file events from chokidar
   */
  private handleFileEvent(
    watchedPath: string,
    event: 'add' | 'change' | 'unlink',
    filepath: string,
    stats?: any
  ): void {
    const watcherInfo = this.watchers.get(watchedPath);
    if (!watcherInfo) {
      return;
    }
    
    watcherInfo.lastActivity = Date.now();
    
    // Emit event to all sessions watching this file
    for (const sessionId of watcherInfo.sessions) {
      const eventName = this.getEventName(sessionId, watchedPath);
      this.emit(eventName, {
        filepath,
        event,
        stats
      } as FileChangeEvent);
    }
  }
  
  /**
   * Get event name for session/file combination
   */
  private getEventName(sessionId: string, filepath: string): string {
    return `file:${sessionId}:${filepath}`;
  }
  
  /**
   * Clean up a specific watcher
   */
  private async cleanupWatcher(filepath: string): Promise<void> {
    const watcherInfo = this.watchers.get(filepath);
    if (!watcherInfo) {
      return;
    }
    
    console.log(`[FileWatcherPool] Cleaning up watcher for ${filepath}`);
    
    try {
      await watcherInfo.watcher.close();
    } catch (error) {
      console.error(`[FileWatcherPool] Error closing watcher for ${filepath}:`, error);
    }
    
    this.watchers.delete(filepath);
  }
  
  /**
   * Start periodic cleanup of idle watchers
   */
  private startCleanupTimer(): void {
    if (this.cleanupTimer) {
      return;
    }
    
    this.cleanupTimer = setInterval(() => {
      this.cleanupIdleWatchers();
    }, FileWatcherPool.CLEANUP_INTERVAL);
  }
  
  /**
   * Start orphan detection for abandoned sessions
   */
  private startOrphanDetection(): void {
    if (this.orphanCheckTimer) {
      return;
    }
    
    this.orphanCheckTimer = setInterval(() => {
      this.detectOrphanedSessions().catch(error => {
        console.error('[FileWatcherPool] Error during orphan detection:', error);
      });
    }, FileWatcherPool.CLEANUP_INTERVAL * 2); // Check every 2 minutes
  }
  
  /**
   * Clean up idle watchers
   */
  private async cleanupIdleWatchers(): Promise<void> {
    const now = Date.now();
    const pathsToCleanup: string[] = [];
    
    for (const [filepath, watcherInfo] of this.watchers) {
      // Clean up watchers with no references that have been idle
      if (watcherInfo.refCount === 0 && 
          now - watcherInfo.lastActivity > FileWatcherPool.IDLE_TIMEOUT) {
        pathsToCleanup.push(filepath);
      }
    }
    
    for (const filepath of pathsToCleanup) {
      await this.cleanupWatcher(filepath);
    }
    
    if (pathsToCleanup.length > 0) {
      console.log(`[FileWatcherPool] Cleaned up ${pathsToCleanup.length} idle watchers`);
    }
  }
  
  /**
   * Detect and clean up orphaned sessions
   */
  private async detectOrphanedSessions(): Promise<void> {
    const now = Date.now();
    const orphanedSessions: string[] = [];
    
    // Check all sessions for orphan status
    for (const [sessionId, lastSeen] of this.sessionLastSeen) {
      if (now - lastSeen > FileWatcherPool.ORPHAN_TIMEOUT) {
        orphanedSessions.push(sessionId);
      }
    }
    
    // Clean up orphaned sessions
    for (const sessionId of orphanedSessions) {
      try {
        console.warn(`[FileWatcherPool] Detected orphaned session ${sessionId}, cleaning up`);
        this.subscriptionMetrics.cleanupOperations++;
        this.subscriptionMetrics.orphanedSubscriptions++;
        
        await this.unsubscribeAll(sessionId);
        
      } catch (error) {
        console.error(`[FileWatcherPool] Failed to cleanup orphaned session ${sessionId}:`, error);
        this.subscriptionMetrics.failedCleanups++;
      }
    }
    
    if (orphanedSessions.length > 0) {
      console.log(`[FileWatcherPool] Cleaned up ${orphanedSessions.length} orphaned sessions`);
    }
  }
  
  /**
   * Get statistics about the watcher pool
   */
  getStats(): {
    totalWatchers: number;
    totalSessions: number;
    metrics: {
      totalSubscriptions: number;
      orphanedSubscriptions: number;
      cleanupOperations: number;
      failedCleanups: number;
    };
    orphanCandidates: Array<{
      sessionId: string;
      timeSinceLastSeen: number;
      subscriptionCount: number;
    }>;
    watcherDetails: Array<{
      filepath: string;
      refCount: number;
      sessions: string[];
      idleTime: number;
    }>;
  } {
    const now = Date.now();
    
    // Find sessions that might become orphaned soon
    const orphanCandidates = Array.from(this.sessionLastSeen.entries())
      .map(([sessionId, lastSeen]) => ({
        sessionId,
        timeSinceLastSeen: now - lastSeen,
        subscriptionCount: this.sessionSubscriptions.get(sessionId)?.size || 0
      }))
      .filter(candidate => candidate.timeSinceLastSeen > FileWatcherPool.ORPHAN_TIMEOUT * 0.7) // 70% threshold
      .sort((a, b) => b.timeSinceLastSeen - a.timeSinceLastSeen);
    
    return {
      totalWatchers: this.watchers.size,
      totalSessions: this.sessionSubscriptions.size,
      metrics: { ...this.subscriptionMetrics },
      orphanCandidates,
      watcherDetails: Array.from(this.watchers.entries()).map(([filepath, info]) => ({
        filepath,
        refCount: info.refCount,
        sessions: Array.from(info.sessions),
        idleTime: now - info.lastActivity
      }))
    };
  }
  
  /**
   * Enforce resource limits to prevent memory exhaustion
   */
  private async enforceResourceLimits(sessionId: string, filepath: string): Promise<void> {
    // Check total number of watchers
    if (this.watchers.size >= FileWatcherPool.MAX_WATCHERS) {
      // Try to clean up idle watchers first
      await this.cleanupIdleWatchers();
      
      if (this.watchers.size >= FileWatcherPool.MAX_WATCHERS) {
        throw new Error(`Maximum number of watchers (${FileWatcherPool.MAX_WATCHERS}) exceeded`);
      }
    }
    
    // Check total number of sessions
    const totalSessions = Array.from(this.sessionSubscriptions.values())
      .reduce((total, sessions) => total + sessions.size, 0);
    
    if (totalSessions >= FileWatcherPool.MAX_TOTAL_SESSIONS) {
      throw new Error(`Maximum number of total sessions (${FileWatcherPool.MAX_TOTAL_SESSIONS}) exceeded`);
    }
    
    // Check sessions per watcher
    const existingWatcher = this.watchers.get(filepath);
    if (existingWatcher && existingWatcher.sessions.size >= FileWatcherPool.MAX_SESSIONS_PER_WATCHER) {
      throw new Error(`Maximum number of sessions per watcher (${FileWatcherPool.MAX_SESSIONS_PER_WATCHER}) exceeded for ${filepath}`);
    }
  }
  
  /**
   * Check if we can create a new watcher (circuit breaker pattern)
   */
  private canCreateWatcher(): boolean {
    const now = Date.now();
    
    // Reset failure count if enough time has passed
    if (now - this.lastFailureTime > FileWatcherPool.RESET_TIMEOUT) {
      this.failureCount = 0;
    }
    
    return this.failureCount < FileWatcherPool.FAILURE_THRESHOLD;
  }
  
  /**
   * Record a failure for circuit breaker
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= FileWatcherPool.FAILURE_THRESHOLD) {
      console.warn(`[FileWatcherPool] Circuit breaker activated after ${this.failureCount} failures`);
    }
  }
  
  /**
   * Reset failure count after successful operation
   */
  private resetFailureCount(): void {
    if (this.failureCount > 0) {
      console.log(`[FileWatcherPool] Circuit breaker reset after successful operation`);
      this.failureCount = 0;
    }
  }

  /**
   * Shutdown the watcher pool
   */
  async shutdown(): Promise<void> {
    console.log('[FileWatcherPool] Shutting down...');
    
    // Stop cleanup timers
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    
    if (this.orphanCheckTimer) {
      clearInterval(this.orphanCheckTimer);
      this.orphanCheckTimer = undefined;
    }
    
    // Close all watchers with timeout protection
    const closePromises: Promise<void>[] = [];
    for (const [filepath] of this.watchers) {
      closePromises.push(
        Promise.race([
          this.cleanupWatcher(filepath),
          new Promise<void>((_, reject) => 
            setTimeout(() => reject(new Error(`Timeout cleaning up ${filepath}`)), 5000)
          )
        ]).catch(error => {
          console.error(`[FileWatcherPool] Failed to cleanup ${filepath}:`, error);
        })
      );
    }
    
    await Promise.allSettled(closePromises);
    
    // Clear all subscriptions
    this.sessionSubscriptions.clear();
    
    // Remove all event listeners
    this.removeAllListeners();
    
    console.log('[FileWatcherPool] Shutdown complete');
  }
}

// Export singleton instance getter
export const getFileWatcherPool = () => FileWatcherPool.getInstance();