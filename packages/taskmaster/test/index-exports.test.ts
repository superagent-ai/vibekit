import { describe, it, expect } from 'vitest';

describe('Index Exports Coverage', () => {
  it('should export all types', async () => {
    const types = await import('../src/types');
    expect(types).toBeDefined();
    expect(typeof types).toBe('object');
  });

  it('should export TaskmasterProvider', async () => {
    const { TaskmasterProvider } = await import('../src/index');
    expect(TaskmasterProvider).toBeDefined();
    expect(typeof TaskmasterProvider).toBe('function');
  });

  it('should export SSEManager', async () => {
    const { SSEManager } = await import('../src/index');
    expect(SSEManager).toBeDefined();
    expect(typeof SSEManager).toBe('function');
  });

  it('should export API handlers', async () => {
    const { createProviderForProject } = await import('../src/index');
    expect(createProviderForProject).toBeDefined();
    expect(typeof createProviderForProject).toBe('function');
  });

  it('should export API routes', async () => {
    const { 
      handleGetTasks, 
      handleUpdateTask, 
      handleWatchTasks, 
      createTaskmasterAPIRoutes 
    } = await import('../src/index');
    
    expect(handleGetTasks).toBeDefined();
    expect(handleUpdateTask).toBeDefined();
    expect(handleWatchTasks).toBeDefined();
    expect(createTaskmasterAPIRoutes).toBeDefined();
    
    expect(typeof handleGetTasks).toBe('function');
    expect(typeof handleUpdateTask).toBe('function');
    expect(typeof handleWatchTasks).toBe('function');
    expect(typeof createTaskmasterAPIRoutes).toBe('function');
  });

  it('should export createTaskmasterProvider factory function', async () => {
    const { createTaskmasterProvider } = await import('../src/index');
    expect(createTaskmasterProvider).toBeDefined();
    expect(typeof createTaskmasterProvider).toBe('function');
    
    // Test that it actually creates a provider
    const provider = createTaskmasterProvider({ projectRoot: '/test' });
    expect(provider).toBeDefined();
    expect(typeof provider.getTasks).toBe('function');
  });

  it('should export Taskmaster namespace object', async () => {
    const { Taskmaster } = await import('../src/index');
    expect(Taskmaster).toBeDefined();
    expect(typeof Taskmaster).toBe('object');
    
    // Verify Taskmaster namespace structure
    expect(Taskmaster.Provider).toBeDefined();
    expect(Taskmaster.createProvider).toBeDefined();
    expect(Taskmaster.api).toBeDefined();
    
    expect(typeof Taskmaster.Provider).toBe('function');
    expect(typeof Taskmaster.createProvider).toBe('function');
    expect(typeof Taskmaster.api).toBe('object');
    
    // Verify API object structure
    expect(Taskmaster.api.handleGetTasks).toBeDefined();
    expect(Taskmaster.api.handleUpdateTask).toBeDefined();
    expect(Taskmaster.api.handleWatchTasks).toBeDefined();
    expect(Taskmaster.api.createRoutes).toBeDefined();
  });

  it('should export component functions', async () => {
    const { getTaskmasterComponentPaths, componentsPath } = await import('../src/index');
    expect(getTaskmasterComponentPaths).toBeDefined();
    expect(componentsPath).toBeDefined();
    
    expect(typeof getTaskmasterComponentPaths).toBe('function');
    expect(typeof componentsPath).toBe('string');
    
    // Test component paths function
    const paths = getTaskmasterComponentPaths();
    expect(paths).toBeDefined();
    expect(paths.kanbanPage).toBeDefined();
    expect(paths.taskDetailsDialog).toBeDefined();
    expect(paths.kanbanBoard).toBeDefined();
  });
});