import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProviderForProject } from '../src/api/handlers';
import { TaskmasterProvider } from '../src/providers/taskmaster';

// Mock the TaskmasterProvider
vi.mock('../src/providers/taskmaster', () => ({
  TaskmasterProvider: vi.fn(),
}));

describe('API Handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createProviderForProject', () => {
    it('should create provider with project root only', () => {
      const projectRoot = '/test/project/root';
      
      createProviderForProject(projectRoot);

      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot,
      });
    });

    it('should create provider with project root and options', () => {
      const projectRoot = '/test/project/root';
      const options = {
        tasksFileName: 'custom-tasks.md',
        watchFiles: false,
      };
      
      createProviderForProject(projectRoot, options);

      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot,
        tasksFileName: 'custom-tasks.md',
        watchFiles: false,
      });
    });

    it('should merge options with project root', () => {
      const projectRoot = '/another/project';
      const options = {
        tasksFileName: 'tasks.md',
        watchFiles: true,
        customOption: 'value',
      };
      
      createProviderForProject(projectRoot, options as any);

      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot,
        tasksFileName: 'tasks.md',
        watchFiles: true,
        customOption: 'value',
      });
    });

    it('should return provider instance', () => {
      const mockProvider = { mock: 'provider' };
      vi.mocked(TaskmasterProvider).mockReturnValue(mockProvider as any);
      
      const result = createProviderForProject('/test');

      expect(result).toBe(mockProvider);
    });

    it('should handle empty options', () => {
      const projectRoot = '/test/empty/options';
      
      createProviderForProject(projectRoot, {});

      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot,
      });
    });

    it('should handle undefined options', () => {
      const projectRoot = '/test/undefined/options';
      
      createProviderForProject(projectRoot, undefined);

      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot,
      });
    });

    it('should handle options that override projectRoot (options take precedence)', () => {
      const projectRoot = '/correct/project/root';
      const options = {
        projectRoot: '/wrong/project/root', // This will override
        otherOption: 'value',
      };
      
      createProviderForProject(projectRoot, options as any);

      expect(TaskmasterProvider).toHaveBeenCalledWith({
        projectRoot: '/wrong/project/root', // Options override function parameter
        otherOption: 'value',
      });
    });
  });
});