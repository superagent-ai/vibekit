/**
 * Utility functions for creating taskmaster providers
 * These help reduce boilerplate when using taskmaster in API routes
 */

import { TaskmasterProvider } from '../providers/taskmaster';
import type { TaskProviderOptions } from '../types';

/**
 * Create a taskmaster provider for a project
 * This is a convenience function that creates a provider with the project's root
 */
export function createProviderForProject(projectRoot: string, options?: Partial<TaskProviderOptions>) {
  return new TaskmasterProvider({
    projectRoot,
    ...options,
  });
}