import { pathExists } from './storage';
import type { ProjectCreateInput, ProjectUpdateInput } from './types';
import { randomBytes } from 'crypto';

/**
 * Validates project data for creation or update
 */
export async function validateProjectData(
  data: ProjectCreateInput | ProjectUpdateInput,
  allowNonExistentPath: boolean = true
): Promise<string[]> {
  const errors: string[] = [];
  
  // For creation, name and projectRoot are required
  if ('name' in data && !data.name?.trim()) {
    errors.push('Project name is required');
  }
  
  if ('projectRoot' in data && !data.projectRoot?.trim()) {
    errors.push('Project root path is required');
  }
  
  // Validate project root exists if required
  if (data.projectRoot && !allowNonExistentPath) {
    const exists = await pathExists(data.projectRoot);
    if (!exists) {
      errors.push(`Project root path does not exist: ${data.projectRoot}`);
    }
  }
  
  // Validate status
  if (data.status && !['active', 'archived'].includes(data.status)) {
    errors.push('Status must be either "active" or "archived"');
  }
  
  // Validate tags
  if (data.tags && !Array.isArray(data.tags)) {
    errors.push('Tags must be an array');
  }
  
  return errors;
}

/**
 * Generates a unique project ID
 */
export function generateProjectId(): string {
  return randomBytes(4).toString('hex');
}

/**
 * Truncates a string to a maximum length
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}