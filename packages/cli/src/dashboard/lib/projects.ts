import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface Project {
  id: string;
  name: string;
  projectRoot: string;
  setupScript?: string;
  devScript?: string;
  cleanupScript?: string;
  createdAt: string;
  updatedAt: string;
  tags?: string[];
  description?: string;
  status: 'active' | 'archived';
}

export interface ProjectsConfig {
  version: string;
  projects: Record<string, Project>;
}

const PROJECTS_FILE = path.join(os.homedir(), '.vibekit', 'projects.json');
const CURRENT_PROJECT_FILE = path.join(os.homedir(), '.vibekit', 'current-project.json');

export async function ensureProjectsFile(): Promise<void> {
  const vibeskitDir = path.dirname(PROJECTS_FILE);
  
  if (!await fs.pathExists(vibeskitDir)) {
    await fs.ensureDir(vibeskitDir);
  }
  
  if (!await fs.pathExists(PROJECTS_FILE)) {
    const initialConfig: ProjectsConfig = {
      version: "1.0.0",
      projects: {}
    };
    await fs.writeJson(PROJECTS_FILE, initialConfig, { spaces: 2 });
  }
}

export async function readProjectsConfig(): Promise<ProjectsConfig> {
  await ensureProjectsFile();
  
  try {
    return await fs.readJson(PROJECTS_FILE);
  } catch (error) {
    console.error('Failed to read projects config:', error);
    return {
      version: "1.0.0",
      projects: {}
    };
  }
}

export async function writeProjectsConfig(config: ProjectsConfig): Promise<void> {
  await ensureProjectsFile();
  await fs.writeJson(PROJECTS_FILE, config, { spaces: 2 });
}

export async function getAllProjects(): Promise<Project[]> {
  const config = await readProjectsConfig();
  return Object.values(config.projects);
}

export async function getProject(id: string): Promise<Project | null> {
  const config = await readProjectsConfig();
  return config.projects[id] || null;
}

export async function createProject(projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<Project> {
  const config = await readProjectsConfig();
  
  const now = new Date().toISOString();
  const project: Project = {
    id: uuidv4(),
    ...projectData,
    createdAt: now,
    updatedAt: now,
    status: projectData.status || 'active'
  };
  
  config.projects[project.id] = project;
  await writeProjectsConfig(config);
  
  return project;
}

export async function updateProject(id: string, updates: Partial<Omit<Project, 'id' | 'createdAt'>>): Promise<Project | null> {
  const config = await readProjectsConfig();
  
  if (!config.projects[id]) {
    return null;
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

export async function deleteProject(id: string): Promise<boolean> {
  const config = await readProjectsConfig();
  
  if (!config.projects[id]) {
    return false;
  }
  
  delete config.projects[id];
  await writeProjectsConfig(config);
  
  return true;
}

export async function getProjectByRepoPath(repoPath: string): Promise<Project | null> {
  const projects = await getAllProjects();
  return projects.find(p => p.projectRoot === repoPath) || null;
}

export async function getCurrentProject(): Promise<Project | null> {
  try {
    if (await fs.pathExists(CURRENT_PROJECT_FILE)) {
      return await fs.readJson(CURRENT_PROJECT_FILE);
    }
  } catch (error) {
    console.error('Failed to read current project:', error);
  }
  return null;
}

export async function setCurrentProject(project: Project): Promise<void> {
  await fs.writeJson(CURRENT_PROJECT_FILE, project, { spaces: 2 });
}