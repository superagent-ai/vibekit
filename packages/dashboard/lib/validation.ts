// Input validation utilities for production safety

export function sanitizeString(input: unknown, maxLength = 255): string {
  if (typeof input !== 'string') return '';
  
  // Remove control characters and trim
  return input
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
    .trim()
    .slice(0, maxLength);
}

export function sanitizePath(path: unknown): string {
  if (typeof path !== 'string') return '';
  
  // Basic path sanitization - remove dangerous patterns
  return path
    .replace(/\.\./g, '') // Remove directory traversal
    .replace(/[<>"|?*]/g, '') // Remove invalid path characters
    .trim();
}

export function sanitizeScript(script: unknown): string {
  if (typeof script !== 'string') return '';
  
  // Basic script sanitization
  return script
    .replace(/[;&|`$]/g, '') // Remove dangerous shell characters
    .trim()
    .slice(0, 500); // Limit script length
}

export function validateProjectInput(data: any) {
  const errors: string[] = [];
  
  // Required fields
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('Project name is required');
  }
  
  if (!data.projectRoot || typeof data.projectRoot !== 'string' || data.projectRoot.trim().length === 0) {
    errors.push('Project root path is required');
  }
  
  // Validate name length
  if (data.name && data.name.length > 100) {
    errors.push('Project name must be less than 100 characters');
  }
  
  // Validate path length
  if (data.projectRoot && data.projectRoot.length > 500) {
    errors.push('Project root path must be less than 500 characters');
  }
  
  // Validate tags
  if (data.tags && !Array.isArray(data.tags)) {
    errors.push('Tags must be an array');
  }
  
  if (data.tags && data.tags.length > 20) {
    errors.push('Maximum 20 tags allowed');
  }
  
  // Validate status
  if (data.status && !['active', 'archived'].includes(data.status)) {
    errors.push('Invalid status. Must be "active" or "archived"');
  }
  
  // Validate priority
  if (data.priority && !['high', 'medium', 'low'].includes(data.priority)) {
    errors.push('Invalid priority. Must be "high", "medium", or "low"');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function sanitizeProjectData(data: any): any {
  const sanitized: any = {
    name: sanitizeString(data.name, 100),
    projectRoot: sanitizePath(data.projectRoot),
    description: sanitizeString(data.description, 500),
    setupScript: sanitizeScript(data.setupScript),
    devScript: sanitizeScript(data.devScript),
    cleanupScript: sanitizeScript(data.cleanupScript),
    tags: Array.isArray(data.tags) 
      ? data.tags.slice(0, 20).map((tag: any) => sanitizeString(tag, 50))
      : [],
    status: ['active', 'archived'].includes(data.status) ? data.status : 'active',
    priority: ['high', 'medium', 'low'].includes(data.priority) ? data.priority : 'medium'
  };
  
  // Include optional fields if present
  if (data.taskSource) {
    sanitized.taskSource = ['taskmaster', 'manual'].includes(data.taskSource) ? data.taskSource : undefined;
  }
  if (data.manualTasks) {
    sanitized.manualTasks = data.manualTasks;
  }
  
  return sanitized;
}