import type { TelemetryEvent } from '../core/types.js';
import type { EventTransformer } from './EventProcessor.js';

export interface DeduplicatorResult {
  transformer: EventTransformer;
  cleanup: () => void;
}

/**
 * Create a deduplicator that filters duplicate events within a time window
 */
export function createDeduplicator(
  keyGenerator: (event: TelemetryEvent) => string,
  windowMs = 1000,
  maxKeys = 10000 // Maximum number of keys to track
): DeduplicatorResult {
  const seen = new Map<string, number>();
  let operationCounter = 0;
  
  const cleanupOldEntries = () => {
    const cutoff = Date.now() - windowMs;
    const initialSize = seen.size;
    
    for (const [key, timestamp] of seen.entries()) {
      if (timestamp < cutoff) {
        seen.delete(key);
      }
    }
    
    // If still over limit after time-based cleanup, remove oldest entries
    if (seen.size > maxKeys) {
      const entries = Array.from(seen.entries()).sort((a, b) => a[1] - b[1]);
      const toRemove = seen.size - Math.floor(maxKeys * 0.8);
      
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        seen.delete(entries[i][0]);
      }
    }
    
    const removedCount = initialSize - seen.size;
    if (removedCount > 0) {
      console.warn(`[Deduplicator] Cleaned up ${removedCount} old entries, current size: ${seen.size}/${maxKeys}`);
    }
  };
  
  // Clean old entries periodically
  const intervalId = setInterval(cleanupOldEntries, windowMs);
  
  const transformer: EventTransformer = (event) => {
    const key = keyGenerator(event);
    const lastSeen = seen.get(key);
    
    if (lastSeen && Date.now() - lastSeen < windowMs) {
      return null; // Duplicate
    }
    
    seen.set(key, Date.now());
    operationCounter++;
    
    // Trigger cleanup every 1000 operations to prevent excessive growth
    if (operationCounter % 1000 === 0 || seen.size > maxKeys * 0.9) {
      cleanupOldEntries();
    }
    
    return event;
  };
  
  const cleanup = () => {
    clearInterval(intervalId);
    seen.clear();
  };
  
  return { transformer, cleanup };
}