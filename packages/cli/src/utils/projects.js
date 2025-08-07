import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const PROJECTS_FILE = path.join(os.homedir(), '.vibekit', 'projects.json');
const CURRENT_PROJECT_FILE = path.join(os.homedir(), '.vibekit', 'current-project.json');

export async function ensureProjectsFile() {
  const vibeskitDir = path.dirname(PROJECTS_FILE);
  
  if (!await fs.pathExists(vibeskitDir)) {
    await fs.ensureDir(vibeskitDir);
  }
  
  if (!await fs.pathExists(PROJECTS_FILE)) {
    const initialConfig = {
      version: "1.0.0",
      projects: {}
    };
    await fs.writeJson(PROJECTS_FILE, initialConfig, { spaces: 2 });
  }
}

export async function readProjectsConfig() {
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

export async function writeProjectsConfig(config) {
  await ensureProjectsFile();
  await fs.writeJson(PROJECTS_FILE, config, { spaces: 2 });
}

export async function getAllProjects() {
  const config = await readProjectsConfig();
  return Object.values(config.projects);
}

export async function getProject(id) {
  const config = await readProjectsConfig();
  return config.projects[id] || null;
}

export async function createProject(projectData) {
  const config = await readProjectsConfig();
  
  const now = new Date().toISOString();
  const project = {
    id: generateId(),
    ...projectData,
    createdAt: now,
    updatedAt: now,
    status: projectData.status || 'active'
  };
  
  config.projects[project.id] = project;
  await writeProjectsConfig(config);
  
  return project;
}

export async function updateProject(id, updates) {
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

export async function deleteProject(id) {
  const config = await readProjectsConfig();
  
  if (!config.projects[id]) {
    return false;
  }
  
  delete config.projects[id];
  await writeProjectsConfig(config);
  
  // Also remove from current project if it was selected
  try {
    const currentProject = await getCurrentProject();
    if (currentProject && currentProject.id === id) {
      await clearCurrentProject();
    }
  } catch (error) {
    // Ignore errors when clearing current project
  }
  
  return true;
}

export async function setCurrentProject(project) {
  await fs.writeJson(CURRENT_PROJECT_FILE, project, { spaces: 2 });
}

export async function getCurrentProject() {
  try {
    if (await fs.pathExists(CURRENT_PROJECT_FILE)) {
      return await fs.readJson(CURRENT_PROJECT_FILE);
    }
  } catch (error) {
    // Ignore errors, return null
  }
  return null;
}

export async function clearCurrentProject() {
  try {
    if (await fs.pathExists(CURRENT_PROJECT_FILE)) {
      await fs.remove(CURRENT_PROJECT_FILE);
    }
  } catch (error) {
    // Ignore errors
  }
}

export async function validateProjectData(projectData) {
  const errors = [];
  
  if (!projectData.name || !projectData.name.trim()) {
    errors.push('Project name is required');
  }
  
  if (!projectData.gitRepoPath || !projectData.gitRepoPath.trim()) {
    errors.push('Git repository path is required');
  } else {
    // Check if the path exists
    try {
      const stats = await fs.stat(projectData.gitRepoPath);
      if (!stats.isDirectory()) {
        errors.push('Git repository path must be a directory');
      }
    } catch (error) {
      errors.push(`Git repository path does not exist: ${projectData.gitRepoPath}`);
    }
  }
  
  return errors;
}

export function formatProjectsTable(projects) {
  if (projects.length === 0) {
    return 'No projects found';
  }
  
  // Calculate column widths
  const maxIdLength = Math.max(6, ...projects.map(p => p.id.length));
  const maxNameLength = Math.max(20, ...projects.map(p => p.name.length));
  const maxPathLength = Math.max(30, ...projects.map(p => p.gitRepoPath.length));
  const maxStatusLength = Math.max(8, ...projects.map(p => p.status.length));
  
  // Create header
  const header = `${'ID'.padEnd(maxIdLength)} | ${'Name'.padEnd(maxNameLength)} | ${'Repository Path'.padEnd(maxPathLength)} | ${'Status'.padEnd(maxStatusLength)}`;
  const separator = '-'.repeat(header.length);
  
  // Create rows
  const rows = projects.map(project => {
    const id = project.id.padEnd(maxIdLength);
    const name = truncate(project.name, maxNameLength).padEnd(maxNameLength);
    const path = truncate(project.gitRepoPath, maxPathLength).padEnd(maxPathLength);
    const status = project.status.padEnd(maxStatusLength);
    
    return `${id} | ${name} | ${path} | ${status}`;
  });
  
  return [header, separator, ...rows].join('\n');
}

export function formatProjectDetails(project) {
  const lines = [
    `ID: ${project.id}`,
    `Name: ${project.name}`,
    `Git Repository: ${project.gitRepoPath}`,
    `Status: ${project.status}`,
    `Created: ${new Date(project.createdAt).toLocaleString()}`,
    `Updated: ${new Date(project.updatedAt).toLocaleString()}`
  ];
  
  if (project.description) {
    lines.push(`Description: ${project.description}`);
  }
  
  if (project.tags && project.tags.length > 0) {
    lines.push(`Tags: ${project.tags.join(', ')}`);
  }
  
  if (project.setupScript) {
    lines.push(`Setup Script: ${project.setupScript}`);
  }
  
  if (project.devScript) {
    lines.push(`Dev Script: ${project.devScript}`);
  }
  
  if (project.cleanupScript) {
    lines.push(`Cleanup Script: ${project.cleanupScript}`);
  }
  
  return lines.join('\n');
}

function generateId() {
  return crypto.randomBytes(4).toString('hex');
}

function truncate(str, maxLength) {
  if (str.length <= maxLength) {
    return str;
  }
  return str.substring(0, maxLength - 3) + '...';
}