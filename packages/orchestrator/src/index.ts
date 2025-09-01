// Export types
export * from './types';

// Export storage classes
export { JSONLEventStore } from './storage/jsonl-event-store';
export { JSONStateStore } from './storage/json-state-store';

// Export core classes
export { SessionManager } from './core/session-manager';
export { WorktreeManager } from './core/worktree-manager';
// export { WorkflowEngine } from './core/workflow-engine';

// Export provider classes
export { 
  ProjectProvider, 
  ProviderRegistry, 
  EnhancedProjectProvider,
  DEFAULT_PROVIDER_CONFIGS
} from './providers/base';
export { TaskmasterProvider } from './providers/taskmaster/provider';

// Export sandbox classes
export { OrchestratorSandbox, TaskSandbox } from './sandbox';
export type { SandboxVolumes, SandboxOptions, TaskExecutionResult } from './sandbox';

// Export dashboard classes (these will be implemented in later phases)
// export { OrchestrationWebSocketServer } from './dashboard/websocket-server';
// export { createOrchestrationAPI } from './dashboard/api-routes';