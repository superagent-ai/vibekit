// Export types
export * from './types';

// Export storage classes
export { JSONLEventStore } from './storage/jsonl-event-store';
export { JSONStateStore } from './storage/json-state-store';

// Export core classes
export { SessionManager } from './core/session-manager';
export { WorktreeManager } from './core/worktree-manager';
export { TaskProgressManager } from './core/task-progress-manager';
export { ProviderSyncManager } from './core/provider-sync-manager';
// export { WorkflowEngine } from './core/workflow-engine';

// Export GitHub integration classes (Phase 10)
export { GitHubIntegrationManager } from './core/github-integration-manager';
export { GitHubConfigManager, GitHubConfigPresets } from './core/github-config';
export { PRMergeManager, MergeRulePresets } from './core/pr-merge-manager';
export { GitHubSyncEngine, SyncEnginePresets } from './core/github-sync-engine';

// Export GitHub integration types
export type { 
  GitHubIssue, 
  GitHubLabel, 
  TaskIssueMapping, 
  GitHubConfig 
} from './core/github-integration-manager';
export type { 
  GitHubConfigOptions 
} from './core/github-config';
export type { 
  PullRequest, 
  CheckStatus, 
  ReviewStatus, 
  MergeRules, 
  MergeAttempt, 
  MergeStrategy 
} from './core/pr-merge-manager';
export type { 
  SyncEvent, 
  SyncRule, 
  SyncStatus, 
  GitHubWebhookEvent 
} from './core/github-sync-engine';

// Export optional webhook server components (Phase 10)
export { 
  GitHubWebhookServer, 
  WebhookServerPresets,
  WebhookUtils,
  WebhookFilters 
} from './webhooks';
export type { 
  GitHubWebhookConfig,
  WebhookServerEvents,
  WebhookValidationResult,
  WebhookEventFilter 
} from './webhooks';

// Export Octokit service layer
export { OctokitService } from './services/octokit-service';
export type { 
  OctokitServiceConfig,
  GitHubUser,
  GitHubRepository,
  MergeResult,
  StatusCheck,
  PullRequestReview 
} from './services/octokit-service';

// Export provider classes
export { 
  ProjectProvider, 
  ProviderRegistry, 
  EnhancedProjectProvider,
  DEFAULT_PROVIDER_CONFIGS
} from './providers/base';
export { TaskmasterProvider } from './providers/taskmaster/provider';

// Export utility classes
export { GitHubAPI } from './utils/github-api';
export type { GitHubAPIConfig, CreatePROptions, PRResult, LabelConfig, BranchInfo } from './utils/github-api';

// Export sandbox classes
export { OrchestratorSandbox, TaskSandbox } from './sandbox';
export { WorktreeOrchestrator } from './sandbox/worktree-orchestrator';
export { WorktreeWorker } from './sandbox/worktree-worker';
export { AgentExecutor } from './sandbox/agent-executor';
export type { SandboxVolumes, SandboxOptions, TaskExecutionResult } from './sandbox';
export type { WorktreeConfig, ParallelTask, WorktreeStatus, OrchestratorConfig } from './sandbox/worktree-orchestrator';
export type { AgentCredentials, AgentExecutionConfig, AgentExecutionResult, SandboxProvider } from './sandbox/agent-executor';
export type { WorkerTask, WorkerResult, GitHubAPIConfig as WorkerGitHubConfig } from './sandbox/worktree-worker';

// Export dashboard classes (these will be implemented in later phases)
// export { OrchestrationWebSocketServer } from './dashboard/websocket-server';
// export { createOrchestrationAPI } from './dashboard/api-routes';