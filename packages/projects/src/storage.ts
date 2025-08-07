import fs from 'fs-extra';
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
  if (!await fs.pathExists(VIBEKIT_DIR)) {
    await fs.ensureDir(VIBEKIT_DIR);
  }
  
  if (!await fs.pathExists(PROJECTS_FILE)) {
    await fs.writeJson(PROJECTS_FILE, DEFAULT_PROJECTS_CONFIG, { spaces: 2 });
  }
}

/**
 * Reads the projects configuration from disk
 */
export async function readProjectsConfig(): Promise<ProjectsConfig> {
  await ensureProjectsFile();
  
  try {
    return await fs.readJson(PROJECTS_FILE);
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
  await fs.writeJson(PROJECTS_FILE, config, { spaces: 2 });
}

/**
 * Reads the current project from disk
 */
export async function readCurrentProject(): Promise<Project | null> {
  try {
    if (await fs.pathExists(CURRENT_PROJECT_FILE)) {
      return await fs.readJson(CURRENT_PROJECT_FILE);
    }
  } catch (error) {
    console.error('Failed to read current project:', error);
  }
  return null;
}

/**
 * Writes the current project to disk
 */
export async function writeCurrentProject(project: Project): Promise<void> {
  await fs.writeJson(CURRENT_PROJECT_FILE, project, { spaces: 2 });
}

/**
 * Clears the current project
 */
export async function clearCurrentProject(): Promise<void> {
  try {
    if (await fs.pathExists(CURRENT_PROJECT_FILE)) {
      await fs.remove(CURRENT_PROJECT_FILE);
    }
  } catch (error) {
    console.error('Failed to clear current project:', error);
  }
}

/**
 * Checks if a path exists
 */
export async function pathExists(filePath: string): Promise<boolean> {
  try {
    return await fs.pathExists(filePath);
  } catch {
    return false;
  }
}