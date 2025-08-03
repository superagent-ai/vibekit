# Changes to packages/dagger/src/dagger/vibekit-dagger.ts

## Overview
The primary changes were made to fix critical issues:
1. Build error due to circular dependency
2. Docker username auto-detection not working
3. GraphQL synchronous call errors when using Dagger
4. Multiple Docker image pulls (4 times) instead of once
5. Container state not persisting between commands

## Detailed Changes

### 1. Added Import for Cache Sharing
```typescript
import { CacheSharingMode } from "@dagger.io/dagger";
```
**Purpose**: Enable Dagger's cache volume functionality for state persistence between commands.

### 2. Modified LocalSandboxInstance Properties
**Added:**
```typescript
private volumeName: string;
private client: Client | null = null;
private workspaceContainer: Container | null = null;
```
**Purpose**: 
- `volumeName`: Unique identifier for the cache volume to maintain state
- `client`: Store single Dagger client connection to avoid GraphQL sync errors
- `workspaceContainer`: Maintain single container instance to prevent multiple image pulls

### 3. New Initialize Method
**Added:**
```typescript
private async initialize(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    connect(async (client) => {
      this.client = client;
      this.workspaceContainer = await this.createWorkspaceContainer(client);
      resolve();
      while (this.isRunning) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });
  });
}
```
**Purpose**: 
- Creates a single long-lived connection to Dagger
- Initializes the container once and keeps it running
- Prevents "GraphQL synchronous call" errors
- Ensures Docker image is only pulled once

### 4. Docker Username Detection Fix
**Modified `getDockerLoginInfo()` and `checkDockerLogin()`:**
```typescript
// Changed regex pattern to handle new Docker output format
const usernameMatch = stdout.match(/\[Username:\s*([^\]]+)\]/);
```
**Purpose**: Parse Docker's new output format `[Username: joedanziger]` instead of the old format.

### 5. Cache Volume Implementation
**Added in `createWorkspaceContainer()`:**
```typescript
const cacheVolume = client.cacheVolume(this.volumeName);
container = container.withMountedCache(this.workDir || "/vibe0", cacheVolume, {
  sharing: CacheSharingMode.Shared
});
```
**Purpose**: 
- Mount a persistent cache volume at the working directory
- Ensures files persist between command executions
- Replaces the broken `workspaceDirectory` mechanism

### 6. Single Connection Pattern in Public Methods
**Changed pattern in `run()`, `readFile()`, `writeFile()`, etc.:**
```typescript
// Before: Each method created a new connection
await connect(async (client) => {
  // ... do work
});

// After: Use the persistent connection
if (!this.client || !this.workspaceContainer) {
  throw new Error("Sandbox not initialized");
}
// Use this.workspaceContainer directly
```
**Purpose**: 
- Eliminate multiple Docker image pulls
- Fix GraphQL sync errors
- Improve performance by reusing connection

### 7. Start Method Modifications
**Changed:**
```typescript
public async start(): Promise<void> {
  this.isRunning = true;
  await this.initialize();
}
```
**Purpose**: Initialize the single connection when sandbox starts.

### 8. Kill Method Updates
**Changed:**
```typescript
public async kill(): Promise<void> {
  this.isRunning = false;
  // Connection cleanup happens automatically when the initialize() loop exits
}
```
**Purpose**: Properly cleanup the long-lived connection.

## Key Architecture Changes

### Before (Multiple Short-lived Connections):
1. Each command created a new `connect()` call
2. Each connection pulled the Docker image
3. State was lost between commands
4. GraphQL sync errors occurred frequently

### After (Single Long-lived Connection):
1. One connection created at sandbox start
2. Docker image pulled only once
3. State persists via cache volumes
4. No GraphQL sync errors
5. Better performance

## Impact
These changes ensure:
- ✅ Build succeeds without circular dependency errors
- ✅ Docker username is correctly auto-detected
- ✅ No GraphQL synchronous call errors
- ✅ Docker image is pulled only once per sandbox lifetime
- ✅ Files persist between commands in the same sandbox session
- ✅ Improved performance and reliability