import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import {
  ensureProjectsFile,
  readProjectsConfig,
  writeProjectsConfig,
  pathExists
} from '../storage';
import { VIBEKIT_DIR, PROJECTS_FILE, DEFAULT_PROJECTS_CONFIG } from '../constants';
import type { Project, ProjectsConfig } from '../types';

// Mock fs module
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn()
  }
}));

describe('storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureProjectsFile', () => {
    it('should create .vibekit directory if it does not exist', async () => {
      (fs.access as any).mockRejectedValueOnce(new Error('ENOENT'));
      (fs.access as any).mockRejectedValueOnce(new Error('ENOENT'));

      await ensureProjectsFile();

      expect(fs.mkdir).toHaveBeenCalledWith(VIBEKIT_DIR, { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        PROJECTS_FILE,
        JSON.stringify(DEFAULT_PROJECTS_CONFIG, null, 2)
      );
    });

    it('should not create directory if it already exists', async () => {
      (fs.access as any).mockResolvedValue(undefined);

      await ensureProjectsFile();

      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it('should create projects.json if it does not exist', async () => {
      (fs.access as any).mockResolvedValueOnce(undefined); // directory exists
      (fs.access as any).mockRejectedValueOnce(new Error('ENOENT')); // file doesn't exist

      await ensureProjectsFile();

      expect(fs.writeFile).toHaveBeenCalledWith(
        PROJECTS_FILE,
        JSON.stringify(DEFAULT_PROJECTS_CONFIG, null, 2)
      );
    });
  });

  describe('readProjectsConfig', () => {
    it('should read and parse projects config', async () => {
      const mockConfig: ProjectsConfig = {
        version: '1.0.0',
        projects: {
          'test-id': {
            id: 'test-id',
            name: 'Test Project',
            projectRoot: '/test/path',
            status: 'active',
            createdAt: '2024-01-01',
            updatedAt: '2024-01-01'
          }
        }
      };

      // Mock ensureProjectsFile calls
      (fs.access as any).mockResolvedValue(undefined); // Both directory and file exist
      (fs.readFile as any).mockResolvedValue(JSON.stringify(mockConfig));

      const result = await readProjectsConfig();

      expect(result).toEqual(mockConfig);
      expect(fs.readFile).toHaveBeenCalledWith(PROJECTS_FILE, 'utf-8');
    });

    it('should return default config on read error', async () => {
      // Mock ensureProjectsFile calls
      (fs.access as any).mockResolvedValue(undefined); // Directory and file exist
      (fs.readFile as any).mockRejectedValue(new Error('Read error'));

      const result = await readProjectsConfig();

      expect(result).toEqual(DEFAULT_PROJECTS_CONFIG);
    });
  });

  describe('writeProjectsConfig', () => {
    it('should write projects config as JSON', async () => {
      const mockConfig: ProjectsConfig = {
        version: '1.0.0',
        projects: {}
      };

      // Mock ensureProjectsFile calls
      (fs.access as any).mockResolvedValue(undefined); // Both directory and file exist
      (fs.writeFile as any).mockResolvedValue(undefined);

      await writeProjectsConfig(mockConfig);

      expect(fs.writeFile).toHaveBeenCalledWith(
        PROJECTS_FILE,
        JSON.stringify(mockConfig, null, 2)
      );
    });
  });


  describe('pathExists', () => {
    it('should return true when path exists', async () => {
      (fs.access as any).mockResolvedValue(undefined);

      const result = await pathExists('/some/path');

      expect(result).toBe(true);
    });

    it('should return false when path does not exist', async () => {
      (fs.access as any).mockRejectedValue(new Error('ENOENT'));

      const result = await pathExists('/nonexistent/path');

      expect(result).toBe(false);
    });
  });
});