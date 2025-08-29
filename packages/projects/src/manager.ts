import {
  readProjectsConfig,
  writeProjectsConfig
} from './storage';
import { validateProjectData, generateProjectId } from './validator';
import type { Project, ProjectCreateInput, ProjectUpdateInput } from './types';

/**
 * Gets all projects
 */
export async function getAllProjects(): Promise<Project[]> {
  const config = await readProjectsConfig();
  return Object.values(config.projects);
}

/**
 * Gets a project by ID
 */
export async function getProject(id: string): Promise<Project | null> {
  const config = await readProjectsConfig();
  return config.projects[id] || null;
}

/**
 * Gets a project by name
 */
export async function getProjectByName(name: string): Promise<Project | null> {
  const projects = await getAllProjects();
  return projects.find(p => p.name === name) || null;
}

/**
 * Gets a project by repository path
 */
export async function getProjectByPath(projectRoot: string): Promise<Project | null> {
  const projects = await getAllProjects();
  return projects.find(p => p.projectRoot === projectRoot) || null;
}

/**
 * Creates a new project
 */
export async function createProject(data: ProjectCreateInput): Promise<Project> {
  // Validate the input
  const errors = await validateProjectData(data, true);
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
  
  const config = await readProjectsConfig();
  const now = new Date().toISOString();
  
  // Calculate rank for new project (add to end)
  const existingProjects = Object.values(config.projects);
  const maxRank = existingProjects.reduce((max, p) => {
    const rank = p.rank ?? 0;
    return rank > max ? rank : max;
  }, 0);
  
  const project: Project = {
    id: generateProjectId(),
    name: data.name,
    projectRoot: data.projectRoot,
    setupScript: data.setupScript || '',
    devScript: data.devScript || '',
    cleanupScript: data.cleanupScript || '',
    tags: data.tags || [],
    description: data.description || '',
    status: data.status || 'active',
    rank: data.rank ?? (maxRank + 1),
    priority: data.priority || 'medium',
    createdAt: now,
    updatedAt: now
  };
  
  config.projects[project.id] = project;
  await writeProjectsConfig(config);
  
  return project;
}

/**
 * Updates an existing project
 */
export async function updateProject(
  id: string, 
  updates: ProjectUpdateInput
): Promise<Project | null> {
  const config = await readProjectsConfig();
  
  if (!config.projects[id]) {
    return null;
  }
  
  // Validate the updates
  const errors = await validateProjectData(updates, false);
  if (errors.length > 0) {
    throw new Error(`Validation failed: ${errors.join(', ')}`);
  }
  
  const updatedProject = {
    ...config.projects[id],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  config.projects[id] = updatedProject;
  await writeProjectsConfig(config);
  
  return updatedProject;
}

/**
 * Deletes a project
 */
export async function deleteProject(id: string): Promise<boolean> {
  const config = await readProjectsConfig();
  
  if (!config.projects[id]) {
    return false;
  }
  
  delete config.projects[id];
  await writeProjectsConfig(config);
  
  return true;
}

/**
 * ProjectsManager class for compatibility with existing code
 */
export class ProjectsManager {
  async listProjects(): Promise<Project[]> {
    return getAllProjects();
  }

  async getProject(id: string): Promise<Project | null> {
    return getProject(id);
  }

  async getProjectByName(name: string): Promise<Project | null> {
    return getProjectByName(name);
  }

  async getProjectByPath(projectRoot: string): Promise<Project | null> {
    return getProjectByPath(projectRoot);
  }

  async createProject(data: ProjectCreateInput): Promise<Project> {
    return createProject(data);
  }

  async updateProject(id: string, updates: ProjectUpdateInput): Promise<Project | null> {
    return updateProject(id, updates);
  }

  async deleteProject(id: string): Promise<boolean> {
    return deleteProject(id);
  }
}

