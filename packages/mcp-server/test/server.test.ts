import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the projects module
vi.mock('@vibe-kit/projects', () => ({
  getAllProjects: vi.fn(),
  getProject: vi.fn(),
  getProjectByName: vi.fn(),
  getProjectByPath: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

const { 
  projectsToolExecute, 
  projectManageToolExecute
} = await import('../src/tools');

// Get mocked functions for testing
const mockProjects = await import('@vibe-kit/projects');

describe('MCP Server Tools', () => {
  let mockProject1: any;
  let mockProject2: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProject1 = {
      id: 'project-1',
      name: 'Test Project 1',
      projectRoot: '/path/to/project1',
      description: 'First test project',
      status: 'active',
      priority: 'high',
      tags: ['tag1', 'tag2'],
      createdAt: '2024-01-01',
      updatedAt: '2024-01-01',
    };

    mockProject2 = {
      id: 'project-2',
      name: 'Test Project 2',
      projectRoot: '/path/to/project2',
      description: 'Second test project',
      status: 'archived',
      priority: 'medium',
      tags: ['tag2', 'tag3'],
      createdAt: '2024-01-02',
      updatedAt: '2024-01-02',
    };

    // Set up default mock returns
    mockProjects.getAllProjects.mockResolvedValue([mockProject1, mockProject2]);
  });

  describe('projects tool', () => {
    it('should list all active projects by default', async () => {
      const result = await projectsToolExecute({ action: 'list' });
      const parsed = JSON.parse(result);

      expect(parsed.projects).toHaveLength(1); // Only active projects
      expect(parsed.projects[0].id).toBe('project-1');
      expect(parsed.total).toBe(1);
    });

    it('should list all projects when status is "all"', async () => {
      const result = await projectsToolExecute({ action: 'list', status: 'all' });
      const parsed = JSON.parse(result);

      expect(parsed.projects).toHaveLength(2);
      expect(parsed.total).toBe(2);
    });

    it('should get specific project by ID', async () => {
      mockProjects.getProject.mockResolvedValue(mockProject1);

      const result = await projectsToolExecute({ action: 'get', id: 'project-1' });
      const parsed = JSON.parse(result);

      expect(parsed.id).toBe('project-1');
      expect(parsed.name).toBe('Test Project 1');
      expect(mockProjects.getProject).toHaveBeenCalledWith('project-1');
    });

    it('should return error for non-existent project', async () => {
      mockProjects.getProject.mockResolvedValue(null);

      const result = await projectsToolExecute({ action: 'get', id: 'non-existent' });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('Project not found: non-existent');
    });

    it('should search projects by query', async () => {
      const result = await projectsToolExecute({ 
        action: 'search', 
        query: 'first',
        status: 'all' 
      });
      const parsed = JSON.parse(result);

      expect(parsed.projects).toHaveLength(1);
      expect(parsed.projects[0].id).toBe('project-1');
    });

    it('should filter projects by tags', async () => {
      const result = await projectsToolExecute({ 
        action: 'search', 
        tags: ['tag2'],
        status: 'all' 
      });
      const parsed = JSON.parse(result);

      expect(parsed.projects).toHaveLength(2); // Both projects have tag2
    });

    it('should filter projects by priority', async () => {
      const result = await projectsToolExecute({ 
        action: 'search', 
        priority: 'high',
        status: 'all' 
      });
      const parsed = JSON.parse(result);

      expect(parsed.projects).toHaveLength(1);
      expect(parsed.projects[0].priority).toBe('high');
    });

  });

  describe('project_manage tool', () => {
    it('should create new project', async () => {
      const newProject = { ...mockProject1, id: 'new-project', name: 'New Project' };
      mockProjects.createProject.mockResolvedValue(newProject);

      const result = await projectManageToolExecute({
        action: 'create',
        name: 'New Project',
        projectRoot: '/path/to/new',
        description: 'A new project',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.project.name).toBe('New Project');
      expect(mockProjects.createProject).toHaveBeenCalled();
    });

    it('should validate required fields for create', async () => {
      const result = await projectManageToolExecute({
        action: 'create',
        name: 'Missing Root',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Name and projectRoot are required for creating a project');
    });

    it('should update existing project', async () => {
      const updatedProject = { ...mockProject1, name: 'Updated Name' };
      mockProjects.updateProject.mockResolvedValue(updatedProject);

      const result = await projectManageToolExecute({
        action: 'update',
        id: 'project-1',
        name: 'Updated Name',
        description: 'Updated description',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.project.name).toBe('Updated Name');
      expect(mockProjects.updateProject).toHaveBeenCalledWith('project-1', {
        name: 'Updated Name',
        description: 'Updated description',
      });
    });

    it('should update project with all fields', async () => {
      const updatedProject = { ...mockProject1, name: 'Full Update' };
      mockProjects.updateProject.mockResolvedValue(updatedProject);

      const result = await projectManageToolExecute({
        action: 'update',
        id: 'project-1',
        name: 'Full Update',
        projectRoot: '/new/path',
        description: 'New description',
        setupScript: 'npm install',
        devScript: 'npm run dev',
        cleanupScript: 'npm run clean',
        tags: ['new', 'updated'],
        status: 'archived',
        priority: 'low',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(mockProjects.updateProject).toHaveBeenCalledWith('project-1', {
        name: 'Full Update',
        projectRoot: '/new/path',
        description: 'New description',
        setupScript: 'npm install',
        devScript: 'npm run dev',
        cleanupScript: 'npm run clean',
        tags: ['new', 'updated'],
        status: 'archived',
        priority: 'low',
      });
    });

    it('should validate ID for update', async () => {
      const result = await projectManageToolExecute({
        action: 'update',
        name: 'Updated Name',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('ID is required for updating a project');
    });

    it('should handle update of non-existent project', async () => {
      mockProjects.updateProject.mockResolvedValue(null);

      const result = await projectManageToolExecute({
        action: 'update',
        id: 'non-existent',
        name: 'Updated Name',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Project not found');
    });

    it('should delete project', async () => {
      mockProjects.deleteProject.mockResolvedValue(true);

      const result = await projectManageToolExecute({
        action: 'delete',
        id: 'project-1',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(true);
      expect(parsed.message).toBe('Project deleted successfully');
      expect(mockProjects.deleteProject).toHaveBeenCalledWith('project-1');
    });

    it('should validate ID for delete', async () => {
      const result = await projectManageToolExecute({
        action: 'delete',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('ID is required for deleting a project');
    });

    it('should handle delete of non-existent project', async () => {
      mockProjects.deleteProject.mockResolvedValue(false);

      const result = await projectManageToolExecute({
        action: 'delete',
        id: 'non-existent',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.message).toBe('Project not found');
    });

    it('should handle invalid action', async () => {
      const result = await projectManageToolExecute({
        action: 'invalid' as any,
      });
      const parsed = JSON.parse(result);

      expect(parsed.error).toBe('Invalid action');
    });

    it('should handle errors gracefully', async () => {
      mockProjects.createProject.mockRejectedValue(new Error('Database error'));

      const result = await projectManageToolExecute({
        action: 'create',
        name: 'Error Project',
        projectRoot: '/path/error',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Database error');
    });

    it('should handle non-Error exceptions', async () => {
      mockProjects.createProject.mockRejectedValue('String error');

      const result = await projectManageToolExecute({
        action: 'create',
        name: 'Error Project',
        projectRoot: '/path/error',
      });
      const parsed = JSON.parse(result);

      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Unknown error');
    });
  });

});