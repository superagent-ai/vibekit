# @vibe-kit/sdk

VibeKit SDK is a TypeScript library that provides a fluent interface for integrating AI coding agents into your applications. It supports multiple AI providers (Claude, Codex, Gemini, Grok, OpenCode) and various sandbox environments for secure code execution.

## Installation

```bash
npm install @vibe-kit/sdk
```

## Quick Start

```typescript
import { VibeKit } from "@vibe-kit/sdk";
import { createE2BProvider } from "@vibe-kit/e2b";

// Configure sandbox provider
const e2bProvider = createE2BProvider({
  apiKey: process.env.E2B_API_KEY!,
  templateId: "vibekit-claude",
});

// Create and configure VibeKit instance
const vibeKit = new VibeKit()
  .withAgent({
    type: "claude",
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-sonnet-4-20250514",
  })
  .withSandbox(e2bProvider);

// Add event listeners
vibeKit.on("update", (update) => {
  console.log("Update:", update);
});

vibeKit.on("error", (error) => {
  console.error("Error:", error);
});

// Generate code
const result = await vibeKit.generateCode({
  prompt: "Create a simple web app that displays a list of users",
  mode: "code",
});

// Clean up when done
await vibeKit.kill();

console.log("Result:", result);
```

## Configuration

### Agent Configuration

Configure which AI agent to use:

```typescript
.withAgent({
  type: "claude",           // Agent type: "claude", "codex", "opencode", "gemini", "grok"
  provider: "anthropic",    // Provider: "anthropic", "openai", "openrouter", etc.
  apiKey: "your-api-key",   // API key for the provider
  model: "claude-sonnet-4-20250514", // Specific model to use
})
```

### Sandbox Configuration

Configure the execution environment. Install the specific provider package first:

```typescript
// E2B
import { createE2BProvider } from "@vibe-kit/e2b";
const e2bProvider = createE2BProvider({
  apiKey: "e2b_****",
  templateId: "custom-template-id" // optional
});

// Northflank
import { createNorthflankProvider } from "@vibe-kit/northflank";
const northflankProvider = createNorthflankProvider({
  apiKey: "nf_****",
  image: "your-custom-image", // optional
});

// Daytona
import { createDaytonaProvider } from "@vibe-kit/daytona";
const daytonaProvider = createDaytonaProvider({
  apiKey: "daytona_****",
  image: "my-codex-image", // optional
});

.withSandbox(provider)

// Modal

import { createModalProvider } from "@vibe-kit/modal";
const modalProvider = createModalProvider({ // must conduct CLI setup specified in https://modal.com/docs/reference/cli/setup beforehand
  image: "my-codex-image" // optional
});

```

### Additional Configuration

```typescript
// GitHub integration for PR creation
.withGithub({
  token: "ghp_****",
  repository: "owner/repo-name"
})

// Working directory
.withWorkingDirectory("/path/to/project")

// Environment variables
.withSecrets({
  "DATABASE_URL": "postgresql://...",
  "API_KEY": "secret-key"
})

// Reuse existing sandbox session
.withSession("existing-sandbox-id")

// Git worktrees for isolated branch development
.withWorktrees({
  root: "/custom/worktree/path", // optional: custom root directory
  cleanup: true // optional: auto-cleanup after operations (default: true)
})
```

## Typed Outputs

VibeKit provides full TypeScript support for both streaming and non-streaming outputs:

### Agent Response Types

```typescript
import { AgentResponse, SpecificAgentResponse, TypedExecuteCommandOptions } from '@vibe-kit/sdk';

// Base agent response (from any agent)
const response: AgentResponse = await vibeKit.executeCommand('npm test');
console.log(`Exit code: ${response.exitCode}`);
console.log(`Output: ${response.stdout}`);
console.log(`Sandbox: ${response.sandboxId}`);
```

### Streaming Output Types

```typescript
import { StreamingOutputMessage } from '@vibe-kit/sdk';

const options: TypedExecuteCommandOptions = {
  callbacks: {
    onUpdate: (message: StreamingOutputMessage | string) => {
      if (typeof message === 'object') {
        console.log(`[${message.type}] ${message.message}`);
      } else {
        console.log(message);
      }
    },
    onError: (error: string) => console.error(error)
  }
};

await vibeKit.executeCommand('npm install', options);
```

### Streaming Message Structure

```typescript
interface StreamingOutputMessage {
  type: 'start' | 'git' | 'end' | 'tool_call' | 'tool_result' | 'text';
  sandbox_id?: string;
  output?: string;     // Raw output (usually JSON)
  message?: string;    // Human-readable message
  timestamp?: number;  // Unix timestamp
}
```

## API Reference

### `generateCode(options)`

**⚠️ Deprecated** - Use `executeCommand()` instead for better type safety.

Generate code using the configured AI agent.

```typescript
const result = await vibeKit.generateCode({
  prompt: "Create a React component for a todo list",
  mode: "code", // "code" for generation, "ask" for Q&A
  branch?: "feature-branch", // optional
  history?: conversationHistory, // optional
});
```

### `createPullRequest(labelOptions?, branchPrefix?)`

Create a pull request with generated code.

```typescript
const pr = await vibeKit.createPullRequest();
```

### `executeCommand(command, options?)`

Execute a command in the sandbox with full type safety.

```typescript
import { AgentResponse, TypedExecuteCommandOptions } from '@vibe-kit/sdk';

// Simple execution
const result: AgentResponse = await vibeKit.executeCommand("npm test");

// With typed options and streaming
const options: TypedExecuteCommandOptions = {
  timeoutMs: 300000,
  branch: 'feature/new-feature',
  callbacks: {
    onUpdate: (message) => console.log('Update:', message),
    onError: (error) => console.error('Error:', error)
  }
};

const result: AgentResponse = await vibeKit.executeCommand("npm run build", options);
```

### `runTests()`

Run tests in the sandbox with typed output.

```typescript
import { AgentResponse } from '@vibe-kit/sdk';

const result: AgentResponse = await vibeKit.runTests();
console.log(`Tests ${result.exitCode === 0 ? 'passed' : 'failed'}`);
```

### Session Management

```typescript
// Get current session ID
const sessionId = await vibeKit.getSession();

// Set session ID
await vibeKit.setSession("session-id");

// Pause sandbox
await vibeKit.pause();

// Resume sandbox
await vibeKit.resume();

// Kill sandbox
await vibeKit.kill();
```

### `getHost(port)`

Get the host URL for a specific port.

```typescript
const host = await vibeKit.getHost(3000);
console.log(`App running at: ${host}`);
```

## Events

VibeKit extends EventEmitter and emits the following events with proper typing:

```typescript
import { StreamingOutputMessage } from '@vibe-kit/sdk';

vibeKit.on("update", (message: string | StreamingOutputMessage) => {
  // Streaming updates during code generation
  // Can be structured StreamingOutputMessage or raw string
});

vibeKit.on("error", (error: string) => {
  // Error notifications
});

vibeKit.on("stdout", (data: string | StreamingOutputMessage) => {
  // Standard output from command execution
  // Can be structured data or raw output
});

vibeKit.on("stderr", (data: string) => {
  // Standard error from command execution
});
```

## Supported Agents

- **Claude** - Anthropic's Claude models
- **Codex** - OpenAI's Codex models
- **OpenCode** - Open-source coding models
- **Gemini** - Google's Gemini models
- **Grok** - xAI's Grok models

## Supported Sandbox Providers

- **E2B** - Cloud sandboxes
- **Northflank** - Kubernetes-based environments
- **Daytona** - Development environments
- **Cloudflare** - Workers-based sandboxes
- **Dagger** - Container-based execution
- **Modal** - Serverless computing
- **Fly.io** - Edge computing

## Error Handling

```typescript
try {
  const result = await vibeKit.generateCode({
    prompt: "Create a web app",
    mode: "code"
  });
} catch (error) {
  if (error.message.includes('not initialized')) {
    // Handle initialization error
  } else {
    // Handle generation error
  }
}
```

## Examples

### With Conversation History

```typescript
const history = [
  { role: "user", content: "What is React?" },
  { role: "assistant", content: "React is a JavaScript library..." }
];

const response = await vibeKit.generateCode({
  prompt: "Now show me a React component example",
  mode: "code",
  history
});
```

### With Streaming

```typescript
const response = await vibeKit.generateCode({
  prompt: "Explain how React hooks work",
  mode: "ask"
});

// Listen to streaming updates via events
vibeKit.on("update", (message) => {
  console.log("Update:", message);
});
```

## License

MIT

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting pull requests.