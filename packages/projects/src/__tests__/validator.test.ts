import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateProjectData, generateProjectId, truncate } from '../validator';
import { pathExists } from '../storage';
import type { ProjectCreateInput, ProjectUpdateInput } from '../types';

// Mock storage module
vi.mock('../storage', () => ({
  pathExists: vi.fn()
}));

describe('validator', () => {
  describe('validateProjectData', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe('for project creation', () => {
      it('should validate required fields', async () => {
        const data: ProjectCreateInput = {
          name: '',
          projectRoot: ''
        };

        const errors = await validateProjectData(data, true);

        expect(errors).toContain('Project name is required');
        expect(errors).toContain('Project root path is required');
      });

      it('should pass validation with valid data', async () => {
        const data: ProjectCreateInput = {
          name: 'Test Project',
          projectRoot: '/test/path',
          status: 'active',
          tags: ['test', 'sample']
        };

        const errors = await validateProjectData(data, true);

        expect(errors).toHaveLength(0);
      });

      it('should allow non-existent path when allowNonExistentPath is true', async () => {
        const data: ProjectCreateInput = {
          name: 'Test Project',
          projectRoot: '/nonexistent/path'
        };

        (pathExists as any).mockResolvedValue(false);

        const errors = await validateProjectData(data, true);

        expect(errors).toHaveLength(0);
      });

      it('should reject non-existent path when allowNonExistentPath is false', async () => {
        const data: ProjectCreateInput = {
          name: 'Test Project',
          projectRoot: '/nonexistent/path'
        };

        (pathExists as any).mockResolvedValue(false);

        const errors = await validateProjectData(data, false);

        expect(errors).toContain('Project root path does not exist: /nonexistent/path');
      });
    });

    describe('for project update', () => {
      it('should allow partial updates', async () => {
        const data: ProjectUpdateInput = {
          name: 'Updated Name'
        };

        const errors = await validateProjectData(data, true);

        expect(errors).toHaveLength(0);
      });

      it('should validate status values', async () => {
        const data: ProjectUpdateInput = {
          status: 'invalid' as any
        };

        const errors = await validateProjectData(data, true);

        expect(errors).toContain('Status must be either "active" or "archived"');
      });

      it('should validate tags type', async () => {
        const data: ProjectUpdateInput = {
          tags: 'not-an-array' as any
        };

        const errors = await validateProjectData(data, true);

        expect(errors).toContain('Tags must be an array');
      });
    });

    describe('edge cases', () => {
      it('should handle whitespace-only values', async () => {
        const data: ProjectCreateInput = {
          name: '   ',
          projectRoot: '\t\n'
        };

        const errors = await validateProjectData(data, true);

        expect(errors).toContain('Project name is required');
        expect(errors).toContain('Project root path is required');
      });

      it('should validate archived status', async () => {
        const data: ProjectUpdateInput = {
          status: 'archived'
        };

        const errors = await validateProjectData(data, true);

        expect(errors).toHaveLength(0);
      });
    });
  });

  describe('generateProjectId', () => {
    it('should generate 8-character hex string', () => {
      const id = generateProjectId();

      expect(id).toHaveLength(8);
      expect(id).toMatch(/^[a-f0-9]{8}$/);
    });

    it('should generate unique IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateProjectId());
      }

      // All IDs should be unique
      expect(ids.size).toBe(100);
    });
  });

  describe('truncate', () => {
    it('should not truncate strings shorter than max length', () => {
      const result = truncate('short', 10);

      expect(result).toBe('short');
    });

    it('should truncate strings longer than max length', () => {
      const result = truncate('this is a very long string', 10);

      expect(result).toBe('this is...');
    });

    it('should handle exact length strings', () => {
      const result = truncate('exactly10!', 10);

      expect(result).toBe('exactly10!');
    });

    it('should handle empty strings', () => {
      const result = truncate('', 10);

      expect(result).toBe('');
    });

    it('should handle very small max lengths', () => {
      const result = truncate('test', 3);

      expect(result).toBe('...');
    });
  });
});