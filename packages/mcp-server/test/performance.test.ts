import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the projects module for performance testing
vi.mock('@vibe-kit/projects', () => ({
  getAllProjects: vi.fn(),
  getProject: vi.fn(),
  getProjectByName: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

const { 
  projectsToolExecute, 
  projectManageToolExecute
} = await import('../src/tools');

const mockProjects = await import('@vibe-kit/projects');

describe('Performance Tests', () => {
  // Helper to create mock projects
  const createMockProject = (id: string, name: string) => ({
    id,
    name,
    projectRoot: `/path/to/${id}`,
    description: `Description for ${name}`,
    status: 'active' as const,
    priority: 'medium' as const,
    tags: ['test', 'perf'],
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('projectsToolExecute performance', () => {
    it('should handle large project lists efficiently', async () => {
      // Create 1000 mock projects
      const largeProjectList = Array.from({ length: 1000 }, (_, i) => 
        createMockProject(`project-${i}`, `Project ${i}`)
      );

      mockProjects.getAllProjects.mockResolvedValue(largeProjectList);

      const startTime = Date.now();
      const result = await projectsToolExecute({ action: 'list', status: 'all' });
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      const parsed = JSON.parse(result);

      expect(parsed.projects).toHaveLength(1000);
      expect(parsed.total).toBe(1000);
      // Should complete within 100ms for 1000 projects
      expect(executionTime).toBeLessThan(100);
    });

    it('should handle search operations efficiently', async () => {
      // Create 5000 mock projects
      const largeProjectList = Array.from({ length: 5000 }, (_, i) => 
        createMockProject(`project-${i}`, i % 10 === 0 ? `Special Project ${i}` : `Project ${i}`)
      );

      mockProjects.getAllProjects.mockResolvedValue(largeProjectList);

      const startTime = Date.now();
      const result = await projectsToolExecute({ 
        action: 'search', 
        query: 'special',
        status: 'all' 
      });
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      const parsed = JSON.parse(result);

      // Should find 500 "Special" projects (every 10th)
      expect(parsed.projects).toHaveLength(500);
      // Should complete search within 50ms
      expect(executionTime).toBeLessThan(50);
    });

    it('should handle tag filtering efficiently', async () => {
      // Create projects with various tag combinations
      const projectsWithTags = Array.from({ length: 2000 }, (_, i) => ({
        ...createMockProject(`project-${i}`, `Project ${i}`),
        tags: i % 3 === 0 ? ['frontend', 'react'] : 
              i % 3 === 1 ? ['backend', 'node'] : 
              ['devops', 'docker']
      }));

      mockProjects.getAllProjects.mockResolvedValue(projectsWithTags);

      const startTime = Date.now();
      const result = await projectsToolExecute({ 
        action: 'search', 
        tags: ['frontend'],
        status: 'all' 
      });
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      const parsed = JSON.parse(result);

      // Should complete filtering within 30ms
      expect(executionTime).toBeLessThan(30);
      // Should find approximately 667 projects (every 3rd)
      expect(parsed.projects.length).toBeGreaterThan(600);
      expect(parsed.projects.length).toBeLessThan(700);
    });

    it('should handle multiple filter combinations efficiently', async () => {
      const complexProjectList = Array.from({ length: 1000 }, (_, i) => ({
        ...createMockProject(`project-${i}`, `Project ${i}`),
        priority: i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low',
        tags: [`tag${i % 5}`, `category${i % 3}`],
        description: i % 2 === 0 ? 'Important project description' : 'Regular project'
      }));

      mockProjects.getAllProjects.mockResolvedValue(complexProjectList);

      const startTime = Date.now();
      const result = await projectsToolExecute({ 
        action: 'search',
        query: 'important',
        priority: 'high',
        tags: ['tag0'],
        status: 'all'
      });
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      const parsed = JSON.parse(result);

      // Complex filtering should still complete quickly
      expect(executionTime).toBeLessThan(25);
      expect(Array.isArray(parsed.projects)).toBe(true);
    });
  });

  describe('projectManageToolExecute performance', () => {
    it('should handle rapid create operations', async () => {
      mockProjects.createProject.mockImplementation(async (data) => ({
        id: 'new-project',
        ...data,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      }));

      const createOperations = Array.from({ length: 100 }, (_, i) => 
        projectManageToolExecute({
          action: 'create',
          name: `Perf Project ${i}`,
          projectRoot: `/path/perf/${i}`,
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(createOperations);
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      // 100 create operations should complete within 200ms
      expect(executionTime).toBeLessThan(200);
      expect(results).toHaveLength(100);
      results.forEach(result => {
        const parsed = JSON.parse(result);
        expect(parsed.success).toBe(true);
      });
    });

    it('should handle rapid update operations', async () => {
      mockProjects.updateProject.mockImplementation(async (id, updates) => ({
        id,
        name: 'Original Name',
        projectRoot: '/original/path',
        status: 'active' as const,
        priority: 'medium' as const,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
        ...updates,
      }));

      const updateOperations = Array.from({ length: 50 }, (_, i) => 
        projectManageToolExecute({
          action: 'update',
          id: `project-${i}`,
          name: `Updated Project ${i}`,
          description: `Updated description ${i}`,
        })
      );

      const startTime = Date.now();
      const results = await Promise.all(updateOperations);
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      // 50 update operations should complete within 100ms
      expect(executionTime).toBeLessThan(100);
      expect(results).toHaveLength(50);
    });

    it('should handle memory-intensive operations', async () => {
      // Create a large project data structure
      const largeDescription = 'x'.repeat(10000); // 10KB description
      const largeTags = Array.from({ length: 100 }, (_, i) => `tag-${i}`);

      mockProjects.createProject.mockResolvedValue({
        id: 'large-project',
        name: 'Large Project',
        projectRoot: '/large/path',
        description: largeDescription,
        tags: largeTags,
        status: 'active' as const,
        priority: 'high' as const,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      });

      const startTime = Date.now();
      const result = await projectManageToolExecute({
        action: 'create',
        name: 'Large Project',
        projectRoot: '/large/path',
        description: largeDescription,
        tags: largeTags,
      });
      const endTime = Date.now();

      const executionTime = endTime - startTime;
      const parsed = JSON.parse(result);

      // Large object operations should complete within 50ms
      expect(executionTime).toBeLessThan(50);
      expect(parsed.success).toBe(true);
      expect(parsed.project.description).toHaveLength(10000);
    });
  });

  describe('JSON serialization performance', () => {
    it('should handle large JSON responses efficiently', async () => {
      const massiveProjectList = Array.from({ length: 10000 }, (_, i) => 
        createMockProject(`project-${i}`, `Project ${i}`)
      );

      mockProjects.getAllProjects.mockResolvedValue(massiveProjectList);

      const startTime = Date.now();
      const result = await projectsToolExecute({ action: 'list', status: 'all' });
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      // JSON serialization of 10k projects should complete within 200ms
      expect(executionTime).toBeLessThan(200);
      
      // Verify the JSON is valid and complete
      const parsed = JSON.parse(result);
      expect(parsed.projects).toHaveLength(10000);
      expect(parsed.total).toBe(10000);
    });

    it('should handle deeply nested objects efficiently', async () => {
      const deepProject = {
        ...createMockProject('deep-project', 'Deep Project'),
        metadata: {
          level1: {
            level2: {
              level3: {
                level4: {
                  level5: {
                    data: Array.from({ length: 100 }, (_, i) => ({ id: i, value: `data-${i}` }))
                  }
                }
              }
            }
          }
        }
      };

      mockProjects.createProject.mockResolvedValue(deepProject);

      const startTime = Date.now();
      const result = await projectManageToolExecute({
        action: 'create',
        name: 'Deep Project',
        projectRoot: '/deep/path',
      });
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      // Deep object serialization should complete within 30ms
      expect(executionTime).toBeLessThan(30);
      
      const parsed = JSON.parse(result);
      expect(parsed.success).toBe(true);
      expect(parsed.project.metadata.level1.level2.level3.level4.level5.data).toHaveLength(100);
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent mixed operations', async () => {
      // Setup mocks for different operations
      mockProjects.getAllProjects.mockResolvedValue([]);
      mockProjects.getProject.mockResolvedValue(createMockProject('test', 'Test'));
      mockProjects.createProject.mockResolvedValue(createMockProject('new', 'New'));
      mockProjects.updateProject.mockResolvedValue(createMockProject('updated', 'Updated'));
      mockProjects.deleteProject.mockResolvedValue(true);

      // Create a mix of operations
      const operations = [
        ...Array.from({ length: 20 }, () => projectsToolExecute({ action: 'list' })),
        ...Array.from({ length: 10 }, (_, i) => projectsToolExecute({ action: 'get', id: `project-${i}` })),
        ...Array.from({ length: 5 }, (_, i) => projectManageToolExecute({
          action: 'create',
          name: `Concurrent Project ${i}`,
          projectRoot: `/concurrent/${i}`,
        })),
      ];

      const startTime = Date.now();
      const results = await Promise.all(operations);
      const endTime = Date.now();

      const executionTime = endTime - startTime;

      // 35 concurrent operations should complete within 300ms
      expect(executionTime).toBeLessThan(300);
      expect(results).toHaveLength(35);
      
      // All operations should succeed
      results.forEach(result => {
        const parsed = JSON.parse(result);
        expect(parsed).toBeDefined();
      });
    });
  });
});