#!/usr/bin/env node
import { FastMCP } from 'fastmcp';
import { z } from 'zod';
import { createLogger } from '@vibe-kit/logging';
import { 
  projectsToolExecute, 
  projectManageToolExecute
} from './tools.js';

// Create logger for this module
const log = createLogger('mcp-server');

const server = new FastMCP({
  name: 'vibekit',
  version: '0.0.1',
  instructions: `
VibeKit development assistant providing tools for managing your development workflow.

Current capabilities:
- Project management (list, create, update, delete, search)
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
  execute: projectsToolExecute,
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
  execute: projectManageToolExecute,
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
      log.info('VibeKit MCP Server started', { port, url: `http://localhost:${port}/mcp` });
    } else {
      await server.start({ transportType: 'stdio' });
    }
  } catch (error) {
    log.error('Failed to start MCP server', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    log.error('Error during shutdown', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    log.error('Error during shutdown', error);
    process.exit(1);
  }
});

// Start the server
startServer();