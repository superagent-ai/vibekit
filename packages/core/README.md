# @vibe-kit/core

Core package for VibeKit SDK v2 - Agent implementations and shared utilities.

## Installation

```bash
npm install @vibe-kit/core
```

## Overview

This package provides the core functionality for the VibeKit SDK v2:

- **Type definitions** for sandboxes, agents, and events
- **`attachAgents` utility** to add agent capabilities to any sandbox
- **Individual agent implementations** (Claude, Codex, Gemini, Grok, Opencode)

## Usage

### With Provider Packages (Recommended)

The easiest way to use VibeKit is through provider packages that already have agents attached:

```typescript
import { createSandbox } from "@vibe-kit/e2b";

const sandbox = await createSandbox({
  apiKey: process.env.E2B_API_KEY,
});

// Agents are already attached
const result = await sandbox.claude({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
}).run("Create a REST API with Express");

// Stream events
for await (const event of result) {
  if (event.type === "text") console.log(event.content);
}
```

### With Custom Sandboxes

If you have a custom sandbox implementation, use `attachAgents`:

```typescript
import { attachAgents, BaseSandbox } from "@vibe-kit/core";

// Your custom sandbox that implements BaseSandbox
const customSandbox: BaseSandbox = {
  process: {
    start: async (cmd, opts) => { /* ... */ },
    startAndWait: async (cmd, opts) => { /* ... */ },
  },
  files: {
    write: async (path, content) => { /* ... */ },
    read: async (path) => { /* ... */ },
  },
};

// Attach agents
const sandbox = attachAgents(customSandbox);

// Now use agents
await sandbox.claude({ apiKey }).run("Build something");
```

## Agents

### Claude

```typescript
const result = await sandbox.claude({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
  flags: [
    "--allowedTools", "Edit,Write,Bash",
    "--verbose",
  ],
}).run("Create a web app");
```

### Codex

```typescript
const result = await sandbox.codex({
  apiKey: process.env.OPENAI_API_KEY,
  flags: [
    "--writable-roots", "/app",
    "--approval", "full-auto",
  ],
}).run("Fix the bug in api.ts");
```

### Gemini

```typescript
const result = await sandbox.gemini({
  apiKey: process.env.GOOGLE_API_KEY,
  flags: ["--sandbox"],
}).run("Add error handling");
```

### Grok

```typescript
const result = await sandbox.grok({
  apiKey: process.env.XAI_API_KEY,
}).run("Optimize this function");
```

### Opencode

```typescript
const result = await sandbox.opencode({
  provider: "anthropic",
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
}).run("Refactor the codebase");
```

## API Reference

### `attachAgents<T>(sandbox: T): T & Agents`

Attach agent capabilities to a sandbox instance.

### Types

- `BaseSandbox` - Interface that sandboxes must implement
- `Agent` - Agent instance with `run()` and `ask()` methods
- `AgentResult` - Result type that supports streaming and await
- `AgentEvent` - Union type of all possible events
- `FinalResult` - Final result after agent execution

### Agent Configuration Types

- `ClaudeConfig` - Configuration for Claude Code
- `CodexConfig` - Configuration for OpenAI Codex
- `GeminiConfig` - Configuration for Gemini CLI
- `GrokConfig` - Configuration for Grok CLI
- `OpencodeConfig` - Configuration for Opencode

## License

MIT
