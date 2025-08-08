#!/usr/bin/env node
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import {
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
} from '@vibe-kit/projects';
import type { 
  Project, 
  ProjectCreateInput, 
  ProjectUpdateInput 
} from '@vibe-kit/projects';

const server = new FastMCP({
  name: 'vibekit',
  version: '0.0.1',
  instructions: `
VibeKit development assistant providing tools for managing your development workflow.

Current capabilities:
- Project management (list, create, update, delete, search)
- Current project selection and context switching
- More tools coming soon
`,
});

// Projects Tool - Consolidated list/get/search operations
server.addTool({
  name: 'projects',
  description: 'List, get, or search VibeKit projects',
  parameters: z.object({
    action: z.enum(['list', 'get', 'search']).default('list'),
    // For 'get' action
    id: z.string().optional().describe('Project ID (for get action)'),
    // For 'search' action
    query: z.string().optional().describe('Search in name/description'),
    tags: z.array(z.string()).optional().describe('Filter by tags'),
    status: z.enum(['active', 'archived', 'all']).optional().default('active'),
    priority: z.enum(['high', 'medium', 'low']).optional(),
  }),
  execute: async (args) => {
    const currentProject = await getCurrentProject();
    
    if (args.action === 'get' && args.id) {
      const project = await getProject(args.id);
      if (!project) {
        return JSON.stringify({ error: `Project not found: ${args.id}` }, null, 2);
      }
      return JSON.stringify({
        ...project,
        isCurrent: currentProject?.id === project.id
      }, null, 2);
    }
    
    // List or search
    let projects = await getAllProjects();
    
    // Filter by status
    if (args.status !== 'all') {
      projects = projects.filter((p: Project) => p.status === args.status);
    }
    
    // Search filters
    if (args.action === 'search') {
      if (args.query) {
        const query = args.query.toLowerCase();
        projects = projects.filter((p: Project) => 
          p.name.toLowerCase().includes(query) ||
          (p.description && p.description.toLowerCase().includes(query))
        );
      }
      
      if (args.tags && args.tags.length > 0) {
        projects = projects.filter((p: Project) => 
          p.tags && args.tags!.some(tag => p.tags!.includes(tag))
        );
      }
      
      if (args.priority) {
        projects = projects.filter((p: Project) => p.priority === args.priority);
      }
    }
    
    const projectList = projects.map((p: Project) => ({
      ...p,
      isCurrent: currentProject?.id === p.id
    }));
    
    return JSON.stringify({
      projects: projectList,
      currentProjectId: currentProject?.id || null,
      total: projectList.length
    }, null, 2);
  },
});

// Project Management Tool - Create, Update, Delete
server.addTool({
  name: 'project_manage',
  description: 'Create, update, or delete a VibeKit project',
  parameters: z.object({
    action: z.enum(['create', 'update', 'delete']),
    id: z.string().optional().describe('Project ID (for update/delete)'),
    // Project data fields
    name: z.string().optional().describe('Project name'),
    projectRoot: z.string().optional().describe('Absolute path to project root'),
    description: z.string().optional().describe('Project description'),
    setupScript: z.string().optional().describe('Setup script command'),
    devScript: z.string().optional().describe('Development script command'),
    cleanupScript: z.string().optional().describe('Cleanup script command'),
    tags: z.array(z.string()).optional().describe('Tags for categorization'),
    status: z.enum(['active', 'archived']).optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
  }),
  execute: async (args) => {
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
  },
});

// Current Project Tool - Get, Set, or Clear current project
server.addTool({
  name: 'current_project',
  description: 'Manage the current active project (get, set, or clear)',
  parameters: z.object({
    action: z.enum(['get', 'set', 'clear']).default('get'),
    id: z.string().optional().describe('Project ID or name (for set action)'),
  }),
  execute: async (args) => {
    try {
      if (args.action === 'get') {
        const project = await getCurrentProject();
        return JSON.stringify({
          currentProject: project,
          message: project ? `Current project: ${project.name}` : 'No project currently selected'
        }, null, 2);
      }
      
      if (args.action === 'set') {
        if (!args.id) {
          return JSON.stringify({
            success: false,
            error: 'ID is required for setting current project'
          }, null, 2);
        }
        
        // Try by ID first, then by name
        let project = await setCurrentProjectById(args.id);
        if (!project) {
          project = await getProjectByName(args.id);
          if (project) {
            await setCurrentProject(project);
          }
        }
        
        if (!project) {
          return JSON.stringify({
            success: false,
            error: `Project not found: ${args.id}`
          }, null, 2);
        }
        
        return JSON.stringify({
          success: true,
          currentProject: project,
          message: `Current project set to: ${project.name}`
        }, null, 2);
      }
      
      if (args.action === 'clear') {
        await clearCurrentProject();
        return JSON.stringify({
          success: true,
          message: 'Current project selection cleared'
        }, null, 2);
      }
      
      return JSON.stringify({ error: 'Invalid action' }, null, 2);
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2);
    }
  },
});

// Parse command line arguments for transport type
const transportType = process.argv.includes('--transport') 
  && process.argv[process.argv.indexOf('--transport') + 1] === 'http-stream'
  ? 'httpStream' as const
  : 'stdio' as const;

const port = process.argv.includes('--port')
  ? parseInt(process.argv[process.argv.indexOf('--port') + 1])
  : 8080;

// Start the server with error handling
async function startServer() {
  try {
    if (transportType === 'httpStream') {
      await server.start({
        transportType: 'httpStream',
        httpStream: { 
          port,
          endpoint: '/mcp' as const
        }
      });
      console.error(`VibeKit MCP Server running on http://localhost:${port}/mcp`);
    } else {
      await server.start({ transportType: 'stdio' });
    }
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
});

// Start the server
startServer();