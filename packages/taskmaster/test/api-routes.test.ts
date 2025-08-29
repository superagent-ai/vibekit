import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { handleGetTasks, handleUpdateTask, handleWatchTasks, createTaskmasterAPIRoutes } from '../src/api/routes';
import { TaskmasterProvider } from '../src/providers/taskmaster';
import type { TaskUpdate } from '../src/types';

// Mock the TaskmasterProvider
vi.mock('../src/providers/taskmaster', () => ({
  TaskmasterProvider: vi.fn().mockImplementation(() => ({
    getTasks: vi.fn(),
    updateTask: vi.fn(),
    watchTasks: vi.fn(),
  })),
}));

// Mock NextResponse
vi.mock('next/server', () => ({
  NextRequest: vi.fn(),
  NextResponse: {
    json: vi.fn().mockImplementation((data, options) => ({
      json: () => Promise.resolve(data),
      status: options?.status || 200,
      data,
      options,
    })),
  },
}));

describe('Taskmaster API Routes', () => {
  const mockProject = {
    id: 'test-project',
    projectRoot: '/test/project/root',
  };

  const mockTasksData = {
    tasks: [
      { id: 1, title: 'Test Task', status: 'pending' },
      { id: 2, title: 'Another Task', status: 'done' },
    ],
    metadata: {
      version: '1.0.0',
      lastUpdated: '2024-01-01T00:00:00Z',
    },
    projectId: 'test-project',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleGetTasks', () => {
    it('should return tasks successfully', async () => {
      const mockProvider = {
        getTasks: vi.fn().mockResolvedValue(mockTasksData),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      const response = await handleGetTasks(mockProject);

      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot: mockProject.projectRoot,
      });
      expect(mockProvider.getTasks).toHaveBeenCalled();
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockTasksData,
      });
    });

    it('should handle provider getTasks error gracefully', async () => {
      const error = new Error('File not found');
      const mockProvider = {
        getTasks: vi.fn().mockRejectedValue(error),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      const response = await handleGetTasks(mockProject);

      expect(NextResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'File not found',
        data: {
          tasks: [],
          metadata: {},
          projectId: mockProject.id,
        },
      });
    });

    it('should handle provider initialization error', async () => {
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => {
        throw new Error('Provider initialization failed');
      });

      const response = await handleGetTasks(mockProject);

      expect(NextResponse.json).toHaveBeenCalledWith(
        { success: false, error: 'Failed to fetch tasks' },
        { status: 500 }
      );
    });

    it('should handle unknown error types', async () => {
      const mockProvider = {
        getTasks: vi.fn().mockRejectedValue('String error'),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      const response = await handleGetTasks(mockProject);

      expect(NextResponse.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to read tasks file',
        data: {
          tasks: [],
          metadata: {},
          projectId: mockProject.id,
        },
      });
    });
  });

  describe('handleUpdateTask', () => {
    const mockTaskUpdate: TaskUpdate = {
      taskId: 1,
      title: 'Updated Task',
      status: 'in-progress',
    };

    it('should update task successfully', async () => {
      const mockProvider = {
        updateTask: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      const response = await handleUpdateTask(mockProject, mockTaskUpdate);

      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot: mockProject.projectRoot,
      });
      expect(mockProvider.updateTask).toHaveBeenCalledWith(mockTaskUpdate);
      expect(NextResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Task updated successfully',
      });
    });

    it('should handle update task error', async () => {
      const error = new Error('Update failed');
      const mockProvider = {
        updateTask: vi.fn().mockRejectedValue(error),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      const response = await handleUpdateTask(mockProject, mockTaskUpdate);

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Update failed',
        },
        { status: 500 }
      );
    });

    it('should handle unknown error types in update', async () => {
      const mockProvider = {
        updateTask: vi.fn().mockRejectedValue('String error'),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      const response = await handleUpdateTask(mockProject, mockTaskUpdate);

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Failed to update task',
        },
        { status: 500 }
      );
    });

    it('should handle provider initialization error in update', async () => {
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => {
        throw new Error('Provider initialization failed');
      });

      const response = await handleUpdateTask(mockProject, mockTaskUpdate);

      expect(NextResponse.json).toHaveBeenCalledWith(
        {
          success: false,
          error: 'Provider initialization failed',
        },
        { status: 500 }
      );
    });
  });

  describe('handleWatchTasks', () => {
    let mockController: any;
    let mockCleanup: any;

    beforeEach(() => {
      mockController = {
        enqueue: vi.fn(),
      };
      mockCleanup = vi.fn();
    });

    it('should create TaskmasterProvider and call watchTasks', () => {
      const mockProvider = {
        watchTasks: vi.fn().mockReturnValue(mockCleanup),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      const response = handleWatchTasks(mockProject);

      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot: mockProject.projectRoot,
      });
      expect(mockProvider.watchTasks).toHaveBeenCalled();
      expect(response).toBeDefined();
    });

    it('should return response with correct headers', () => {
      const mockProvider = {
        watchTasks: vi.fn().mockReturnValue(mockCleanup),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      const response = handleWatchTasks(mockProject);

      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });

    it('should create ReadableStream with proper configuration', () => {
      const mockProvider = {
        watchTasks: vi.fn().mockReturnValue(mockCleanup),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      const response = handleWatchTasks(mockProject);

      expect(response).toBeInstanceOf(Response);
      expect(response.body).toBeDefined();
      expect(mockProvider.watchTasks).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should handle provider watchTasks callback registration', () => {
      let capturedCallback: any = null;
      const mockProvider = {
        watchTasks: vi.fn().mockImplementation((callback) => {
          capturedCallback = callback;
          return mockCleanup;
        }),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      handleWatchTasks(mockProject);

      expect(capturedCallback).toBeDefined();
      expect(typeof capturedCallback).toBe('function');
      expect(mockCleanup).toBeDefined();
    });

    it('should pass event data to the stream callback properly', () => {
      let capturedCallback: any = null;
      const mockProvider = {
        watchTasks: vi.fn().mockImplementation((callback) => {
          capturedCallback = callback;
          return mockCleanup;
        }),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      handleWatchTasks(mockProject);

      // Verify callback was captured
      expect(capturedCallback).toBeDefined();
      
      // Test that the callback is a function that can be called
      const testEvent = { type: 'test', data: 'test data' };
      expect(() => capturedCallback(testEvent)).not.toThrow();
    });

    it('should handle cleanup function returned from watchTasks', () => {
      const cleanupSpy = vi.fn();
      const mockProvider = {
        watchTasks: vi.fn().mockReturnValue(cleanupSpy),
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      handleWatchTasks(mockProject);

      // The cleanup function should be what was returned from watchTasks
      expect(mockProvider.watchTasks).toHaveReturnedWith(cleanupSpy);
    });

    it('should handle provider initialization properly', () => {
      const watchTasksSpy = vi.fn().mockReturnValue(mockCleanup);
      const mockProvider = {
        watchTasks: watchTasksSpy,
      };
      vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

      handleWatchTasks(mockProject);

      // Verify provider was created with correct config
      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot: mockProject.projectRoot,
      });
      
      // Verify watchTasks was called with a callback function
      expect(watchTasksSpy).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('createTaskmasterAPIRoutes', () => {
    const mockGetProject = vi.fn();
    let routes: ReturnType<typeof createTaskmasterAPIRoutes>;
    let mockRequest: any;
    let mockParams: any;

    beforeEach(() => {
      routes = createTaskmasterAPIRoutes(mockGetProject);
      mockRequest = {
        json: vi.fn(),
      };
      mockParams = Promise.resolve({ id: 'test-project' });
    });

    describe('getTasks route', () => {
      it('should handle successful project lookup', async () => {
        mockGetProject.mockResolvedValue(mockProject);
        
        const mockProvider = {
          getTasks: vi.fn().mockResolvedValue(mockTasksData),
        };
        vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

        const response = await routes.getTasks(mockRequest, { params: mockParams });

        expect(mockGetProject).toHaveBeenCalledWith('test-project');
        expect(NextResponse.json).toHaveBeenCalledWith({
          success: true,
          data: mockTasksData,
        });
      });

      it('should handle project not found', async () => {
        mockGetProject.mockResolvedValue(null);

        const response = await routes.getTasks(mockRequest, { params: mockParams });

        expect(NextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      });
    });

    describe('updateTask route', () => {
      const mockTaskUpdate: TaskUpdate = {
        taskId: 1,
        title: 'Updated Task',
      };

      it('should handle successful project lookup and update', async () => {
        mockGetProject.mockResolvedValue(mockProject);
        mockRequest.json.mockResolvedValue(mockTaskUpdate);
        
        const mockProvider = {
          updateTask: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

        const response = await routes.updateTask(mockRequest, { params: mockParams });

        expect(mockGetProject).toHaveBeenCalledWith('test-project');
        expect(mockRequest.json).toHaveBeenCalled();
        expect(NextResponse.json).toHaveBeenCalledWith({
          success: true,
          message: 'Task updated successfully',
        });
      });

      it('should handle project not found for update', async () => {
        mockGetProject.mockResolvedValue(null);

        const response = await routes.updateTask(mockRequest, { params: mockParams });

        expect(NextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      });
    });

    describe('watchTasks route', () => {
      it('should handle successful project lookup for watching', async () => {
        mockGetProject.mockResolvedValue(mockProject);
        
        const mockProvider = {
          watchTasks: vi.fn().mockReturnValue(vi.fn()),
        };
        vi.mocked(TaskmasterProvider).mockImplementationOnce(() => mockProvider as any);

        const response = await routes.watchTasks(mockRequest, { params: mockParams });

        expect(mockGetProject).toHaveBeenCalledWith('test-project');
        expect(response).toBeDefined();
      });

      it('should handle project not found for watching', async () => {
        mockGetProject.mockResolvedValue(null);

        const response = await routes.watchTasks(mockRequest, { params: mockParams });

        expect(NextResponse.json).toHaveBeenCalledWith(
          { success: false, error: 'Project not found' },
          { status: 404 }
        );
      });
    });
  });
});