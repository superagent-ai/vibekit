// Re-export everything from the @vibe-kit/projects package
export {
  // Types
  // Project management
  getAllProjects,
  getProject,
  getProjectByName,
  getProjectByPath,
  createProject,
  updateProject,
  deleteProject,
  getCurrentProject,
  setCurrentProject,
  setCurrentProjectById,
  clearCurrentProject,
  // Storage utilities
  ensureProjectsFile,
  readProjectsConfig,
  writeProjectsConfig,
  readCurrentProject as getCurrentProjectFromFile,
  writeCurrentProject as setCurrentProjectToFile,
  pathExists,
  // Validation utilities
  validateProjectData,
  generateProjectId,
  truncate,
  // Formatting utilities
  formatProjectsTable,
  formatProjectDetails,
  // Constants
  VIBEKIT_DIR,
  PROJECTS_FILE,
  CURRENT_PROJECT_FILE,
  PROJECTS_VERSION,
  DEFAULT_PROJECTS_CONFIG
} from '@vibe-kit/projects';

// Re-export with chalk for colored output in CLI
import chalk from 'chalk';
import { formatProjectsTable as formatTable, truncate } from '@vibe-kit/projects';

export function formatProjectsTableWithColor(projects, currentProject = null) {
  if (projects.length === 0) {
    return 'No projects found';
  }
  
  // Calculate column widths (add 2 for the indicator)
  const maxIdLength = Math.max(6, ...projects.map(p => p.id.length));
  const maxNameLength = Math.max(20, ...projects.map(p => p.name.length));
  const maxPathLength = Math.max(30, ...projects.map(p => (p.projectRoot || '').length));
  const maxStatusLength = Math.max(8, ...projects.map(p => p.status.length));
  
  // Create header
  const header = `  ${'ID'.padEnd(maxIdLength)} | ${'Name'.padEnd(maxNameLength)} | ${'Project Root'.padEnd(maxPathLength)} | ${'Status'.padEnd(maxStatusLength)}`;
  const separator = '-'.repeat(header.length);
  
  // Create rows
  const rows = projects.map(project => {
    const isSelected = currentProject && currentProject.id === project.id;
    const indicator = isSelected ? '▸ ' : '  ';
    const id = project.id.padEnd(maxIdLength);
    const name = truncate(project.name, maxNameLength).padEnd(maxNameLength);
    const path = truncate(project.projectRoot || '', maxPathLength).padEnd(maxPathLength);
    const status = project.status.padEnd(maxStatusLength);
    
    const row = `${indicator}${id} | ${name} | ${path} | ${status}`;
    
    // Highlight the selected project with green color
    return isSelected ? chalk.green(row) : row;
  });
  
  return [header, separator, ...rows].join('\n');
}