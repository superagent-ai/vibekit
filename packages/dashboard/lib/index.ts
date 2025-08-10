// Types
export type {
  Project,
  ProjectsConfig,
  ProjectCreateInput,
  ProjectUpdateInput
} from './types';

// Project management
export {
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
  clearCurrentProject
} from './manager';

// Storage utilities
export {
  ensureProjectsFile,
  readProjectsConfig,
  writeProjectsConfig,
  readCurrentProject,
  writeCurrentProject,
  pathExists
} from './storage';

// Validation utilities
export {
  validateProjectData,
  generateProjectId,
  truncate
} from './validator';

// Formatting utilities
export {
  formatProjectsTable,
  formatProjectDetails
} from './formatter';

// Constants
export {
  VIBEKIT_DIR,
  PROJECTS_FILE,
  CURRENT_PROJECT_FILE,
  PROJECTS_VERSION,
  DEFAULT_PROJECTS_CONFIG
} from './constants';