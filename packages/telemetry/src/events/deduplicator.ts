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
  windowMs = 1000
): DeduplicatorResult {
  const seen = new Map<string, number>();
  
  // Clean old entries periodically
  const intervalId = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [key, timestamp] of seen.entries()) {
      if (timestamp < cutoff) {
        seen.delete(key);
      }
    }
  }, windowMs);
  
  const transformer: EventTransformer = (event) => {
    const key = keyGenerator(event);
    const lastSeen = seen.get(key);
    
    if (lastSeen && Date.now() - lastSeen < windowMs) {
      return null; // Duplicate
    }
    
    seen.set(key, Date.now());
    return event;
  };
  
  const cleanup = () => {
    clearInterval(intervalId);
    seen.clear();
  };
  
  return { transformer, cleanup };
}