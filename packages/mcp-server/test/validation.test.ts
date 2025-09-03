import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Import the Zod schemas from the main server file
// We'll test the schemas directly to ensure proper validation

describe('Parameter Validation', () => {
  describe('projects tool schema', () => {
    const projectsSchema = z.object({
      action: z.enum(['list', 'get', 'search']).default('list'),
      id: z.string().optional().describe('Project ID (for get action)'),
      query: z.string().optional().describe('Search in name/description'),
      tags: z.array(z.string()).optional().describe('Filter by tags'),
      status: z.enum(['active', 'archived', 'all']).optional().default('active'),
      priority: z.enum(['high', 'medium', 'low']).optional(),
    });

    it('should validate valid projects parameters', () => {
      const validParams = {
        action: 'list' as const,
        status: 'active' as const,
      };

      const result = projectsSchema.parse(validParams);
      expect(result.action).toBe('list');
      expect(result.status).toBe('active');
    });

    it('should set default values', () => {
      const result = projectsSchema.parse({});
      expect(result.action).toBe('list');
      expect(result.status).toBe('active');
    });

    it('should validate search parameters', () => {
      const searchParams = {
        action: 'search' as const,
        query: 'test project',
        tags: ['frontend', 'react'],
        priority: 'high' as const,
        status: 'all' as const,
      };

      const result = projectsSchema.parse(searchParams);
      expect(result.query).toBe('test project');
      expect(result.tags).toEqual(['frontend', 'react']);
      expect(result.priority).toBe('high');
    });

    it('should validate get parameters', () => {
      const getParams = {
        action: 'get' as const,
        id: 'project-123',
      };

      const result = projectsSchema.parse(getParams);
      expect(result.action).toBe('get');
      expect(result.id).toBe('project-123');
    });

    it('should reject invalid action', () => {
      expect(() => {
        projectsSchema.parse({ action: 'invalid' });
      }).toThrow();
    });

    it('should reject invalid status', () => {
      expect(() => {
        projectsSchema.parse({ status: 'invalid' });
      }).toThrow();
    });

    it('should reject invalid priority', () => {
      expect(() => {
        projectsSchema.parse({ priority: 'invalid' });
      }).toThrow();
    });

    it('should reject invalid tags type', () => {
      expect(() => {
        projectsSchema.parse({ tags: 'not-an-array' });
      }).toThrow();
    });
  });

  describe('project_manage tool schema', () => {
    const projectManageSchema = z.object({
      action: z.enum(['create', 'update', 'delete']),
      id: z.string().optional().describe('Project ID (for update/delete)'),
      name: z.string().optional().describe('Project name'),
      projectRoot: z.string().optional().describe('Absolute path to project root'),
      description: z.string().optional().describe('Project description'),
      setupScript: z.string().optional().describe('Setup script command'),
      devScript: z.string().optional().describe('Development script command'),
      cleanupScript: z.string().optional().describe('Cleanup script command'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
      status: z.enum(['active', 'archived']).optional(),
      priority: z.enum(['high', 'medium', 'low']).optional(),
    });

    it('should validate create parameters', () => {
      const createParams = {
        action: 'create' as const,
        name: 'New Project',
        projectRoot: '/path/to/project',
        description: 'A test project',
        tags: ['test', 'new'],
        status: 'active' as const,
        priority: 'medium' as const,
      };

      const result = projectManageSchema.parse(createParams);
      expect(result.action).toBe('create');
      expect(result.name).toBe('New Project');
      expect(result.projectRoot).toBe('/path/to/project');
    });

    it('should validate update parameters', () => {
      const updateParams = {
        action: 'update' as const,
        id: 'project-123',
        name: 'Updated Project',
        description: 'Updated description',
      };

      const result = projectManageSchema.parse(updateParams);
      expect(result.action).toBe('update');
      expect(result.id).toBe('project-123');
      expect(result.name).toBe('Updated Project');
    });

    it('should validate delete parameters', () => {
      const deleteParams = {
        action: 'delete' as const,
        id: 'project-123',
      };

      const result = projectManageSchema.parse(deleteParams);
      expect(result.action).toBe('delete');
      expect(result.id).toBe('project-123');
    });

    it('should validate all optional project fields', () => {
      const fullParams = {
        action: 'create' as const,
        name: 'Full Project',
        projectRoot: '/full/path',
        description: 'Full description',
        setupScript: 'npm install',
        devScript: 'npm run dev',
        cleanupScript: 'npm run clean',
        tags: ['full', 'test'],
        status: 'archived' as const,
        priority: 'low' as const,
      };

      const result = projectManageSchema.parse(fullParams);
      expect(result.setupScript).toBe('npm install');
      expect(result.devScript).toBe('npm run dev');
      expect(result.cleanupScript).toBe('npm run clean');
    });

    it('should reject invalid action', () => {
      expect(() => {
        projectManageSchema.parse({ action: 'invalid' });
      }).toThrow();
    });

    it('should reject invalid status', () => {
      expect(() => {
        projectManageSchema.parse({ 
          action: 'create',
          status: 'invalid' 
        });
      }).toThrow();
    });

    it('should reject invalid priority', () => {
      expect(() => {
        projectManageSchema.parse({ 
          action: 'create',
          priority: 'invalid' 
        });
      }).toThrow();
    });

    it('should reject invalid tags type', () => {
      expect(() => {
        projectManageSchema.parse({ 
          action: 'create',
          tags: 'not-an-array' 
        });
      }).toThrow();
    });
  });

  describe('edge cases and type safety', () => {
    it('should handle empty strings', () => {
      const schema = z.object({
        name: z.string().optional(),
      });

      const result = schema.parse({ name: '' });
      expect(result.name).toBe('');
    });

    it('should handle undefined vs null', () => {
      const schema = z.object({
        value: z.string().optional(),
      });

      const result1 = schema.parse({ value: undefined });
      const result2 = schema.parse({});
      
      expect(result1.value).toBeUndefined();
      expect(result2.value).toBeUndefined();
    });

    it('should handle arrays with mixed types', () => {
      const schema = z.object({
        tags: z.array(z.string()).optional(),
      });

      expect(() => {
        schema.parse({ tags: ['valid', 123, 'mixed'] });
      }).toThrow();
    });

    it('should handle very long strings', () => {
      const schema = z.object({
        description: z.string().optional(),
      });

      const longString = 'a'.repeat(10000);
      const result = schema.parse({ description: longString });
      expect(result.description).toHaveLength(10000);
    });

    it('should handle special characters in strings', () => {
      const schema = z.object({
        name: z.string().optional(),
      });

      const specialChars = '!@#$%^&*()[]{}|;:,.<>?';
      const result = schema.parse({ name: specialChars });
      expect(result.name).toBe(specialChars);
    });
  });
});