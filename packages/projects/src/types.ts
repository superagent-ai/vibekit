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
}