import path from 'path';
import os from 'os';

/**
 * Security utilities for validating and sanitizing user inputs
 * 
 * This module provides functions to prevent path traversal attacks,
 * validate input parameters, and sanitize data for safe file operations.
 */

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates and sanitizes a file or directory name component
 * Prevents path traversal by rejecting dangerous patterns
 * 
 * @param input - The input string to validate
 * @param fieldName - Name of the field being validated (for error messages)
 * @returns Sanitized string if valid
 * @throws ValidationError if input is invalid
 */
export function validatePathComponent(input: string, fieldName = 'path component'): string {
  if (!input || typeof input !== 'string') {
    throw new ValidationError(`${fieldName} must be a non-empty string`, fieldName);
  }

  // Remove leading/trailing whitespace
  const trimmed = input.trim();
  
  if (!trimmed) {
    throw new ValidationError(`${fieldName} cannot be empty or only whitespace`, fieldName);
  }

  // Check for path traversal patterns
  const dangerousPatterns = [
    /\.\./,           // Parent directory traversal
    /\/\//,           // Double slashes
    /^\//,            // Absolute paths
    /\\\\|\/\//,     // Backslash or double slash patterns
    /\0/,             // Null bytes
    /[\x00-\x1f]/,    // Control characters
    /[<>:"|?*]/,      // Invalid filename characters on Windows
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmed)) {
      throw new ValidationError(`${fieldName} contains invalid characters or patterns`, fieldName);
    }
  }

  // Check for reserved names (Windows)
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 
                        'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 
                        'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  
  if (reservedNames.includes(trimmed.toUpperCase())) {
    throw new ValidationError(`${fieldName} cannot be a reserved system name`, fieldName);
  }

  // Additional length check
  if (trimmed.length > 255) {
    throw new ValidationError(`${fieldName} is too long (maximum 255 characters)`, fieldName);
  }

  return trimmed;
}

/**
 * Validates a session ID format
 * 
 * @param sessionId - The session ID to validate
 * @returns The validated session ID
 * @throws ValidationError if session ID is invalid
 */
export function validateSessionId(sessionId: string): string {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new ValidationError('Session ID must be a non-empty string', 'sessionId');
  }

  const trimmed = sessionId.trim();

  // Check for valid format (alphanumeric, dashes, underscores)
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new ValidationError('Session ID contains invalid characters', 'sessionId');
  }

  // Check length (should be reasonable for our short UUIDs or other formats)
  if (trimmed.length < 3 || trimmed.length > 50) {
    throw new ValidationError('Session ID length must be between 3 and 50 characters', 'sessionId');
  }

  return trimmed;
}

/**
 * Validates a project ID
 * 
 * @param projectId - The project ID to validate
 * @returns The validated project ID
 * @throws ValidationError if project ID is invalid
 */
export function validateProjectId(projectId: string): string {
  if (!projectId || typeof projectId !== 'string') {
    throw new ValidationError('Project ID must be a non-empty string', 'projectId');
  }

  const trimmed = projectId.trim();

  // Check for valid format
  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    throw new ValidationError('Project ID contains invalid characters', 'projectId');
  }

  if (trimmed.length < 1 || trimmed.length > 100) {
    throw new ValidationError('Project ID length must be between 1 and 100 characters', 'projectId');
  }

  return trimmed;
}

/**
 * Validates a date string in ISO format
 * 
 * @param dateStr - The date string to validate
 * @param fieldName - Name of the field being validated
 * @returns Validated Date object
 * @throws ValidationError if date is invalid
 */
export function validateISODate(dateStr: string, fieldName = 'date'): Date {
  if (!dateStr || typeof dateStr !== 'string') {
    throw new ValidationError(`${fieldName} must be a non-empty string`, fieldName);
  }

  const date = new Date(dateStr);
  
  if (isNaN(date.getTime())) {
    throw new ValidationError(`${fieldName} must be a valid ISO date string`, fieldName);
  }

  // Check if date is reasonable (not too far in the past or future)
  const now = Date.now();
  const minDate = now - (365 * 24 * 60 * 60 * 1000); // 1 year ago
  const maxDate = now + (365 * 24 * 60 * 60 * 1000);  // 1 year from now
  
  if (date.getTime() < minDate || date.getTime() > maxDate) {
    throw new ValidationError(`${fieldName} must be within a reasonable time range`, fieldName);
  }

  return date;
}

/**
 * Creates a safe file path within the VibeKit directory
 * Prevents path traversal by ensuring the resolved path stays within bounds
 * 
 * @param relativePath - Path relative to the VibeKit directory
 * @param subdir - Optional subdirectory within .vibekit (e.g., 'sessions', 'execution-history')
 * @returns Safe absolute path
 * @throws ValidationError if path is unsafe
 */
export function createSafeVibeKitPath(relativePath: string, subdir?: string): string {
  // Validate the relative path components
  const pathComponents = relativePath.split('/').filter(Boolean);
  
  for (const component of pathComponents) {
    validatePathComponent(component, 'path component');
  }

  // Validate subdirectory if provided
  if (subdir) {
    validatePathComponent(subdir, 'subdirectory');
  }

  // Build the safe path
  const vibekitDir = path.join(os.homedir(), '.vibekit');
  const targetDir = subdir ? path.join(vibekitDir, subdir) : vibekitDir;
  const safePath = path.join(targetDir, ...pathComponents);

  // Resolve to absolute path and check it's still within VibeKit directory
  const resolvedPath = path.resolve(safePath);
  const resolvedBaseDir = path.resolve(targetDir);

  if (!resolvedPath.startsWith(resolvedBaseDir + path.sep) && resolvedPath !== resolvedBaseDir) {
    throw new ValidationError('Path traversal detected - path must stay within VibeKit directory');
  }

  return resolvedPath;
}

/**
 * Validates a daily log filename (YYYY-MM-DD.jsonl format)
 * 
 * @param filename - The filename to validate
 * @returns Validated filename
 * @throws ValidationError if filename is invalid
 */
export function validateDailyLogFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    throw new ValidationError('Filename must be a non-empty string', 'filename');
  }

  // Check format: YYYY-MM-DD.jsonl
  const dailyLogPattern = /^\d{4}-\d{2}-\d{2}\.jsonl$/;
  
  if (!dailyLogPattern.test(filename)) {
    throw new ValidationError('Filename must be in format YYYY-MM-DD.jsonl', 'filename');
  }

  // Validate the date part
  const datePart = filename.substring(0, 10); // YYYY-MM-DD
  try {
    validateISODate(datePart + 'T00:00:00.000Z', 'date in filename');
  } catch (error) {
    throw new ValidationError('Invalid date in filename', 'filename');
  }

  return filename;
}

/**
 * Sanitizes user input for logging to prevent log injection
 * 
 * @param input - The input to sanitize
 * @returns Sanitized string safe for logging
 */
export function sanitizeForLogging(input: unknown): string {
  if (input == null) {
    return 'null';
  }

  let str = String(input);
  
  // Remove control characters and potential log injection patterns
  str = str.replace(/[\x00-\x1f\x7f-\x9f]/g, ''); // Control characters
  str = str.replace(/\r?\n/g, ' '); // Line breaks
  str = str.replace(/\t/g, ' '); // Tabs
  
  // Limit length to prevent log pollution
  if (str.length > 500) {
    str = str.substring(0, 500) + '...';
  }

  return str;
}

/**
 * Validates pagination parameters
 * 
 * @param limit - Maximum number of items to return
 * @param offset - Number of items to skip
 * @returns Validated pagination parameters
 * @throws ValidationError if parameters are invalid
 */
export function validatePagination(limit?: string | number, offset?: string | number): { limit: number; offset: number } {
  let validatedLimit = 100; // Default limit
  let validatedOffset = 0;  // Default offset

  if (limit !== undefined) {
    const numLimit = typeof limit === 'string' ? parseInt(limit, 10) : limit;
    
    if (isNaN(numLimit) || numLimit < 1 || numLimit > 1000) {
      throw new ValidationError('Limit must be a number between 1 and 1000', 'limit');
    }
    
    validatedLimit = numLimit;
  }

  if (offset !== undefined) {
    const numOffset = typeof offset === 'string' ? parseInt(offset, 10) : offset;
    
    if (isNaN(numOffset) || numOffset < 0) {
      throw new ValidationError('Offset must be a non-negative number', 'offset');
    }
    
    validatedOffset = numOffset;
  }

  return { limit: validatedLimit, offset: validatedOffset };
}

/**
 * Validates execution status values
 * 
 * @param status - The status to validate
 * @returns Validated status
 * @throws ValidationError if status is invalid
 */
export function validateExecutionStatus(status: string): 'started' | 'running' | 'completed' | 'failed' | 'abandoned' {
  const validStatuses = ['started', 'running', 'completed', 'failed', 'abandoned'] as const;
  
  if (!validStatuses.includes(status as any)) {
    throw new ValidationError(`Status must be one of: ${validStatuses.join(', ')}`, 'status');
  }
  
  return status as typeof validStatuses[number];
}

/**
 * Validates agent type
 * 
 * @param agent - The agent type to validate
 * @returns Validated agent type
 * @throws ValidationError if agent is invalid
 */
export function validateAgentType(agent: string): string {
  const validAgents = ['claude', 'gemini', 'grok', 'codex', 'opencode'];
  
  if (!validAgents.includes(agent)) {
    throw new ValidationError(`Agent must be one of: ${validAgents.join(', ')}`, 'agent');
  }
  
  return agent;
}

/**
 * Validates sandbox type
 * 
 * @param sandbox - The sandbox type to validate
 * @returns Validated sandbox type
 * @throws ValidationError if sandbox is invalid
 */
export function validateSandboxType(sandbox: string): string {
  const validSandboxes = ['dagger', 'e2b', 'daytona', 'cloudflare', 'northflank'];
  
  if (!validSandboxes.includes(sandbox)) {
    throw new ValidationError(`Sandbox must be one of: ${validSandboxes.join(', ')}`, 'sandbox');
  }
  
  return sandbox;
}