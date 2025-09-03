import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskmasterProvider } from '../src/providers/taskmaster';
import type { TaskProviderOptions, TasksData, TaskUpdate } from '../src/types';

vi.mock('fs/promises', () => ({
  access: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));
vi.mock('path', () => ({
  join: vi.fn((...args) => args.join('/')),
  dirname: vi.fn((path) => path.split('/').slice(0, -1).join('/')),
  basename: vi.fn((path) => path.split('/').pop() || ''),
}));

// Since the real chokidar is available, let the tests use it but simplify our assertions

// Get mocked modules
const mockFs = vi.mocked(await import('fs/promises'));

describe('TaskmasterProvider', () => {
  let provider: TaskmasterProvider;
  let options: TaskProviderOptions;
  let mockTasksData: TasksData;

  beforeEach(() => {
    vi.clearAllMocks();

    options = {
      projectRoot: '/test/project',
      tasksPath: '.taskmaster/tasks/tasks.json',
    };

    provider = new TaskmasterProvider(options);

    mockTasksData = {
      tasks: [
        {
          id: 1,
          title: 'Test Task 1',
          description: 'First test task',
          details: 'Task 1 details',
          testStrategy: 'Unit tests',
          status: 'pending',
          priority: 'medium',
          dependencies: [],
          subtasks: [],
        },
        {
          id: 2,
          title: 'Test Task 2',
          description: 'Second test task',
          details: 'Task 2 details',
          testStrategy: 'Integration tests',
          status: 'in-progress',
          priority: 'high',
          dependencies: [],
          subtasks: [],
        },
      ],
      metadata: {
        created: '2024-01-01T00:00:00Z',
        updated: '2024-01-01T00:00:00Z',
        description: 'Test project tasks',
      },
    };
  });

  describe('constructor', () => {
    it('should create provider with default tasks path', () => {
      const defaultProvider = new TaskmasterProvider({
        projectRoot: '/test/project',
      });

      expect(defaultProvider.getTasksPath()).toBe('/test/project/.taskmaster/tasks/tasks.json');
    });

    it('should create provider with custom tasks path', () => {
      const customProvider = new TaskmasterProvider({
        projectRoot: '/test/project',
        tasksPath: 'custom/tasks.json',
      });

      expect(customProvider.getTasksPath()).toBe('/test/project/custom/tasks.json');
    });
  });

  describe('getTasksPath', () => {
    it('should return correct full path', () => {
      const path = provider.getTasksPath();
      expect(path).toBe('/test/project/.taskmaster/tasks/tasks.json');
    });
  });

  describe('getTasks', () => {
    it('should read and parse tasks file successfully', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTasksData));

      const result = await provider.getTasks();

      expect(result).toEqual(mockTasksData);
      expect(mockFs.access).toHaveBeenCalledWith('/test/project/.taskmaster/tasks/tasks.json');
      expect(mockFs.readFile).toHaveBeenCalledWith('/test/project/.taskmaster/tasks/tasks.json', 'utf-8');
    });

    it('should throw error when tasks file does not exist', async () => {
      const error = new Error('File not found');
      (error as any).code = 'ENOENT';
      mockFs.access.mockRejectedValue(error);

      await expect(provider.getTasks()).rejects.toThrow(
        'No tasks file found at /test/project/.taskmaster/tasks/tasks.json. Make sure Taskmaster is initialized for this project.'
      );
    });

    it('should throw original error for non-ENOENT errors', async () => {
      const error = new Error('Permission denied');
      mockFs.access.mockRejectedValue(error);

      await expect(provider.getTasks()).rejects.toThrow('Permission denied');
    });

    it('should throw error for invalid JSON', async () => {
      mockFs.access.mockResolvedValue(undefined);
      mockFs.readFile.mockResolvedValue('invalid json');

      await expect(provider.getTasks()).rejects.toThrow();
    });
  });

  describe('updateTask', () => {
    const taskUpdate: TaskUpdate = {
      taskId: 1,
      title: 'Updated Task Title',
      status: 'in-progress',
      priority: 'high',
    };

    it('should update task successfully', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTasksData));
      mockFs.writeFile.mockResolvedValue(undefined);

      await provider.updateTask(taskUpdate);

      expect(mockFs.readFile).toHaveBeenCalledWith('/test/project/.taskmaster/tasks/tasks.json', 'utf-8');
      expect(mockFs.writeFile).toHaveBeenCalled();

      // Check that the updated data was written
      const writeCall = mockFs.writeFile.mock.calls[0];
      const writtenData = JSON.parse(writeCall[1]);
      const updatedTask = writtenData.tasks.find((t: any) => t.id === 1);

      expect(updatedTask.title).toBe('Updated Task Title');
      expect(updatedTask.status).toBe('in-progress');
      expect(updatedTask.priority).toBe('high');
      
      // Check that the metadata was updated
      expect(writtenData.metadata.updated).toBeDefined();
    });

    it('should handle task not found (silently continues)', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTasksData));
      mockFs.writeFile.mockResolvedValue(undefined);

      const nonExistentUpdate: TaskUpdate = {
        taskId: 999,
        title: 'Updated',
      };

      // This should not throw an error, just silently continue
      await provider.updateTask(nonExistentUpdate);

      // Verify that the write still happened (even though no task was updated)
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle file read error', async () => {
      mockFs.readFile.mockRejectedValue(new Error('Read error'));

      await expect(provider.updateTask(taskUpdate)).rejects.toThrow('Read error');
    });

    it('should handle file write error', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTasksData));
      mockFs.writeFile.mockRejectedValue(new Error('Write error'));

      await expect(provider.updateTask(taskUpdate)).rejects.toThrow('Write error');
    });

    it('should emit task update event', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTasksData));
      mockFs.writeFile.mockResolvedValue(undefined);

      const eventSpy = vi.fn();
      provider.on('tasks-updated', eventSpy);

      await provider.updateTask(taskUpdate);

      expect(eventSpy).toHaveBeenCalledWith({
        type: 'tasks-updated',
        timestamp: expect.any(Date),
      });
    });
  });

  describe('watchTasks', () => {
    beforeEach(() => {
      // Clear file system mocks
      vi.clearAllMocks();
    });

    it('should setup file watcher and return cleanup function', () => {
      const callback = vi.fn();
      
      const cleanup = provider.watchTasks(callback);

      // Should return a cleanup function
      expect(cleanup).toBeInstanceOf(Function);
      
      // Should have created a watcher (stored as this.watcher)
      expect((provider as any).watcher).toBeDefined();
      expect((provider as any).watcher).not.toBeNull();
      
      // The callback should be registered as event listener
      const providerOnSpy = vi.spyOn(provider, 'on');
      provider.watchTasks(vi.fn()); // Call again to test registration
      expect(providerOnSpy).toHaveBeenCalledWith('tasks-updated', expect.any(Function));
      
      providerOnSpy.mockRestore();
    });

    it('should handle file change events via provider events', () => {
      const callback = vi.fn();
      
      // Register the callback
      provider.watchTasks(callback);
      
      // Simulate a file change by emitting the tasks-updated event directly
      provider.emit('tasks-updated', {
        type: 'tasks-updated',
        timestamp: new Date(),
      });
      
      expect(callback).toHaveBeenCalledWith({
        type: 'tasks-updated',
        timestamp: expect.any(Date),
      });
    });

    it('should create a chokidar watcher when called', () => {
      const callback = vi.fn();
      
      // Before calling watchTasks, watcher should be null
      expect((provider as any).watcher).toBeNull();
      
      const cleanup = provider.watchTasks(callback);
      
      // After calling watchTasks, should have created a watcher
      expect((provider as any).watcher).toBeDefined();
      expect((provider as any).watcher).not.toBeNull();
      expect(cleanup).toBeInstanceOf(Function);
    });

    it('should handle multiple watchers correctly', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      const cleanup1 = provider.watchTasks(callback1);
      const cleanup2 = provider.watchTasks(callback2);
      
      // Both should return cleanup functions
      expect(cleanup1).toBeInstanceOf(Function);
      expect(cleanup2).toBeInstanceOf(Function);
      
      // Should have replaced the watcher (second call closes first)
      expect((provider as any).watcher).toBeDefined();
    });

    it('should register provider event listener', () => {
      const callback = vi.fn();
      const providerOnSpy = vi.spyOn(provider, 'on');
      
      provider.watchTasks(callback);

      expect(providerOnSpy).toHaveBeenCalledWith('tasks-updated', callback);
    });

    it('should cleanup watcher and event listeners', () => {
      const callback = vi.fn();
      const providerOffSpy = vi.spyOn(provider, 'off');
      
      const cleanup = provider.watchTasks(callback);
      expect((provider as any).watcher).not.toBeNull();
      
      cleanup();

      // After cleanup, watcher should be null
      expect((provider as any).watcher).toBeNull();
      expect(providerOffSpy).toHaveBeenCalledWith('tasks-updated', callback);
    });

    it('should handle cleanup when watcher is null', () => {
      const callback = vi.fn();
      const cleanup = provider.watchTasks(callback);
      
      // Simulate watcher being null (already closed)
      (provider as any).watcher = null;
      
      // Should not throw error
      expect(() => cleanup()).not.toThrow();
    });

    it('should handle file add events through chokidar', () => {
      const callback = vi.fn();
      
      const cleanup = provider.watchTasks(callback);
      const watcher = (provider as any).watcher;
      
      // Simulate chokidar 'add' event
      watcher.emit('add', '/path/to/new/file.json');
      
      expect(callback).toHaveBeenCalledWith({
        type: 'file-created',
        timestamp: expect.any(Date),
      });
      
      cleanup();
    });

    it('should handle file unlink events through chokidar', () => {
      const callback = vi.fn();
      
      const cleanup = provider.watchTasks(callback);
      const watcher = (provider as any).watcher;
      
      // Simulate chokidar 'unlink' event
      watcher.emit('unlink', '/path/to/deleted/file.json');
      
      expect(callback).toHaveBeenCalledWith({
        type: 'file-deleted',
        timestamp: expect.any(Date),
      });
      
      cleanup();
    });

    it('should handle all three chokidar events (change, add, unlink)', () => {
      const callback = vi.fn();
      
      const cleanup = provider.watchTasks(callback);
      const watcher = (provider as any).watcher;
      
      // Test all three events
      watcher.emit('change');
      watcher.emit('add', '/new/file.json');
      watcher.emit('unlink', '/deleted/file.json');
      
      expect(callback).toHaveBeenCalledTimes(3);
      expect(callback).toHaveBeenNthCalledWith(1, {
        type: 'tasks-updated',
        timestamp: expect.any(Date),
      });
      expect(callback).toHaveBeenNthCalledWith(2, {
        type: 'file-created',
        timestamp: expect.any(Date),
      });
      expect(callback).toHaveBeenNthCalledWith(3, {
        type: 'file-deleted',
        timestamp: expect.any(Date),
      });
      
      cleanup();
    });
  });

  describe('ensureTasksFile', () => {
    it('should skip creation when file already exists', async () => {
      mockFs.access.mockResolvedValue(undefined);

      await provider.ensureTasksFile();

      expect(mockFs.access).toHaveBeenCalledWith('/test/project/.taskmaster/tasks/tasks.json');
      expect(mockFs.mkdir).not.toHaveBeenCalled();
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it('should create directory and initial tasks file when file does not exist', async () => {
      const error = new Error('File not found');
      (error as any).code = 'ENOENT';
      mockFs.access.mockRejectedValue(error);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockResolvedValue(undefined);

      await provider.ensureTasksFile();

      expect(mockFs.mkdir).toHaveBeenCalledWith('/test/project/.taskmaster/tasks', { recursive: true });
      expect(mockFs.writeFile).toHaveBeenCalled();
      
      // Verify the initial data structure
      const writeCall = mockFs.writeFile.mock.calls[0];
      const initialData = JSON.parse(writeCall[1]);
      
      expect(initialData).toEqual({
        master: {
          tasks: [],
          metadata: {
            created: expect.any(String),
            updated: expect.any(String),
            description: 'Main task list',
          },
        },
      });
    });

    it('should handle mkdir errors', async () => {
      const accessError = new Error('File not found');
      (accessError as any).code = 'ENOENT';
      mockFs.access.mockRejectedValue(accessError);
      mockFs.mkdir.mockRejectedValue(new Error('Permission denied'));

      await expect(provider.ensureTasksFile()).rejects.toThrow('Permission denied');
    });

    it('should handle writeFile errors', async () => {
      const accessError = new Error('File not found');
      (accessError as any).code = 'ENOENT';
      mockFs.access.mockRejectedValue(accessError);
      mockFs.mkdir.mockResolvedValue(undefined);
      mockFs.writeFile.mockRejectedValue(new Error('Disk full'));

      await expect(provider.ensureTasksFile()).rejects.toThrow('Disk full');
    });
  });

  describe('updateTask with tagged structure', () => {
    let taggedTasksData: any;

    beforeEach(() => {
      taggedTasksData = {
        feature: {
          tasks: [
            {
              id: 1,
              title: 'Feature Task 1',
              status: 'pending',
              priority: 'medium',
            },
            {
              id: 2, 
              title: 'Feature Task 2',
              status: 'done',
              priority: 'low',
            },
          ],
          metadata: {
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            description: 'Feature tasks',
          },
        },
        bugfix: {
          tasks: [
            {
              id: 3,
              title: 'Bug Fix Task',
              status: 'in-progress',
              priority: 'high',
            },
          ],
          metadata: {
            created: '2024-01-01T00:00:00Z',
            updated: '2024-01-01T00:00:00Z',
            description: 'Bug fixes',
          },
        },
      };
    });

    it('should update task in tagged structure', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(taggedTasksData));
      mockFs.writeFile.mockResolvedValue(undefined);

      const update: TaskUpdate = {
        taskId: 1,
        tag: 'feature',
        title: 'Updated Feature Task',
        status: 'in-progress',
      };

      await provider.updateTask(update);

      const writeCall = mockFs.writeFile.mock.calls[0];
      const updatedData = JSON.parse(writeCall[1]);
      
      expect(updatedData.feature.tasks[0].title).toBe('Updated Feature Task');
      expect(updatedData.feature.tasks[0].status).toBe('in-progress');
      expect(updatedData.feature.metadata.updated).not.toBe('2024-01-01T00:00:00Z');
    });

    it('should update all task fields in tagged structure', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(taggedTasksData));
      mockFs.writeFile.mockResolvedValue(undefined);

      const update: TaskUpdate = {
        taskId: 1,
        tag: 'feature',
        title: 'Updated Title',
        description: 'Updated Description',
        details: 'Updated Details',
        testStrategy: 'Updated Test Strategy',
        status: 'done',
        priority: 'high',
      };

      await provider.updateTask(update);

      const writeCall = mockFs.writeFile.mock.calls[0];
      const updatedData = JSON.parse(writeCall[1]);
      const updatedTask = updatedData.feature.tasks[0];
      
      expect(updatedTask.title).toBe('Updated Title');
      expect(updatedTask.description).toBe('Updated Description');
      expect(updatedTask.details).toBe('Updated Details');
      expect(updatedTask.testStrategy).toBe('Updated Test Strategy');
      expect(updatedTask.status).toBe('done');
      expect(updatedTask.priority).toBe('high');
    });

    it('should handle task not found in tagged structure', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(taggedTasksData));
      mockFs.writeFile.mockResolvedValue(undefined);

      const update: TaskUpdate = {
        taskId: 999,
        tag: 'feature',
        title: 'Non-existent task',
      };

      // Should not throw error
      await provider.updateTask(update);

      // Should still write the file
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it('should handle non-existent tag in tagged structure', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(taggedTasksData));
      mockFs.writeFile.mockResolvedValue(undefined);

      const update: TaskUpdate = {
        taskId: 1,
        tag: 'nonexistent',
        title: 'Updated task',
      };

      // Should not throw error
      await provider.updateTask(update);

      // Should still write the file
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('updateTask with flat structure edge cases', () => {
    it('should handle flat structure without metadata', async () => {
      const flatTasksWithoutMetadata = {
        tasks: [
          {
            id: 1,
            title: 'Task 1',
            status: 'pending',
          },
        ],
      };

      mockFs.readFile.mockResolvedValue(JSON.stringify(flatTasksWithoutMetadata));
      mockFs.writeFile.mockResolvedValue(undefined);

      const update: TaskUpdate = {
        taskId: 1,
        title: 'Updated Task',
      };

      await provider.updateTask(update);

      const writeCall = mockFs.writeFile.mock.calls[0];
      const updatedData = JSON.parse(writeCall[1]);
      
      expect(updatedData.tasks[0].title).toBe('Updated Task');
      // Should not crash when metadata doesn't exist
    });

    it('should update partial fields only', async () => {
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockTasksData));
      mockFs.writeFile.mockResolvedValue(undefined);

      const update: TaskUpdate = {
        taskId: 1,
        status: 'done', // Only update status
      };

      await provider.updateTask(update);

      const writeCall = mockFs.writeFile.mock.calls[0];
      const updatedData = JSON.parse(writeCall[1]);
      const updatedTask = updatedData.tasks[0];
      
      expect(updatedTask.status).toBe('done');
      // Other fields should remain unchanged
      expect(updatedTask.title).toBe('Test Task 1');
      expect(updatedTask.priority).toBe('medium');
    });

    it('should handle JSON parse error during update', async () => {
      mockFs.readFile.mockResolvedValue('invalid json');

      const update: TaskUpdate = {
        taskId: 1,
        title: 'Updated',
      };

      await expect(provider.updateTask(update)).rejects.toThrow('Failed to update task:');
    });
  });

  describe('event handling', () => {
    it('should extend EventEmitter', () => {
      expect(provider.on).toBeDefined();
      expect(provider.emit).toBeDefined();
      expect(provider.off).toBeDefined();
    });

    it('should emit events correctly', () => {
      const eventSpy = vi.fn();
      provider.on('test', eventSpy);

      provider.emit('test', 'test-data');

      expect(eventSpy).toHaveBeenCalledWith('test-data');
    });

    it('should handle multiple event listeners', () => {
      const spy1 = vi.fn();
      const spy2 = vi.fn();
      
      provider.on('multi-test', spy1);
      provider.on('multi-test', spy2);
      
      provider.emit('multi-test', 'data');
      
      expect(spy1).toHaveBeenCalledWith('data');
      expect(spy2).toHaveBeenCalledWith('data');
    });

    it('should remove event listeners correctly', () => {
      const eventSpy = vi.fn();
      provider.on('remove-test', eventSpy);
      provider.off('remove-test', eventSpy);
      
      provider.emit('remove-test', 'data');
      
      expect(eventSpy).not.toHaveBeenCalled();
    });
  });
});