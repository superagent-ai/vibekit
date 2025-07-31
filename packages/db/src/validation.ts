import { ValidationError } from './errors';
import type { 
  TelemetryQueryFilter, 
  NewTelemetryEvent, 
  NewTelemetrySession,
  SessionQueryFilter,
  EventType,
  SessionStatus 
} from './types';

/**
 * Validate query filter parameters
 */
export function validateQueryFilter(filter: TelemetryQueryFilter): void {
  if (filter.limit !== undefined) {
    if (typeof filter.limit !== 'number' || filter.limit < 1 || filter.limit > 10000) {
      throw new ValidationError('Query limit must be between 1 and 10000', 'limit', filter.limit);
    }
  }

  if (filter.offset !== undefined) {
    if (typeof filter.offset !== 'number' || filter.offset < 0) {
      throw new ValidationError('Query offset must be non-negative', 'offset', filter.offset);
    }
  }

  if (filter.from !== undefined) {
    if (typeof filter.from !== 'number' || filter.from < 0) {
      throw new ValidationError('From time must be a positive timestamp', 'from', filter.from);
    }
  }

  if (filter.to !== undefined) {
    if (typeof filter.to !== 'number' || filter.to < 0) {
      throw new ValidationError('To time must be a positive timestamp', 'to', filter.to);
    }
    
    if (filter.from && filter.to <= filter.from) {
      throw new ValidationError('To time must be after from time');
    }
  }

  if (filter.eventType && !isValidEventType(filter.eventType)) {
    throw new ValidationError('Invalid event type', 'eventType', filter.eventType);
  }

  if (filter.sessionId && !isValidUUID(filter.sessionId)) {
    throw new ValidationError('Invalid session ID format', 'sessionId', filter.sessionId);
  }
}

/**
 * Validate new event data
 */
export function validateNewEvent(event: NewTelemetryEvent): void {
  if (!event.sessionId || !isValidUUID(event.sessionId)) {
    throw new ValidationError('Valid session ID is required', 'sessionId', event.sessionId);
  }

  if (!event.eventType || !isValidEventType(event.eventType)) {
    throw new ValidationError('Valid event type is required', 'eventType', event.eventType);
  }

  if (!event.agentType || event.agentType.trim().length === 0) {
    throw new ValidationError('Agent type is required', 'agentType', event.agentType);
  }

  if (!event.mode || event.mode.trim().length === 0) {
    throw new ValidationError('Mode is required', 'mode', event.mode);
  }

  if (!event.prompt || event.prompt.trim().length === 0) {
    throw new ValidationError('Prompt is required', 'prompt', event.prompt);
  }

  if (event.timestamp !== undefined && (typeof event.timestamp !== 'number' || event.timestamp < 0)) {
    throw new ValidationError('Timestamp must be a positive number', 'timestamp', event.timestamp);
  }
}

/**
 * Validate new session data
 */
export function validateNewSession(session: NewTelemetrySession): void {
  if (!session.id || !isValidUUID(session.id)) {
    throw new ValidationError('Valid session ID is required', 'id', session.id);
  }

  if (!session.agentType || session.agentType.trim().length === 0) {
    throw new ValidationError('Agent type is required', 'agentType', session.agentType);
  }

  if (!session.mode || session.mode.trim().length === 0) {
    throw new ValidationError('Mode is required', 'mode', session.mode);
  }

  if (!session.status || !isValidSessionStatus(session.status)) {
    throw new ValidationError('Valid session status is required', 'status', session.status);
  }

  if (typeof session.startTime !== 'number' || session.startTime < 0) {
    throw new ValidationError('Start time must be a positive timestamp', 'startTime', session.startTime);
  }

  if (session.endTime !== undefined && session.endTime !== null) {
    if (typeof session.endTime !== 'number' || session.endTime < 0) {
      throw new ValidationError('End time must be a positive timestamp', 'endTime', session.endTime);
    }
    
    if (session.endTime <= session.startTime) {
      throw new ValidationError('End time must be after start time');
    }
  }
}

/**
 * Check if a string is a valid UUID
 */
function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Check if event type is valid
 */
function isValidEventType(type: string): type is EventType {
  return ['start', 'stream', 'end', 'error'].includes(type);
}

/**
 * Check if session status is valid
 */
function isValidSessionStatus(status: string): status is SessionStatus {
  return ['active', 'completed', 'failed', 'timeout'].includes(status);
}

/**
 * Sanitize string input to prevent SQL injection
 */
export function sanitizeString(input: string): string {
  // Remove any SQL meta-characters
  return input.replace(/['";\\]/g, '');
}

/**
 * Validate pagination parameters
 */
export function validatePagination(limit?: number, offset?: number): void {
  if (limit !== undefined) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000) {
      throw new ValidationError('Limit must be an integer between 1 and 10000', 'limit', limit);
    }
  }

  if (offset !== undefined) {
    if (!Number.isInteger(offset) || offset < 0) {
      throw new ValidationError('Offset must be a non-negative integer', 'offset', offset);
    }
  }
}

/**
 * Validate session query filter
 */
export function validateSessionQueryFilter(filter: SessionQueryFilter): void {
  if (filter.from !== undefined) {
    if (typeof filter.from !== 'number' || filter.from < 0) {
      throw new ValidationError('From time must be a positive timestamp', 'from', filter.from);
    }
  }

  if (filter.to !== undefined) {
    if (typeof filter.to !== 'number' || filter.to < 0) {
      throw new ValidationError('To time must be a positive timestamp', 'to', filter.to);
    }
    
    if (filter.from && filter.to <= filter.from) {
      throw new ValidationError('To time must be after from time');
    }
  }

  if (filter.status && Array.isArray(filter.status)) {
    filter.status.forEach(status => {
      if (!isValidSessionStatus(status)) {
        throw new ValidationError('Invalid session status', 'status', status);
      }
    });
  } else if (filter.status && !isValidSessionStatus(filter.status)) {
    throw new ValidationError('Invalid session status', 'status', filter.status);
  }

  if (filter.minDuration !== undefined) {
    if (typeof filter.minDuration !== 'number' || filter.minDuration < 0) {
      throw new ValidationError('Min duration must be non-negative', 'minDuration', filter.minDuration);
    }
  }

  if (filter.maxDuration !== undefined) {
    if (typeof filter.maxDuration !== 'number' || filter.maxDuration < 0) {
      throw new ValidationError('Max duration must be non-negative', 'maxDuration', filter.maxDuration);
    }
    
    if (filter.minDuration && filter.maxDuration < filter.minDuration) {
      throw new ValidationError('Max duration must be greater than min duration');
    }
  }

  if (filter.minEventCount !== undefined) {
    if (typeof filter.minEventCount !== 'number' || filter.minEventCount < 0) {
      throw new ValidationError('Min event count must be non-negative', 'minEventCount', filter.minEventCount);
    }
  }

  if (filter.maxEventCount !== undefined) {
    if (typeof filter.maxEventCount !== 'number' || filter.maxEventCount < 0) {
      throw new ValidationError('Max event count must be non-negative', 'maxEventCount', filter.maxEventCount);
    }
    
    if (filter.minEventCount && filter.maxEventCount < filter.minEventCount) {
      throw new ValidationError('Max event count must be greater than min event count');
    }
  }

  validatePagination(filter.limit, filter.offset);
}