# Using Existing E2B Sandboxes in VibeKit

This guide shows how to configure VibeKit environments to reuse existing running E2B sandboxes instead of creating new ones.

## Overview

The existing sandbox functionality allows you to:
- ✅ **Reuse running E2B sandboxes** to preserve files and running processes
- ✅ **Prevent automatic cleanup** of sandbox instances
- ✅ **Save sandbox startup time** by reusing existing environments
- ✅ **Maintain sandbox state** across multiple tasks

## Features Added

### 1. Environment Configuration UI

The environment creation dialog now includes:
- **Sandbox Type Selection**: Choose between "New Sandbox" or "Existing Sandbox"
- **Running Sandbox Selector**: Lists all active E2B sandboxes with status info
- **Refresh Button**: Reload available sandboxes
- **Smart Validation**: Ensures existing sandbox is selected when required

### 2. Backend Integration

- **listE2BSandboxesAction**: Fetches all running E2B sandboxes
- **Environment Store**: Stores `existingSandboxId` in sandbox configuration
- **Automatic Cleanup Prevention**: No auto-cleanup of specified existing sandboxes

### 3. Core SDK Support

- **Sandbox Configuration**: Extended to support `existingSandboxId`
- **Agent Priority**: Checks existing sandbox ID before creating new ones
- **Session Management**: Properly handles existing sandbox resumption

## Usage Examples

### 1. Using Existing Sandbox in Environment Configuration

```typescript
// Environment configuration with existing sandbox
const environment = {
  name: "Persistent Development",
  description: "Reuse existing sandbox for development",
  githubOrganization: "your-org",
  githubRepository: "your-org/your-repo", 
  sandboxConfig: {
    existingSandboxId: "sb_abc123xyz", // Your existing sandbox ID
    timeoutMs: 3600000, // Timeout not modifiable for existing sandboxes
    environment: {
      "NODE_ENV": "development"
    }
  }
};
```

### 2. Direct VibeKit Usage with Existing Sandbox

```typescript
import { VibeKit } from "@vibe-kit/sdk";

const config = {
  agent: {
    type: "codex",
    model: {
      apiKey: process.env.OPENAI_API_KEY,
    },
  },
  environment: {
    e2b: {
      apiKey: process.env.E2B_API_KEY,
      existingSandboxId: "sb_abc123xyz", // Reuse this sandbox
    },
  },
  github: {
    token: process.env.GITHUB_TOKEN,
    repository: "your-org/your-repo",
  },
};

const vibekit = new VibeKit(config);

// This will resume the existing sandbox instead of creating new one
const response = await vibekit.generateCode({
  prompt: "Add a new API endpoint",
  mode: "code",
});
```

### 3. Environment-Based Configuration

```typescript
// In your VibeKit configuration
const config = {
  agent: { type: "codex", model: { apiKey: "..." } },
  environment: {
    e2b: {
      apiKey: process.env.E2B_API_KEY,
      // This will be populated from environment store
      existingSandboxId: environment.sandboxConfig?.existingSandboxId,
    },
  },
  github: { token: "...", repository: "..." },
};
```

## UI Workflow

### Creating Environment with Existing Sandbox

1. **Navigate** to Settings → Environments
2. **Click** "Create Environment"  
3. **Fill** basic information (name, description, repository)
4. **Go to** "Sandbox Config" tab
5. **Select** "Existing Sandbox" option
6. **Click** "Refresh" to load available sandboxes
7. **Choose** a running sandbox from the dropdown
8. **Configure** environment variables if needed
9. **Create** environment

### Selecting Existing Sandbox

The sandbox selector shows:
- **Display Name**: Template type + sandbox ID preview
- **Status**: Current sandbox status (running/active)
- **Template**: Which E2B template is being used
- **URL**: Direct access URL to the sandbox

Example display:
```
vibekit-codex (sb_abc123...)
Status: running • Template: vibekit-codex
```

## API Integration

### List Available Sandboxes

```typescript
import { listE2BSandboxesAction } from "@/app/actions/inngest";

const sandboxes = await listE2BSandboxesAction();
// Returns: Array of { id, status, template, createdAt, displayName, url }
```

### Check Sandbox Status

```typescript
import { getE2BContainerAction } from "@/app/actions/inngest";

const container = await getE2BContainerAction("sb_abc123xyz");
// Returns: Full sandbox details including status, ports, etc.
```

## Important Notes

### Limitations

- **1-Hour E2B Limit**: E2B platform automatically destroys sandboxes after 1 hour (cannot be changed)
- **Timeout Not Modifiable**: Cannot change timeout for existing sandboxes
- **Template Lock**: Existing sandboxes use their original template configuration

### Benefits

- **State Preservation**: All files, processes, and configurations are maintained
- **Faster Startup**: No sandbox creation time
- **Resource Efficiency**: Reuse existing compute resources
- **Development Continuity**: Continue work where you left off

### Best Practices

1. **Use for Development**: Great for iterative development workflows
2. **Check Status**: Always verify sandbox is still running before use
3. **Manual Management**: Use REACTIVATE button to extend sandbox lifetime
4. **Document Sandbox IDs**: Keep track of important sandbox instances
5. **Environment Naming**: Use descriptive names to identify sandbox purpose

## Troubleshooting

### Sandbox Not Listed

- Ensure sandbox is in "running" or "active" status
- Check E2B API key permissions
- Click "Refresh" button to reload list

### Connection Failures

- Sandbox may have expired (1-hour limit)
- Use REACTIVATE button in task interface
- Verify sandbox ID is correct

### Missing Files

- Files are preserved only if sandbox hasn't been restarted
- Check if sandbox was automatically cleaned up
- Verify you're connecting to the correct sandbox

## Migration Guide

### From New Sandboxes to Existing

1. Create environment with "New Sandbox" initially
2. Note the sandbox ID from task execution  
3. Edit environment to use "Existing Sandbox"
4. Select the sandbox ID you want to preserve
5. Future tasks will reuse that sandbox

This functionality provides significant workflow improvements for development scenarios where preserving sandbox state is crucial. 