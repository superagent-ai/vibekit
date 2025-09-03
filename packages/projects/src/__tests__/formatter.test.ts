import { describe, it, expect } from 'vitest';
import { formatProjectsTable, formatProjectDetails } from '../formatter';
import type { Project } from '../types';

describe('formatter', () => {
  const mockProjects: Project[] = [
    {
      id: 'abc123',
      name: 'Project Alpha',
      projectRoot: '/home/user/projects/alpha',
      status: 'active',
      createdAt: '2024-01-01T10:00:00Z',
      updatedAt: '2024-01-15T14:30:00Z',
      description: 'Alpha project description',
      tags: ['frontend', 'react'],
      setupScript: 'npm install',
      devScript: 'npm run dev'
    },
    {
      id: 'def456',
      name: 'Beta Project with a Very Long Name That Should Be Truncated',
      projectRoot: '/home/user/projects/beta-with-very-long-path-that-should-also-be-truncated',
      status: 'archived',
      createdAt: '2024-02-01T09:00:00Z',
      updatedAt: '2024-02-10T16:45:00Z'
    }
  ];

  describe('formatProjectsTable', () => {
    it('should format empty projects list', () => {
      const result = formatProjectsTable([]);

      expect(result).toBe('No projects found');
    });

    it('should format projects as table', () => {
      const result = formatProjectsTable(mockProjects);

      // Check header
      expect(result).toContain('ID');
      expect(result).toContain('Name');
      expect(result).toContain('Project Root');
      expect(result).toContain('Status');

      // Check content
      expect(result).toContain('abc123');
      expect(result).toContain('Project Alpha');
      expect(result).toContain('active');
      expect(result).toContain('def456');
      expect(result).toContain('archived');
    });

    it('should handle long names and paths correctly', () => {
      const result = formatProjectsTable(mockProjects);

      // The formatter calculates column widths based on actual data
      // so long names/paths will be shown in full unless they exceed max lengths
      expect(result).toContain('Beta Project with a Very Long Name That Should Be Truncated');
      expect(result).toContain('beta-with-very-long-path-that-should-also-be-truncated');
      
      // Table should still be properly formatted
      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(4);
    });

    it('should align columns properly', () => {
      const result = formatProjectsTable(mockProjects);
      const lines = result.split('\n');

      // Header and separator should exist
      expect(lines.length).toBeGreaterThanOrEqual(4); // header + separator + 2 projects

      // Check separator line
      const separator = lines[1];
      expect(separator).toMatch(/^-+$/);
    });

    it('should handle projects with missing optional fields', () => {
      const minimalProject: Project = {
        id: 'min123',
        name: 'Minimal',
        projectRoot: '',
        status: 'active',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      };

      const result = formatProjectsTable([minimalProject]);

      expect(result).toContain('min123');
      expect(result).toContain('Minimal');
      expect(result).toContain('active');
    });

    it('should indicate current project with arrow when provided', () => {
      const currentProject = mockProjects[0]; // Project Alpha
      const result = formatProjectsTable(mockProjects, currentProject);

      // Check that the current project has the arrow indicator
      expect(result).toContain('▸ abc123');
      // Check that the other project has the regular spacing
      expect(result).toContain('  def456');
    });

    it('should show no indicator when current project does not match any project', () => {
      const nonMatchingCurrentProject: Project = {
        id: 'xyz999',
        name: 'Non-matching Project',
        projectRoot: '/non/matching',
        status: 'active',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01'
      };

      const result = formatProjectsTable(mockProjects, nonMatchingCurrentProject);

      // Both projects should have regular spacing since neither matches current
      expect(result).toContain('  abc123');
      expect(result).toContain('  def456');
      // Should not contain any arrow indicators
      expect(result).not.toContain('▸');
    });

    it('should handle null current project correctly', () => {
      const result = formatProjectsTable(mockProjects, null);

      // Both projects should have regular spacing
      expect(result).toContain('  abc123');
      expect(result).toContain('  def456');
      // Should not contain any arrow indicators
      expect(result).not.toContain('▸');
    });
  });

  describe('formatProjectDetails', () => {
    it('should format all project details', () => {
      const result = formatProjectDetails(mockProjects[0]);

      // Basic fields
      expect(result).toContain('ID: abc123');
      expect(result).toContain('Name: Project Alpha');
      expect(result).toContain('Project Root: /home/user/projects/alpha');
      expect(result).toContain('Status: active');

      // Optional fields
      expect(result).toContain('Description: Alpha project description');
      expect(result).toContain('Tags: frontend, react');
      expect(result).toContain('Setup Script: npm install');
      expect(result).toContain('Dev Script: npm run dev');

      // Timestamps
      expect(result).toContain('Created: ');
      expect(result).toContain('Updated: ');
    });

    it('should handle missing optional fields gracefully', () => {
      const minimalProject: Project = {
        id: 'min123',
        name: 'Minimal Project',
        projectRoot: '/minimal',
        status: 'active',
        createdAt: '2024-01-01T10:00:00Z',
        updatedAt: '2024-01-01T10:00:00Z'
      };

      const result = formatProjectDetails(minimalProject);

      expect(result).toContain('ID: min123');
      expect(result).toContain('Name: Minimal Project');
      expect(result).toContain('Status: active');

      // Should not show empty optional fields or show them as empty
      expect(result).not.toContain('Tags: ,');
      expect(result).not.toContain('undefined');
    });

    it('should format timestamps in readable format', () => {
      const result = formatProjectDetails(mockProjects[0]);

      // Should contain formatted dates (exact format may vary by locale)
      expect(result).toMatch(/Created: \d{1,2}\/\d{1,2}\/\d{4}/);
      expect(result).toMatch(/Updated: \d{1,2}\/\d{1,2}\/\d{4}/);
    });

    it('should handle empty arrays properly', () => {
      const projectWithEmptyTags: Project = {
        ...mockProjects[0],
        tags: []
      };

      const result = formatProjectDetails(projectWithEmptyTags);

      // Empty tags should not display or display as "Tags: "
      const tagMatch = result.match(/Tags: (.*)$/m);
      if (tagMatch) {
        expect(tagMatch[1].trim()).toBe('');
      }
    });

    it('should display archived status correctly', () => {
      const result = formatProjectDetails(mockProjects[1]);

      expect(result).toContain('Status: archived');
    });

    it('should display cleanup script when present', () => {
      const projectWithCleanup: Project = {
        ...mockProjects[0],
        cleanupScript: 'npm run cleanup'
      };
      
      const result = formatProjectDetails(projectWithCleanup);
      
      expect(result).toContain('Cleanup Script: npm run cleanup');
    });
  });
});