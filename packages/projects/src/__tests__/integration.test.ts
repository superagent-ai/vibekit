import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { ProjectCreateInput } from '../types';

// Create a unique test directory for each test run
const testDir = path.join(os.tmpdir(), 'vibekit-test-' + Date.now() + '-' + Math.random().toString(36).substring(7));

// Mock the constants module to use our test directory
vi.mock('../constants', () => {
  const path = require('path');
  const testDirMock = path.join(os.tmpdir(), 'vibekit-test-' + Date.now() + '-' + Math.random().toString(36).substring(7));
  return {
    VIBEKIT_DIR: path.join(testDirMock, '.vibekit'),
    PROJECTS_FILE: path.join(testDirMock, '.vibekit', 'projects.json'),
    CURRENT_PROJECT_FILE: path.join(testDirMock, '.vibekit', 'current-project.json'),
    PROJECTS_VERSION: '1.0.0',
    DEFAULT_PROJECTS_CONFIG: {
      version: '1.0.0',
      projects: {}
    }
  };
});

// Import after mocking
const {
  getAllProjects,
  createProject,
  updateProject,
  deleteProject,
  setCurrentProjectById,
  getCurrentProject,
  clearCurrentProject
} = await import('../index');

describe.skip('integration tests', () => {
  beforeEach(async () => {
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('complete project lifecycle', () => {
    it('should handle full CRUD operations', async () => {
      // 1. Initially no projects
      let projects = await getAllProjects();
      expect(projects).toHaveLength(0);

      // 2. Create first project
      const project1Data: ProjectCreateInput = {
        name: 'Test Project 1',
        projectRoot: path.join(testDir, 'project1'),
        description: 'First test project',
        tags: ['test', 'integration'],
        setupScript: 'npm install',
        devScript: 'npm run dev'
      };

      const project1 = await createProject(project1Data);
      expect(project1.id).toBeDefined();
      expect(project1.name).toBe('Test Project 1');
      expect(project1.status).toBe('active');

      // 3. Create second project
      const project2Data: ProjectCreateInput = {
        name: 'Test Project 2',
        projectRoot: path.join(testDir, 'project2'),
        description: 'Second test project'
      };

      const project2 = await createProject(project2Data);

      // 4. Verify both projects exist
      projects = await getAllProjects();
      expect(projects).toHaveLength(2);

      // 5. Update first project
      const updated = await updateProject(project1.id, {
        name: 'Updated Project 1',
        status: 'archived'
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated Project 1');
      expect(updated!.status).toBe('archived');

      // 6. Set current project
      await setCurrentProjectById(project2.id);
      const current = await getCurrentProject();
      expect(current).not.toBeNull();
      expect(current!.id).toBe(project2.id);

      // 7. Delete first project
      const deleted = await deleteProject(project1.id);
      expect(deleted).toBe(true);

      // 8. Verify only one project remains
      projects = await getAllProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(project2.id);

      // 9. Clear current project
      await clearCurrentProject();
      const noCurrent = await getCurrentProject();
      expect(noCurrent).toBeNull();
    });

    it('should persist data across reads', async () => {
      // Create a project
      const projectData: ProjectCreateInput = {
        name: 'Persistent Project',
        projectRoot: path.join(testDir, 'persistent'),
        description: 'Should persist'
      };

      const created = await createProject(projectData);
      const projectId = created.id;

      // Set as current project
      await setCurrentProjectById(projectId);

      // Read back immediately - data should persist
      const projects = await getAllProjects();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('Persistent Project');

      const current = await getCurrentProject();
      expect(current).not.toBeNull();
      expect(current!.id).toBe(projectId);
    });

    it('should handle concurrent operations safely', async () => {
      // Create multiple projects concurrently
      const createPromises = Array.from({ length: 5 }, (_, i) => 
        createProject({
          name: `Concurrent Project ${i}`,
          projectRoot: path.join(testDir, `concurrent${i}`)
        })
      );

      const createdProjects = await Promise.all(createPromises);

      // All should be created successfully
      expect(createdProjects).toHaveLength(5);
      createdProjects.forEach(p => expect(p.id).toBeDefined());

      // Verify all are saved
      const allProjects = await getAllProjects();
      expect(allProjects).toHaveLength(5);

      // Update all concurrently
      const updatePromises = createdProjects.map(p =>
        updateProject(p.id, { description: `Updated ${p.name}` })
      );

      const updatedProjects = await Promise.all(updatePromises);
      updatedProjects.forEach(p => {
        expect(p).not.toBeNull();
        expect(p!.description).toContain('Updated');
      });
    });

    it('should validate project data on creation', async () => {
      // Try to create project with invalid data
      const invalidData: ProjectCreateInput = {
        name: '',  // Empty name
        projectRoot: ''  // Empty path
      };

      await expect(createProject(invalidData)).rejects.toThrow('Validation failed');
    });

    it('should handle project not found scenarios', async () => {
      // Update non-existent project
      const updated = await updateProject('nonexistent', { name: 'Test' });
      expect(updated).toBeNull();

      // Delete non-existent project
      const deleted = await deleteProject('nonexistent');
      expect(deleted).toBe(false);

      // Set non-existent as current
      const setCurrent = await setCurrentProjectById('nonexistent');
      expect(setCurrent).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in project names', async () => {
      const specialName = 'Project @#$% & (Test) [Array] {Object}';
      const project = await createProject({
        name: specialName,
        projectRoot: path.join(testDir, 'special')
      });

      expect(project.name).toBe(specialName);

      const retrieved = await getAllProjects();
      expect(retrieved[0].name).toBe(specialName);
    });

    it('should handle very long project names and paths', async () => {
      const longName = 'A'.repeat(200);
      const longPath = path.join(testDir, 'b'.repeat(100));

      const project = await createProject({
        name: longName,
        projectRoot: longPath
      });

      expect(project.name).toBe(longName);
      expect(project.projectRoot).toBe(longPath);
    });

    it('should handle rapid create/delete cycles', async () => {
      for (let i = 0; i < 10; i++) {
        const project = await createProject({
          name: `Cycle Project ${i}`,
          projectRoot: path.join(testDir, `cycle${i}`)
        });

        const deleted = await deleteProject(project.id);
        expect(deleted).toBe(true);
      }

      const finalProjects = await getAllProjects();
      expect(finalProjects).toHaveLength(0);
    });
  });
});