import { z } from 'zod';
import {
  getAllProjects,
  getProject,
  getProjectByName,
  createProject,
  updateProject,
  deleteProject
} from '@vibe-kit/projects';
import type { 
  ProjectCreateInput, 
  ProjectUpdateInput 
} from '@vibe-kit/projects';

// Projects Tool - Consolidated list/get/search operations
export const projectsToolExecute = async (args: {
  action?: 'list' | 'get' | 'search';
  id?: string;
  query?: string;
  tags?: string[];
  status?: 'active' | 'archived' | 'all';
  priority?: 'high' | 'medium' | 'low';
}) => {
  if (args.action === 'get' && args.id) {
    const project = await getProject(args.id);
    if (!project) {
      return JSON.stringify({ error: `Project not found: ${args.id}` }, null, 2);
    }
    return JSON.stringify(project, null, 2);
  }
  
  // List or search
  let projects = await getAllProjects();
  
  // Filter by status
  if (args.status !== 'all') {
    projects = projects.filter(p => p.status === (args.status || 'active'));
  }
  
  // Search filters
  if (args.action === 'search') {
    if (args.query) {
      const query = args.query.toLowerCase();
      projects = projects.filter(p => 
        p.name.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query))
      );
    }
    
    if (args.tags && args.tags.length > 0) {
      projects = projects.filter(p => 
        p.tags && args.tags!.some(tag => p.tags!.includes(tag))
      );
    }
    
    if (args.priority) {
      projects = projects.filter(p => p.priority === args.priority);
    }
  }
  
  return JSON.stringify({
    projects,
    total: projects.length
  }, null, 2);
};

// Project Management Tool - Create, Update, Delete
export const projectManageToolExecute = async (args: {
  action: 'create' | 'update' | 'delete';
  id?: string;
  name?: string;
  projectRoot?: string;
  description?: string;
  setupScript?: string;
  devScript?: string;
  cleanupScript?: string;
  tags?: string[];
  status?: 'active' | 'archived';
  priority?: 'high' | 'medium' | 'low';
}) => {
  try {
    if (args.action === 'create') {
      if (!args.name || !args.projectRoot) {
        return JSON.stringify({
          success: false,
          error: 'Name and projectRoot are required for creating a project'
        }, null, 2);
      }
      
      const projectData: ProjectCreateInput = {
        name: args.name,
        projectRoot: args.projectRoot,
        description: args.description,
        setupScript: args.setupScript,
        devScript: args.devScript,
        cleanupScript: args.cleanupScript,
        tags: args.tags,
        status: args.status || 'active',
        priority: args.priority || 'medium',
      };
      
      const project = await createProject(projectData);
      return JSON.stringify({ success: true, project }, null, 2);
    }
    
    if (args.action === 'update') {
      if (!args.id) {
        return JSON.stringify({
          success: false,
          error: 'ID is required for updating a project'
        }, null, 2);
      }
      
      const updates: ProjectUpdateInput = {};
      if (args.name !== undefined) updates.name = args.name;
      if (args.projectRoot !== undefined) updates.projectRoot = args.projectRoot;
      if (args.description !== undefined) updates.description = args.description;
      if (args.setupScript !== undefined) updates.setupScript = args.setupScript;
      if (args.devScript !== undefined) updates.devScript = args.devScript;
      if (args.cleanupScript !== undefined) updates.cleanupScript = args.cleanupScript;
      if (args.tags !== undefined) updates.tags = args.tags;
      if (args.status !== undefined) updates.status = args.status;
      if (args.priority !== undefined) updates.priority = args.priority;
      
      const project = await updateProject(args.id, updates);
      if (!project) {
        return JSON.stringify({ success: false, error: 'Project not found' }, null, 2);
      }
      
      return JSON.stringify({ success: true, project }, null, 2);
    }
    
    if (args.action === 'delete') {
      if (!args.id) {
        return JSON.stringify({
          success: false,
          error: 'ID is required for deleting a project'
        }, null, 2);
      }
      
      const success = await deleteProject(args.id);
      return JSON.stringify({
        success,
        message: success ? 'Project deleted successfully' : 'Project not found'
      }, null, 2);
    }
    
    return JSON.stringify({ error: 'Invalid action' }, null, 2);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, null, 2);
  }
};

