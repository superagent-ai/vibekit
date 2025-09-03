# VibeKit Orchestrator

The VibeKit Orchestrator is a powerful task orchestration engine that enables seamless integration between AI coding agents and external systems. It provides secure sandboxing, GitHub integration, and comprehensive project management capabilities.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
- [GitHub Integration](#github-integration)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [CLI Commands](#cli-commands)
- [Webhooks](#webhooks)
- [Advanced Usage](#advanced-usage)
- [Troubleshooting](#troubleshooting)

## Overview

The Orchestrator manages the execution of coding tasks across multiple environments while maintaining security and observability. Key features include:

- **Task Orchestration**: Execute AI coding tasks in isolated environments
- **GitHub Integration**: Bidirectional sync with GitHub issues and pull requests
- **Multi-Provider Support**: Docker, E2B, Daytona, and more sandbox providers
- **Real-time Monitoring**: Live progress tracking and telemetry
- **Security First**: PII redaction and secure credential handling

### Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Task Queue    │────│   Orchestrator  │────│   GitHub API    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  Sandbox Pool   │────│  Worktree Mgr   │────│   Telemetry     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- Docker (for sandbox environments)
- GitHub Token (required for GitHub integration)

### Installation

```bash
# Install VibeKit CLI
npm install -g @vibe-kit/cli

# Initialize a new project
vibekit init my-project
cd my-project

# Set up environment
cp .env.example .env
# Edit .env with your tokens
```

### Environment Setup

Create a `.env` file in your project root:

```bash
# Required: GitHub Personal Access Token
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_REPOSITORY=your-username/your-repo

# AI Provider (choose one)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx
GEMINI_API_KEY=xxxxxxxxxxxxxxxxxxxx

# Optional: Webhook settings
VIBEKIT_WEBHOOK_SECRET=your-webhook-secret
VIBEKIT_WEBHOOK_PORT=3001
```

### Basic Usage

```typescript
import { VibeKitOrchestrator } from '@vibe-kit/orchestrator';

const orchestrator = new VibeKitOrchestrator({
  github: {
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY
  },
  agent: {
    type: 'claude',
    apiKey: process.env.ANTHROPIC_API_KEY
  }
});

// Execute a coding task
const result = await orchestrator.executeTask({
  id: 'task-1',
  title: 'Implement user authentication',
  description: 'Add OAuth2 login functionality',
  priority: 'high',
  type: 'feature'
});

console.log('Task completed:', result.status);
```

## GitHub Integration

The Orchestrator provides comprehensive GitHub integration that enables seamless synchronization between your project management workflow and GitHub issues/PRs.

### Core Components

#### GitHubIntegrationManager
Manages task-to-issue synchronization and labeling:

```typescript
import { GitHubIntegrationManager } from '@vibe-kit/orchestrator';

const integrationManager = new GitHubIntegrationManager({
  token: process.env.GITHUB_TOKEN,
  repository: 'owner/repo',
  labels: {
    taskPending: 'task:pending',
    taskInProgress: 'task:in-progress',
    taskCompleted: 'task:completed',
    taskFailed: 'task:failed',
    priorityHigh: 'priority:high',
    priorityMedium: 'priority:medium',
    priorityLow: 'priority:low'
  },
  templates: {
    issueTitle: '[Task] {title}',
    issueBody: '**Description:** {description}\n\n**Priority:** {priority}\n**Type:** {type}'
  }
});

// Create GitHub issue from task
const issue = await integrationManager.createIssueFromTask(task);

// Sync task status to GitHub
await integrationManager.syncTaskToGitHub(task, issue.number);
```

#### PRMergeManager
Automates pull request merging with configurable rules:

```typescript
import { PRMergeManager, MergeRulePresets } from '@vibe-kit/orchestrator';

const prManager = new PRMergeManager({
  token: process.env.GITHUB_TOKEN,
  repository: 'owner/repo',
  rules: MergeRulePresets.SAFE_MERGE // or AGGRESSIVE_MERGE, MANUAL_ONLY
});

// Auto-merge PR if conditions are met
const result = await prManager.attemptAutoMerge(prNumber);
console.log('Merge result:', result.merged);
```

#### GitHubSyncEngine
Provides bidirectional synchronization:

```typescript
import { GitHubSyncEngine, SyncEnginePresets } from '@vibe-kit/orchestrator';

const syncEngine = new GitHubSyncEngine({
  token: process.env.GITHUB_TOKEN,
  repository: 'owner/repo',
  syncSettings: SyncEnginePresets.BIDIRECTIONAL_SYNC
});

// Enable continuous sync
await syncEngine.enableContinuousSync();

// Manual sync operations
await syncEngine.syncFromGitHubToTasks();
await syncEngine.syncFromTasksToGitHub();
```

#### GitHubConfigManager
Manages configurations and presets:

```typescript
import { GitHubConfigManager, GitHubConfigPresets } from '@vibe-kit/orchestrator';

const configManager = new GitHubConfigManager();

// Apply preset configuration
await configManager.applyPreset(
  GitHubConfigPresets.DEVELOPMENT_TEAM,
  { token: process.env.GITHUB_TOKEN, repository: 'owner/repo' }
);

// Custom configuration
const config = await configManager.createCustomConfig({
  labels: { /* custom labels */ },
  templates: { /* custom templates */ },
  mergeRules: { /* custom merge rules */ }
});
```

### Authentication Requirements

**Important**: The GitHub integration requires a valid GitHub Personal Access Token. The orchestrator will **fail immediately** if no token is provided - there is no mock mode in production.

Required token permissions:
- `repo` (full repository access)
- `write:discussion` (for PR discussions)
- `read:org` (if using organization repositories)

### Supported Operations

1. **Task → Issue Sync**
   - Create GitHub issues from tasks
   - Update issue labels based on task status/priority
   - Close issues when tasks complete

2. **PR Management**
   - Auto-merge PRs based on configurable rules
   - Status checks integration
   - Branch protection compliance

3. **Bidirectional Sync**
   - Import GitHub issues as tasks
   - Sync external issue changes back to tasks
   - Handle label and status updates

## Configuration

### GitHub Configuration

```typescript
interface GitHubConfig {
  // Authentication
  token: string;                    // GitHub Personal Access Token
  repository: string;               // Format: "owner/repo"
  
  // Label Management
  labels: {
    taskPending: string;           // Default: "task:pending"
    taskInProgress: string;        // Default: "task:in-progress"  
    taskCompleted: string;         // Default: "task:completed"
    taskFailed: string;            // Default: "task:failed"
    priorityHigh: string;          // Default: "priority:high"
    priorityMedium: string;        // Default: "priority:medium"
    priorityLow: string;           // Default: "priority:low"
  };
  
  // Templates
  templates: {
    issueTitle: string;            // Template for issue titles
    issueBody: string;             // Template for issue descriptions
    prTitle: string;               // Template for PR titles
    prBody: string;                // Template for PR descriptions
    commitMessage: string;         // Template for commit messages
  };
  
  // Merge Rules
  mergeRules: {
    requireStatusChecks: boolean;  // Require all status checks to pass
    requireUpToDate: boolean;      // Require branch to be up-to-date
    requireReviews: boolean;       // Require PR reviews
    minReviews: number;            // Minimum required reviews
    dismissStaleReviews: boolean;  // Auto-dismiss stale reviews
    restrictPushes: boolean;       // Restrict pushes to admins
    autoMergeMethod: 'merge' | 'squash' | 'rebase'; // Default merge method
  };
  
  // Sync Settings  
  syncSettings: {
    enableBidirectional: boolean;  // Enable two-way sync
    syncInterval: number;          // Sync frequency (milliseconds)
    syncOnTaskCreate: boolean;     // Auto-sync new tasks
    syncOnTaskUpdate: boolean;     // Auto-sync task updates
    syncOnIssueCreate: boolean;    // Auto-sync new issues
    syncOnIssueUpdate: boolean;    // Auto-sync issue updates
  };
}
```

### Configuration Presets

#### Development Team Preset
```typescript
GitHubConfigPresets.DEVELOPMENT_TEAM
```
- Moderate merge requirements
- Bidirectional sync enabled
- Standard labeling scheme
- Auto-merge with status checks

#### Enterprise Preset  
```typescript
GitHubConfigPresets.ENTERPRISE
```
- Strict merge requirements
- Enhanced security labels
- Manual review processes
- Compliance-focused templates

#### Solo Developer Preset
```typescript
GitHubConfigPresets.SOLO_DEVELOPER
```
- Relaxed merge requirements
- Simplified labeling
- Auto-merge enabled
- Minimal overhead

## API Reference

### Core Classes

#### `VibeKitOrchestrator`

Main orchestrator class that coordinates all operations.

```typescript
class VibeKitOrchestrator {
  constructor(options: OrchestratorOptions)
  
  // Task Management
  executeTask(task: Task): Promise<TaskResult>
  executeTaskBatch(tasks: Task[]): Promise<TaskResult[]>
  getTaskStatus(taskId: string): Promise<TaskStatus>
  pauseTask(taskId: string): Promise<void>
  resumeTask(taskId: string): Promise<void>
  cancelTask(taskId: string): Promise<void>
  
  // GitHub Operations
  syncToGitHub(taskId: string): Promise<GitHubSyncResult>
  createPullRequest(taskId: string, options?: PROptions): Promise<PullRequest>
  mergePullRequest(prNumber: number, options?: MergeOptions): Promise<MergeResult>
  
  // Lifecycle
  start(): Promise<void>
  stop(): Promise<void>
  getHealthStatus(): Promise<HealthStatus>
}
```

#### `GitHubIntegrationManager`

```typescript
class GitHubIntegrationManager {
  constructor(config: GitHubConfig)
  
  // Issue Management
  createIssueFromTask(task: Task): Promise<GitHubIssue>
  updateIssueFromTask(task: Task, issueNumber: number): Promise<GitHubIssue>
  closeIssue(issueNumber: number): Promise<void>
  
  // Task Sync
  syncTaskToGitHub(task: Task, issueNumber?: number): Promise<GitHubIssue>
  syncTasksToGitHub(tasks: Task[]): Promise<GitHubIssue[]>
  
  // Mapping Management
  getTaskIssueMapping(taskId: string): Promise<number | null>
  setTaskIssueMapping(taskId: string, issueNumber: number): Promise<void>
  clearTaskIssueMapping(taskId: string): Promise<void>
}
```

#### `PRMergeManager`

```typescript
class PRMergeManager {
  constructor(config: GitHubConfig)
  
  // Merge Operations
  attemptAutoMerge(prNumber: number): Promise<AutoMergeResult>
  checkMergeability(prNumber: number): Promise<MergeabilityCheck>
  getMergeRequirements(prNumber: number): Promise<MergeRequirement[]>
  
  // Rule Management
  updateMergeRules(rules: Partial<MergeRules>): Promise<void>
  validateMergeRules(rules: MergeRules): Promise<ValidationResult>
}
```

#### `GitHubSyncEngine`

```typescript
class GitHubSyncEngine {
  constructor(config: GitHubConfig)
  
  // Sync Operations
  syncFromGitHubToTasks(): Promise<SyncResult>
  syncFromTasksToGitHub(): Promise<SyncResult>
  enableContinuousSync(): Promise<void>
  disableContinuousSync(): Promise<void>
  
  // Event Handling
  onIssueCreated(callback: (issue: GitHubIssue) => void): void
  onIssueUpdated(callback: (issue: GitHubIssue) => void): void
  onPullRequestCreated(callback: (pr: PullRequest) => void): void
  onPullRequestMerged(callback: (pr: PullRequest) => void): void
}
```

### Type Definitions

```typescript
interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  priority: 'low' | 'medium' | 'high';
  type: 'feature' | 'bugfix' | 'refactor' | 'documentation';
  assignee?: string;
  labels?: string[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
}

interface TaskResult {
  taskId: string;
  status: 'success' | 'error' | 'timeout';
  output?: string;
  error?: string;
  executionTime: number;
  sandboxId?: string;
  artifacts?: Artifact[];
  pullRequest?: PullRequest;
}

interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: Label[];
  assignee?: User;
  milestone?: Milestone;
  html_url: string;
  created_at: string;
  updated_at: string;
}

interface PullRequest {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  head: Branch;
  base: Branch;
  mergeable: boolean | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at?: string;
}
```

## CLI Commands

The VibeKit CLI provides comprehensive commands for GitHub integration:

### Task Management

```bash
# Execute a single task
vibekit task run <task-id> [options]

# Execute multiple tasks
vibekit task batch run <task-ids...> [options]

# Get task status
vibekit task status <task-id>

# List all tasks
vibekit task list [--status=<status>] [--priority=<priority>]

# Create a new task
vibekit task create --title="<title>" --description="<description>" [options]
```

### GitHub Integration

```bash
# Sync task to GitHub
vibekit github sync <task-id> [options]

# Create GitHub issue from task
vibekit github issue create <task-id> [options]

# Create pull request from task
vibekit github pr create <task-id> [options]

# Merge pull request
vibekit github pr merge <pr-number> [options]

# Sync from GitHub to tasks
vibekit github sync --from-github [options]

# Enable continuous sync
vibekit github sync --continuous [options]
```

### Configuration Management

```bash
# Initialize GitHub integration
vibekit github init [options]

# Apply configuration preset
vibekit github config preset <preset-name>

# Update configuration
vibekit github config update [options]

# Validate configuration
vibekit github config validate

# Show current configuration
vibekit github config show
```

### CLI Options

#### Common Options
- `--token <token>` - GitHub Personal Access Token
- `--repo <owner/repo>` - Target repository
- `--dry-run` - Preview changes without executing
- `--verbose` - Enable detailed logging
- `--config <file>` - Use custom configuration file

#### Task Execution Options
- `--sandbox <provider>` - Sandbox provider (docker, e2b, daytona)
- `--timeout <ms>` - Execution timeout
- `--parallel <count>` - Parallel execution limit
- `--branch <name>` - Target branch for changes

#### GitHub Sync Options
- `--create-issue` - Create GitHub issue if not exists
- `--update-labels` - Update GitHub issue labels
- `--close-completed` - Close issues for completed tasks
- `--merge-method <method>` - PR merge method (merge, squash, rebase)

### Examples

```bash
# Initialize GitHub integration with development preset
vibekit github init --preset=development-team

# Execute task and create PR
vibekit task run auth-feature --github --create-pr

# Sync all pending tasks to GitHub
vibekit github sync --all --status=pending

# Enable continuous bidirectional sync
vibekit github sync --continuous --bidirectional

# Merge PR with squash method
vibekit github pr merge 123 --method=squash --delete-branch
```

## Webhooks

Webhooks enable real-time bidirectional synchronization between GitHub and your task management system. This is **optional** but recommended for teams that need immediate updates.

### Setup

1. **Configure Webhook Endpoint**

```bash
# Set webhook configuration in .env
VIBEKIT_WEBHOOK_SECRET=your-secure-webhook-secret
VIBEKIT_WEBHOOK_PORT=3001
VIBEKIT_WEBHOOK_URL=https://your-domain.com/webhooks/github
```

2. **Start Webhook Server**

```typescript
import { GitHubWebhookServer } from '@vibe-kit/orchestrator';

const webhookServer = new GitHubWebhookServer({
  port: process.env.VIBEKIT_WEBHOOK_PORT,
  secret: process.env.VIBEKIT_WEBHOOK_SECRET,
  github: {
    token: process.env.GITHUB_TOKEN,
    repository: process.env.GITHUB_REPOSITORY
  }
});

await webhookServer.start();
console.log('Webhook server listening on port', process.env.VIBEKIT_WEBHOOK_PORT);
```

3. **Configure GitHub Repository**

In your GitHub repository settings:
- Go to Settings → Webhooks → Add webhook
- Payload URL: `https://your-domain.com/webhooks/github`
- Content type: `application/json`
- Secret: Your `VIBEKIT_WEBHOOK_SECRET`
- Events: Issues, Pull requests, Push

### Supported Events

The webhook server handles these GitHub events:

#### Issue Events
- `issues.opened` - Creates new task from GitHub issue
- `issues.edited` - Updates existing task
- `issues.closed` - Marks task as completed
- `issues.reopened` - Reactivates task
- `issues.labeled/unlabeled` - Updates task priority/status

#### Pull Request Events  
- `pull_request.opened` - Links PR to task
- `pull_request.closed` - Updates task status
- `pull_request.merged` - Marks task as completed
- `pull_request.synchronize` - Updates task progress

#### Push Events
- `push` - Updates task progress for linked branches

### Event Handling

```typescript
// Custom event handlers
webhookServer.on('issue.created', async (issue) => {
  console.log('New issue created:', issue.title);
  // Create corresponding task
  const task = await createTaskFromIssue(issue);
  console.log('Created task:', task.id);
});

webhookServer.on('pull_request.merged', async (pr) => {
  console.log('PR merged:', pr.title);
  // Mark linked tasks as completed
  const tasks = await getTasksByPR(pr.number);
  for (const task of tasks) {
    await markTaskCompleted(task.id);
  }
});
```

### Security

- Webhook payloads are verified using HMAC-SHA256
- All webhook endpoints require valid secret
- Failed verification attempts are logged and blocked
- Rate limiting applied to prevent abuse

### Webhook CLI Commands

```bash
# Start webhook server
vibekit webhook start [options]

# Test webhook configuration  
vibekit webhook test [options]

# List webhook events
vibekit webhook events [options]

# Configure GitHub repository webhooks
vibekit webhook setup --repo=<owner/repo> [options]
```

## Advanced Usage

### Custom Sandbox Providers

```typescript
import { CustomSandboxProvider } from '@vibe-kit/orchestrator';

class MySandboxProvider extends CustomSandboxProvider {
  async createSandbox(options: SandboxOptions): Promise<Sandbox> {
    // Custom sandbox implementation
  }
  
  async destroySandbox(sandboxId: string): Promise<void> {
    // Cleanup logic
  }
}

const orchestrator = new VibeKitOrchestrator({
  sandboxProvider: new MySandboxProvider()
});
```

### Task Dependencies

```typescript
const taskGraph = {
  'setup-db': { dependencies: [] },
  'create-models': { dependencies: ['setup-db'] },
  'create-api': { dependencies: ['create-models'] },
  'create-frontend': { dependencies: ['create-api'] }
};

await orchestrator.executeTaskGraph(taskGraph);
```

### Custom Event Handlers

```typescript
orchestrator.on('task.started', (task) => {
  console.log(`Task ${task.id} started`);
});

orchestrator.on('task.completed', async (task, result) => {
  console.log(`Task ${task.id} completed in ${result.executionTime}ms`);
  
  // Custom post-completion logic
  if (task.type === 'feature') {
    await orchestrator.createPullRequest(task.id);
  }
});

orchestrator.on('github.sync.completed', (result) => {
  console.log(`Synced ${result.taskCount} tasks to GitHub`);
});
```

### Monitoring and Observability

```typescript
// Enable telemetry
const orchestrator = new VibeKitOrchestrator({
  telemetry: {
    enabled: true,
    endpoint: 'https://your-telemetry-endpoint.com',
    apiKey: process.env.TELEMETRY_API_KEY
  }
});

// Custom metrics
orchestrator.metrics.counter('custom.tasks.executed').increment();
orchestrator.metrics.gauge('custom.tasks.pending').set(pendingCount);
orchestrator.metrics.histogram('custom.task.duration').record(duration);
```

## Troubleshooting

### Common Issues

#### 1. GitHub Authentication Failed

**Error**: `Authentication failed: Bad credentials`

**Solutions**:
- Verify `GITHUB_TOKEN` is set correctly in `.env`
- Ensure token has required permissions (`repo`, `write:discussion`)
- Check if token has expired
- For organization repos, ensure token has `read:org` permission

```bash
# Test token validity
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user
```

#### 2. Repository Not Found

**Error**: `Not Found: Repository does not exist or you don't have access`

**Solutions**:
- Verify `GITHUB_REPOSITORY` format is `owner/repo`
- Check repository visibility (token needs access to private repos)
- Ensure repository exists and you have access

```bash
# Test repository access
curl -H "Authorization: token $GITHUB_TOKEN" \
     https://api.github.com/repos/owner/repo
```

#### 3. Webhook Verification Failed

**Error**: `Webhook signature verification failed`

**Solutions**:
- Verify `VIBEKIT_WEBHOOK_SECRET` matches GitHub webhook secret
- Check webhook payload format
- Ensure webhook URL is accessible from GitHub

```bash
# Test webhook endpoint
curl -X POST https://your-domain.com/webhooks/github \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
```

#### 4. Task Execution Timeout

**Error**: `Task execution timed out after 300000ms`

**Solutions**:
- Increase timeout in orchestrator configuration
- Check sandbox resource limits
- Monitor sandbox performance
- Split large tasks into smaller ones

```typescript
const orchestrator = new VibeKitOrchestrator({
  timeout: 600000, // 10 minutes
  sandbox: {
    resources: {
      memory: '4GB',
      cpu: '2'
    }
  }
});
```

#### 5. Merge Conflicts

**Error**: `Pull request cannot be merged due to conflicts`

**Solutions**:
- Enable auto-rebase in merge rules
- Set up branch protection rules
- Configure merge queue for busy repositories
- Implement conflict resolution workflows

#### 6. Rate Limiting

**Error**: `API rate limit exceeded`

**Solutions**:
- Implement exponential backoff in sync operations
- Reduce sync frequency
- Use webhook-based updates instead of polling
- Consider GitHub App authentication for higher limits

### Debug Mode

Enable detailed debugging:

```bash
# Enable debug logging
export VIBEKIT_DEBUG=true

# Run with verbose output
vibekit task run <task-id> --verbose

# Check orchestrator logs
tail -f ~/.vibekit/logs/orchestrator.log
```

### Health Checks

```typescript
// Check orchestrator health
const health = await orchestrator.getHealthStatus();
console.log('Health:', health);

// Check GitHub connectivity
const githubHealth = await orchestrator.github.checkConnection();
console.log('GitHub connectivity:', githubHealth);

// Check sandbox availability
const sandboxHealth = await orchestrator.sandbox.getStatus();
console.log('Sandbox status:', sandboxHealth);
```

### Performance Monitoring

```bash
# Monitor task execution metrics
vibekit metrics --filter=task.execution

# Monitor GitHub API usage
vibekit metrics --filter=github.api

# Monitor sandbox resource usage
vibekit metrics --filter=sandbox.resources
```

### Log Analysis

```bash
# Filter orchestrator logs
grep "ERROR" ~/.vibekit/logs/orchestrator.log

# GitHub API logs
grep "github.api" ~/.vibekit/logs/orchestrator.log

# Task execution logs
grep "task.execution" ~/.vibekit/logs/orchestrator.log

# Webhook logs
grep "webhook" ~/.vibekit/logs/orchestrator.log
```

### Support

If you encounter issues not covered in this guide:

1. **Check GitHub Issues**: [VibeKit Issues](https://github.com/anthropics/vibekit/issues)
2. **Enable Debug Logging**: Set `VIBEKIT_DEBUG=true`
3. **Collect Logs**: Include relevant log snippets in your issue
4. **Provide Configuration**: Share sanitized configuration (remove tokens)
5. **Reproduction Steps**: Provide minimal reproduction case

---

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for release notes and version history.