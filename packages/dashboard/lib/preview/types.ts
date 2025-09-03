/**
 * Types for the simplified local preview system
 */

export type ProjectType = 'nextjs' | 'react' | 'vue' | 'node' | 'python' | 'static' | 'unknown';

export type DevServerStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

export interface DevServerConfig {
  projectType: ProjectType;
  devCommand: string;
  port: number;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  framework?: {
    name: string;
    version?: string;
  };
}

export interface DevServerInstance {
  id: string;
  projectId: string;
  config: DevServerConfig;
  status: DevServerStatus;
  previewUrl?: string;
  startedAt?: Date;
  lastActivity?: Date;
  error?: string;
  pid?: number;
}

export interface DevServerLog {
  timestamp: Date;
  type: 'stdout' | 'stderr' | 'system';
  message: string;
}

export interface ProjectDetectionResult {
  type: ProjectType;
  framework?: {
    name: string;
    version?: string;
  };
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun';
  hasLockFile: boolean;
  devCommand: string;
  port: number;
  scripts?: Record<string, string>;
}

export interface PreviewOptions {
  width?: number;
  height?: number;
  device?: 'desktop' | 'tablet' | 'mobile';
  theme?: 'light' | 'dark' | 'system';
}