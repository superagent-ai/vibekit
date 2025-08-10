export * from './types';
export { TaskmasterProvider } from './providers/taskmaster';
export { SSEManager } from './utils/sse';

import { TaskmasterProvider } from './providers/taskmaster';
import type { TaskProviderOptions } from './types';

export function createTaskmasterProvider(options: TaskProviderOptions) {
  return new TaskmasterProvider(options);
}