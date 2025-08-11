import { promises as fs } from 'fs';
import path from 'path';
import { 
  VIBEKIT_DIR, 
  PROJECTS_FILE, 
  CURRENT_PROJECT_FILE,
  DEFAULT_PROJECTS_CONFIG 
} from './constants';
import type { Project, ProjectsConfig } from './types';

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
    console.error('Failed to read projects config:', error);
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
 * Reads the current project from disk
 */
export async function readCurrentProject(): Promise<Project | null> {
  try {
    await fs.access(CURRENT_PROJECT_FILE);
    const data = await fs.readFile(CURRENT_PROJECT_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error: any) {
    // Don't log ENOENT errors as they're expected when no current project is set
    if (error.code !== 'ENOENT') {
      console.error('Failed to read current project:', error);
    }
    return null;
  }
}

/**
 * Writes the current project to disk
 */
export async function writeCurrentProject(project: Project): Promise<void> {
  await fs.writeFile(CURRENT_PROJECT_FILE, JSON.stringify(project, null, 2));
}

/**
 * Clears the current project
 */
export async function clearCurrentProject(): Promise<void> {
  try {
    await fs.unlink(CURRENT_PROJECT_FILE);
  } catch (error) {
    // File doesn't exist or other error - that's fine for clearing
    console.error('Failed to clear current project:', error);
  }
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