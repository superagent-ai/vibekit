// Core types
export * from './types';

// Provider and utilities
export { TaskmasterProvider } from './providers/taskmaster';
export { SSEManager } from './utils/sse';

// API handlers
export { createProviderForProject } from './api/handlers';
export {
  handleGetTasks,
  handleUpdateTask,
  handleWatchTasks,
  createTaskmasterAPIRoutes,
  type TaskmasterProject
} from './api/routes';

// Component exports
export * from './components';

// Main factory function
import { TaskmasterProvider } from './providers/taskmaster';
import type { TaskProviderOptions } from './types';

export function createTaskmasterProvider(options: TaskProviderOptions) {
  return new TaskmasterProvider(options);
}

// Import API functions for the Taskmaster namespace
import {
  handleGetTasks,
  handleUpdateTask,
  handleWatchTasks,
  createTaskmasterAPIRoutes,
} from './api/routes';

// Export a complete taskmaster integration
export const Taskmaster = {
  Provider: TaskmasterProvider,
  createProvider: createTaskmasterProvider,
  api: {
    handleGetTasks,
    handleUpdateTask,
    handleWatchTasks,
    createRoutes: createTaskmasterAPIRoutes,
  },
};