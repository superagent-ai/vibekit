import type { TelemetryEvent } from '../core/types.js';
import { EventEmitter } from 'events';

export interface ReplayOptions {
  speed?: number; // Playback speed multiplier (1 = realtime, 2 = 2x speed)
  startTime?: number; // Start replay from this timestamp
  endTime?: number; // End replay at this timestamp
  filter?: (event: TelemetryEvent) => boolean;
  loop?: boolean; // Loop playback
  preserveTiming?: boolean; // Preserve original timing between events
}

export interface ReplayState {
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  currentTime: number;
  totalEvents: number;
  processedEvents: number;
  startTime: number;
  endTime: number;
  duration: number;
  elapsedTime: number;
}

export class EventReplay extends EventEmitter {
  private events: TelemetryEvent[] = [];
  private filteredEvents: TelemetryEvent[] = [];
  private options: Required<ReplayOptions>;
  private state: ReplayState;
  private replayTimer?: NodeJS.Timeout;
  private pausedAt?: number;
  private startedAt?: number;
  
  constructor(events: TelemetryEvent[], options: ReplayOptions = {}) {
    super();
    
    // Sort events by timestamp
    this.events = [...events].sort((a, b) => a.timestamp - b.timestamp);
    
    this.options = {
      speed: options.speed || 1,
      startTime: options.startTime || (this.events[0]?.timestamp || 0),
      endTime: options.endTime || (this.events[this.events.length - 1]?.timestamp || 0),
      filter: options.filter || (() => true),
      loop: options.loop || false,
      preserveTiming: options.preserveTiming !== false,
    };
    
    // Apply filters
    this.filteredEvents = this.events.filter(event => 
      event.timestamp >= this.options.startTime &&
      event.timestamp <= this.options.endTime &&
      this.options.filter(event)
    );
    
    // Initialize state
    this.state = {
      isPlaying: false,
      isPaused: false,
      currentIndex: 0,
      currentTime: this.options.startTime,
      totalEvents: this.filteredEvents.length,
      processedEvents: 0,
      startTime: this.options.startTime,
      endTime: this.options.endTime,
      duration: this.options.endTime - this.options.startTime,
      elapsedTime: 0,
    };
  }
  
  /**
   * Start or resume replay
   */
  play(): void {
    if (this.state.isPlaying && !this.state.isPaused) {
      return; // Already playing
    }
    
    if (this.state.isPaused) {
      // Resume from pause
      this.state.isPaused = false;
      this.emit('resumed', this.state);
    } else {
      // Start from beginning or current position
      this.state.isPlaying = true;
      this.startedAt = Date.now();
      
      if (this.state.currentIndex >= this.filteredEvents.length) {
        this.state.currentIndex = 0;
        this.state.processedEvents = 0;
      }
      
      this.emit('started', this.state);
    }
    
    this.scheduleNextEvent();
  }
  
  /**
   * Pause replay
   */
  pause(): void {
    if (!this.state.isPlaying || this.state.isPaused) {
      return;
    }
    
    this.state.isPaused = true;
    this.pausedAt = Date.now();
    
    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = undefined;
    }
    
    this.emit('paused', this.state);
  }
  
  /**
   * Stop replay
   */
  stop(): void {
    if (!this.state.isPlaying) {
      return;
    }
    
    this.state.isPlaying = false;
    this.state.isPaused = false;
    this.state.currentIndex = 0;
    this.state.processedEvents = 0;
    this.state.elapsedTime = 0;
    
    if (this.replayTimer) {
      clearTimeout(this.replayTimer);
      this.replayTimer = undefined;
    }
    
    this.emit('stopped', this.state);
  }
  
  /**
   * Seek to a specific time
   */
  seek(timestamp: number): void {
    if (timestamp < this.options.startTime || timestamp > this.options.endTime) {
      throw new Error('Timestamp out of range');
    }
    
    // Find the index of the first event at or after the timestamp
    let index = 0;
    for (let i = 0; i < this.filteredEvents.length; i++) {
      if (this.filteredEvents[i].timestamp >= timestamp) {
        index = i;
        break;
      }
    }
    
    this.state.currentIndex = index;
    this.state.currentTime = timestamp;
    this.state.processedEvents = index;
    
    this.emit('seeked', this.state);
    
    // If playing, reschedule
    if (this.state.isPlaying && !this.state.isPaused) {
      if (this.replayTimer) {
        clearTimeout(this.replayTimer);
      }
      this.scheduleNextEvent();
    }
  }
  
  /**
   * Skip to next event
   */
  next(): void {
    if (this.state.currentIndex >= this.filteredEvents.length - 1) {
      if (this.options.loop) {
        this.state.currentIndex = 0;
      } else {
        return;
      }
    } else {
      this.state.currentIndex++;
    }
    
    const event = this.filteredEvents[this.state.currentIndex];
    if (event) {
      this.emitEvent(event);
    }
  }
  
  /**
   * Skip to previous event
   */
  previous(): void {
    if (this.state.currentIndex <= 0) {
      return;
    }
    
    this.state.currentIndex--;
    const event = this.filteredEvents[this.state.currentIndex];
    if (event) {
      this.emitEvent(event);
    }
  }
  
  /**
   * Get current replay state
   */
  getState(): ReplayState {
    return { ...this.state };
  }
  
  /**
   * Set playback speed
   */
  setSpeed(speed: number): void {
    if (speed <= 0) {
      throw new Error('Speed must be positive');
    }
    
    this.options.speed = speed;
    
    // If playing, reschedule with new speed
    if (this.state.isPlaying && !this.state.isPaused) {
      if (this.replayTimer) {
        clearTimeout(this.replayTimer);
      }
      this.scheduleNextEvent();
    }
  }
  
  /**
   * Update filter and re-filter events
   */
  setFilter(filter: (event: TelemetryEvent) => boolean): void {
    this.options.filter = filter;
    
    // Re-filter events
    this.filteredEvents = this.events.filter(event => 
      event.timestamp >= this.options.startTime &&
      event.timestamp <= this.options.endTime &&
      this.options.filter(event)
    );
    
    // Update state
    this.state.totalEvents = this.filteredEvents.length;
    
    // Reset if current index is out of bounds
    if (this.state.currentIndex >= this.filteredEvents.length) {
      this.state.currentIndex = 0;
    }
    
    this.emit('filtered', this.state);
  }
  
  /**
   * Export current filtered events
   */
  exportEvents(): TelemetryEvent[] {
    return [...this.filteredEvents];
  }
  
  private scheduleNextEvent(): void {
    if (!this.state.isPlaying || this.state.isPaused) {
      return;
    }
    
    if (this.state.currentIndex >= this.filteredEvents.length) {
      if (this.options.loop) {
        this.state.currentIndex = 0;
        this.state.processedEvents = 0;
        this.emit('looped', this.state);
      } else {
        this.complete();
        return;
      }
    }
    
    const currentEvent = this.filteredEvents[this.state.currentIndex];
    
    if (this.options.preserveTiming && this.state.currentIndex > 0) {
      const previousEvent = this.filteredEvents[this.state.currentIndex - 1];
      const delay = (currentEvent.timestamp - previousEvent.timestamp) / this.options.speed;
      
      this.replayTimer = setTimeout(() => {
        this.emitEvent(currentEvent);
        this.state.currentIndex++;
        this.scheduleNextEvent();
      }, Math.max(0, delay));
    } else {
      // Emit immediately
      this.emitEvent(currentEvent);
      this.state.currentIndex++;
      
      // Schedule next with minimal delay
      this.replayTimer = setTimeout(() => {
        this.scheduleNextEvent();
      }, 10 / this.options.speed);
    }
  }
  
  private emitEvent(event: TelemetryEvent): void {
    this.state.processedEvents++;
    this.state.currentTime = event.timestamp;
    
    if (this.startedAt) {
      this.state.elapsedTime = (Date.now() - this.startedAt) / 1000;
    }
    
    // Create a copy to prevent modifications
    const eventCopy = { ...event };
    
    this.emit('event', eventCopy, this.state);
    
    // Emit specific event types
    this.emit(`event:${event.eventType}`, eventCopy, this.state);
    this.emit(`event:${event.category}`, eventCopy, this.state);
    this.emit(`event:${event.category}:${event.action}`, eventCopy, this.state);
  }
  
  private complete(): void {
    this.state.isPlaying = false;
    this.emit('completed', this.state);
    this.stop();
  }
}

/**
 * Replay session recorder for capturing and replaying event sequences
 */
export class ReplayRecorder {
  private sessions = new Map<string, TelemetryEvent[]>();
  private activeSession?: string;
  private isRecording = false;
  
  /**
   * Start recording a new session
   */
  startRecording(sessionId: string): void {
    if (this.isRecording) {
      throw new Error('Already recording');
    }
    
    this.activeSession = sessionId;
    this.sessions.set(sessionId, []);
    this.isRecording = true;
  }
  
  /**
   * Stop recording
   */
  stopRecording(): TelemetryEvent[] {
    if (!this.isRecording || !this.activeSession) {
      throw new Error('Not recording');
    }
    
    const events = this.sessions.get(this.activeSession) || [];
    this.isRecording = false;
    this.activeSession = undefined;
    
    return events;
  }
  
  /**
   * Record an event
   */
  record(event: TelemetryEvent): void {
    if (!this.isRecording || !this.activeSession) {
      return;
    }
    
    const events = this.sessions.get(this.activeSession);
    if (events) {
      events.push(event);
    }
  }
  
  /**
   * Get recorded session
   */
  getSession(sessionId: string): TelemetryEvent[] | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Delete a session
   */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
  
  /**
   * Get all session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
  
  /**
   * Create a replay from a session
   */
  createReplay(sessionId: string, options?: ReplayOptions): EventReplay {
    const events = this.sessions.get(sessionId);
    if (!events) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    return new EventReplay(events, options);
  }
  
  /**
   * Export session as JSON
   */
  exportSession(sessionId: string): string {
    const events = this.sessions.get(sessionId);
    if (!events) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    return JSON.stringify({
      sessionId,
      events,
      metadata: {
        recordedAt: new Date().toISOString(),
        eventCount: events.length,
        duration: events.length > 0 
          ? events[events.length - 1].timestamp - events[0].timestamp 
          : 0,
      },
    }, null, 2);
  }
  
  /**
   * Import session from JSON
   */
  importSession(json: string): string {
    const data = JSON.parse(json);
    if (!data.sessionId || !Array.isArray(data.events)) {
      throw new Error('Invalid session data');
    }
    
    this.sessions.set(data.sessionId, data.events);
    return data.sessionId;
  }
}