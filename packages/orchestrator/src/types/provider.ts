export interface ProviderConfig {
  type: string;
  config: any;
}

export interface ProviderInfo {
  type: string;
  name: string;
  version: string;
  description: string;
  capabilities: string[];
  configSchema?: any;
}

export interface ProviderStatus {
  name: string;
  status: 'connected' | 'disconnected' | 'error' | 'initializing';
  lastSync?: Date;
  error?: string;
  metadata?: {
    taskCount?: number;
    epicCount?: number;
    lastActivity?: Date;
  };
}

export interface ProviderSyncResult {
  success: boolean;
  tasksUpdated: number;
  epicsUpdated: number;
  errors: string[];
  duration: number;
}

export interface ProviderMetrics {
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  lastRequest: Date;
  rateLimitRemaining?: number;
  rateLimitReset?: Date;
}

// Provider-specific configurations
export interface TaskmasterProviderConfig {
  projectRoot: string;
  tasksFile?: string;
  autoExpand?: boolean;
  requestTimeout?: number;
  mcpServerPath?: string;
}

export interface LinearProviderConfig {
  apiKey: string;
  workspace: string;
  teamId?: string;
  webhookUrl?: string;
}

export interface JiraProviderConfig {
  url: string;
  username: string;
  apiToken: string;
  projectKey: string;
  issueTypeMapping?: Record<string, string>;
}

export interface GitHubIssuesProviderConfig {
  owner: string;
  repo: string;
  token: string;
  labelMapping?: Record<string, string>;
  milestoneMapping?: Record<string, string>;
}

// Union type for all provider configs
export type AnyProviderConfig = 
  | TaskmasterProviderConfig
  | LinearProviderConfig 
  | JiraProviderConfig
  | GitHubIssuesProviderConfig;

// Provider detection result
export interface ProviderDetectionResult {
  detected: boolean;
  provider: string;
  confidence: number; // 0-1
  configPath?: string;
  suggestions?: string[];
}

// Provider health check result
export interface ProviderHealthResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  message?: string;
  details?: {
    connectivity: boolean;
    authentication: boolean;
    permissions: boolean;
    rateLimit: boolean;
  };
  lastCheck: Date;
}