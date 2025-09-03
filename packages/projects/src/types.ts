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
  rank?: number;
  priority?: 'high' | 'medium' | 'low';
  taskSource?: 'taskmaster' | 'manual';
  manualTasks?: ManualTask[];
  mcpServers?: Record<string, boolean>; // MCP server ID -> enabled status
}

export interface ManualTask {
  id: number;
  title: string;
  description: string;
  details?: string;
  testStrategy?: string;
  priority: 'high' | 'medium' | 'low';
  dependencies: number[];
  status: 'pending' | 'done' | 'in-progress' | 'review' | 'deferred' | 'cancelled';
  subtasks: ManualSubtask[];
  createdAt: string;
  updatedAt: string;
}

export interface ManualSubtask {
  id: number;
  title: string;
  description: string;
  dependencies: number[];
  details?: string;
  status: 'pending' | 'done' | 'in-progress' | 'review' | 'deferred' | 'cancelled';
  testStrategy?: string;
}

export interface ProjectsConfig {
  version: string;
  projects: Record<string, Project>;
}

export interface ProjectCreateInput {
  name: string;
  projectRoot: string;
  setupScript?: string;
  devScript?: string;
  cleanupScript?: string;
  tags?: string[];
  description?: string;
  status?: 'active' | 'archived';
  rank?: number;
  priority?: 'high' | 'medium' | 'low';
  taskSource?: 'taskmaster' | 'manual';
  manualTasks?: ManualTask[];
  mcpServers?: Record<string, boolean>;
}

export interface ProjectUpdateInput {
  name?: string;
  projectRoot?: string;
  setupScript?: string;
  devScript?: string;
  cleanupScript?: string;
  tags?: string[];
  description?: string;
  status?: 'active' | 'archived';
  rank?: number;
  priority?: 'high' | 'medium' | 'low';
  taskSource?: 'taskmaster' | 'manual';
  manualTasks?: ManualTask[];
  mcpServers?: Record<string, boolean>;
}