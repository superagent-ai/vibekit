import {
  readProjectsConfig,
  writeProjectsConfig,
  readCurrentProject,
  writeCurrentProject,
  clearCurrentProject as clearCurrent
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
  
  // Update current project if it's the one being updated
  const currentProject = await getCurrentProject();
  if (currentProject && currentProject.id === id) {
    await writeCurrentProject(updatedProject);
  }
  
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
  
  // Clear current project if it's the one being deleted
  const currentProject = await getCurrentProject();
  if (currentProject && currentProject.id === id) {
    await clearCurrent();
  }
  
  return true;
}

/**
 * Gets the current project
 */
export async function getCurrentProject(): Promise<Project | null> {
  return await readCurrentProject();
}

/**
 * Sets the current project
 */
export async function setCurrentProject(project: Project): Promise<void> {
  await writeCurrentProject(project);
}

/**
 * Sets the current project by ID
 */
export async function setCurrentProjectById(id: string): Promise<Project | null> {
  const project = await getProject(id);
  if (project) {
    await setCurrentProject(project);
    return project;
  }
  return null;
}

/**
 * Clears the current project
 */
export async function clearCurrentProject(): Promise<void> {
  await clearCurrent();
}