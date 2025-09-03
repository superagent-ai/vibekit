import { promises as fs } from 'fs';
import path from 'path';
import { 
  VIBEKIT_DIR, 
  PROJECTS_FILE, 
  DEFAULT_PROJECTS_CONFIG 
} from './constants';
import type { Project, ProjectsConfig } from './types';
import { createLogger } from '@vibe-kit/logger';

// Create logger for this module
const log = createLogger('projects-storage');

/**
 * Ensures the .vibekit directory and projects.json file exist
 */
export async function ensureProjectsFile(): Promise<void> {
  try {
    await fs.access(VIBEKIT_DIR);
  } catch {
    await fs.mkdir(VIBEKIT_DIR, { recursive: true });
  }
  
  try {
    await fs.access(PROJECTS_FILE);
  } catch {
    await fs.writeFile(PROJECTS_FILE, JSON.stringify(DEFAULT_PROJECTS_CONFIG, null, 2));
  }
}

/**
 * Reads the projects configuration from disk
 */
export async function readProjectsConfig(): Promise<ProjectsConfig> {
  await ensureProjectsFile();
  
  try {
    const data = await fs.readFile(PROJECTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    log.error('Failed to read projects config', error);
    return DEFAULT_PROJECTS_CONFIG;
  }
}

/**
 * Writes the projects configuration to disk
 */
export async function writeProjectsConfig(config: ProjectsConfig): Promise<void> {
  await ensureProjectsFile();
  await fs.writeFile(PROJECTS_FILE, JSON.stringify(config, null, 2));
}


/**
 * Checks if a path exists
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}