import { describe, it, expect } from 'vitest';

describe('Components Exports Coverage', () => {
  it('should export componentsPath constant', async () => {
    const { componentsPath } = await import('../src/components');
    expect(componentsPath).toBe('@vibe-kit/taskmaster/components');
  });

  it('should export getTaskmasterComponentPaths function', async () => {
    const { getTaskmasterComponentPaths } = await import('../src/components');
    expect(typeof getTaskmasterComponentPaths).toBe('function');
    
    const paths = getTaskmasterComponentPaths();
    expect(paths).toEqual({
      kanbanPage: '@vibe-kit/taskmaster/src/components/KanbanPage',
      taskDetailsDialog: '@vibe-kit/taskmaster/src/components/TaskDetailsDialog',
      kanbanBoard: '@vibe-kit/taskmaster/src/components/KanbanBoard',
    });
  });

  it('should have TaskmasterUIComponents interface defined', async () => {
    // TypeScript interface - test that module imports without error
    const components = await import('../src/components');
    expect(components).toBeDefined();
    expect(typeof components).toBe('object');
  });
});