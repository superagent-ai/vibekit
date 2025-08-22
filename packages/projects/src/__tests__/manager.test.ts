import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAllProjects,
  getProject,
  getProjectByName,
  getProjectByPath,
  createProject,
  updateProject,
  deleteProject
} from '../manager';
import * as storage from '../storage';
import * as validator from '../validator';
import type { Project, ProjectCreateInput, ProjectUpdateInput, ProjectsConfig } from '../types';

// Mock storage and validator modules
vi.mock('../storage');
vi.mock('../validator');

describe('manager', () => {
  const mockConfig: ProjectsConfig = {
    version: '1.0.0',
    projects: {
      'project1': {
        id: 'project1',
        name: 'Project One',
        projectRoot: '/path/one',
        status: 'active',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      },
      'project2': {
        id: 'project2',
        name: 'Project Two',
        projectRoot: '/path/two',
        status: 'archived',
        createdAt: '2024-01-02',
        updatedAt: '2024-01-02'
      }
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (storage.readProjectsConfig as any).mockResolvedValue(mockConfig);
    (validator.validateProjectData as any).mockResolvedValue([]);
    (validator.generateProjectId as any).mockReturnValue('newid123');
  });

  describe('getAllProjects', () => {
    it('should return all projects as array', async () => {
      const projects = await getAllProjects();

      expect(projects).toHaveLength(2);
      expect(projects).toContainEqual(mockConfig.projects.project1);
      expect(projects).toContainEqual(mockConfig.projects.project2);
    });

    it('should return empty array when no projects', async () => {
      (storage.readProjectsConfig as any).mockResolvedValue({
        version: '1.0.0',
        projects: {}
      });

      const projects = await getAllProjects();

      expect(projects).toEqual([]);
    });
  });

  describe('getProject', () => {
    it('should return project by ID', async () => {
      const project = await getProject('project1');

      expect(project).toEqual(mockConfig.projects.project1);
    });

    it('should return null for non-existent ID', async () => {
      const project = await getProject('nonexistent');

      expect(project).toBeNull();
    });
  });

  describe('getProjectByName', () => {
    it('should return project by name', async () => {
      const project = await getProjectByName('Project One');

      expect(project).toEqual(mockConfig.projects.project1);
    });

    it('should return null for non-existent name', async () => {
      const project = await getProjectByName('Nonexistent Project');

      expect(project).toBeNull();
    });
  });

  describe('getProjectByPath', () => {
    it('should return project by path', async () => {
      const project = await getProjectByPath('/path/two');

      expect(project).toEqual(mockConfig.projects.project2);
    });

    it('should return null for non-existent path', async () => {
      const project = await getProjectByPath('/nonexistent/path');

      expect(project).toBeNull();
    });
  });

  describe('createProject', () => {
    it('should create new project with valid data', async () => {
      const input: ProjectCreateInput = {
        name: 'New Project',
        projectRoot: '/new/path',
        description: 'Test description',
        tags: ['test']
      };

      const result = await createProject(input);

      expect(result).toMatchObject({
        id: 'newid123',
        name: 'New Project',
        projectRoot: '/new/path',
        description: 'Test description',
        tags: ['test'],
        status: 'active'
      });

      expect(storage.writeProjectsConfig).toHaveBeenCalled();
    });

    it('should throw error with validation errors', async () => {
      (validator.validateProjectData as any).mockResolvedValue(['Name required']);

      const input: ProjectCreateInput = {
        name: '',
        projectRoot: '/path'
      };

      await expect(createProject(input)).rejects.toThrow('Validation failed: Name required');
    });

    it('should set default values for optional fields', async () => {
      const input: ProjectCreateInput = {
        name: 'Minimal Project',
        projectRoot: '/minimal/path'
      };

      const result = await createProject(input);

      expect(result.setupScript).toBe('');
      expect(result.devScript).toBe('');
      expect(result.cleanupScript).toBe('');
      expect(result.tags).toEqual([]);
      expect(result.description).toBe('');
      expect(result.status).toBe('active');
    });
  });

  describe('updateProject', () => {
    it('should update existing project', async () => {
      const updates: ProjectUpdateInput = {
        name: 'Updated Name',
        status: 'archived'
      };

      const result = await updateProject('project1', updates);

      expect(result).toMatchObject({
        id: 'project1',
        name: 'Updated Name',
        status: 'archived',
        projectRoot: '/path/one'
      });

      expect(storage.writeProjectsConfig).toHaveBeenCalled();
    });

    it('should return null for non-existent project', async () => {
      const result = await updateProject('nonexistent', { name: 'Test' });

      expect(result).toBeNull();
      expect(storage.writeProjectsConfig).not.toHaveBeenCalled();
    });

    it('should throw error with validation errors', async () => {
      (validator.validateProjectData as any).mockResolvedValue(['Invalid status']);

      await expect(updateProject('project1', { status: 'invalid' as any }))
        .rejects.toThrow('Validation failed: Invalid status');
    });

  });

  describe('deleteProject', () => {
    it('should delete existing project', async () => {
      const result = await deleteProject('project1');

      expect(result).toBe(true);
      expect(storage.writeProjectsConfig).toHaveBeenCalled();
    });

    it('should return false for non-existent project', async () => {
      const result = await deleteProject('nonexistent');

      expect(result).toBe(false);
      expect(storage.writeProjectsConfig).not.toHaveBeenCalled();
    });

  });
});