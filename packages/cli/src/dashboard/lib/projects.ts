// Re-export everything from @vibe-kit/projects for use in the dashboard
export {
  // Types
  type Project,
  type ProjectsConfig,
  type ProjectCreateInput,
  type ProjectUpdateInput,
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
  // Validation utilities
  validateProjectData,
  // Constants
  PROJECTS_FILE,
  CURRENT_PROJECT_FILE
} from '@vibe-kit/projects';