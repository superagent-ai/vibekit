<div align="center">

<img width="700px" src="./assets/vibekit-cli.png" />

# VibeKit is the safety layer for your coding agent 🖖

Run Claude Code, Gemini, Codex — or any coding agent — in a clean, isolated sandbox with sensitive data redaction and observability baked in.

---

[Website](https://vibekit.sh) • [Docs](https://docs.vibekit.sh) • [Discord](https://discord.com/invite/mhmJUTjW4b)

---
</div>

## 🚀 Quick Start

Install the VibeKit CLI globally:

```bash
npm install -g vibekit
```

Run claude code with enhanced security and tracking

```bash
vibekit claude
```

## ⚡️ Key Features

🐳 **Local sandbox** - Runs agent output in isolated Docker containers — zero risk to your local setup

🔒 **Built-in redaction** - Auto-removes secrets, api keys, and other sensitive data completions

📊 **Observability** - Complete visibility into agent operations with real-time logs, traces, and metrics

🌐 **Universal agent support** - Works with Claude Code, Gemini CLI, Grok CLI, Codex CLI, OpenCode, and more

💻 **Works offline & locally** - No cloud dependencies or internet required — works entirely on your machine

## 📦 SDK Packages (v2)

VibeKit provides a suite of packages for running coding agents in cloud sandboxes:

### Core Package

```bash
npm install @vibe-kit/core
```

The core package provides agent implementations and the `attachAgents` utility.

### Provider Packages

Choose your sandbox provider:

| Package | Provider | Install |
|---------|----------|---------|
| `@vibe-kit/e2b` | [E2B](https://e2b.dev) | `npm install @vibe-kit/e2b` |
| `@vibe-kit/modal` | [Modal](https://modal.com) | `npm install @vibe-kit/modal` |
| `@vibe-kit/daytona` | [Daytona](https://daytona.io) | `npm install @vibe-kit/daytona` |
| `@vibe-kit/cloudflare` | [Cloudflare Workers](https://workers.cloudflare.com) | `npm install @vibe-kit/cloudflare` |
| `@vibe-kit/beam` | [Beam](https://beam.cloud) | `npm install @vibe-kit/beam` |
| `@vibe-kit/blaxel` | [Blaxel](https://blaxel.ai) | `npm install @vibe-kit/blaxel` |

### Basic Usage

```typescript
import { createSandbox } from "@vibe-kit/e2b";

// Create a sandbox
const sandbox = await createSandbox({
  apiKey: process.env.E2B_API_KEY,
});

// Use any agent
const result = await sandbox.claude({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
}).run("Create a REST API with Express and TypeScript");

// Stream events
for await (const event of result) {
  if (event.type === "text") console.log(event.content);
  if (event.type === "tool_use") console.log(`Using tool: ${event.tool}`);
}

// Native sandbox methods work directly
await sandbox.files.write("/app/config.json", JSON.stringify({ port: 3000 }));

// Cleanup
await sandbox.close();
```

### Multiple Agents

```typescript
const sandbox = await createSandbox({ apiKey });

// Use different agents on the same sandbox
await sandbox.claude({ apiKey: ANTHROPIC_KEY }).run("Build the frontend");
await sandbox.codex({ apiKey: OPENAI_KEY }).run("Write tests for api.ts");
await sandbox.gemini({ apiKey: GOOGLE_KEY }).run("Add documentation");
```

### Switching Providers

```typescript
// E2B
import { createSandbox } from "@vibe-kit/e2b";
const sandbox = await createSandbox({ apiKey: E2B_KEY });

// Modal - same agent API
import { createSandbox } from "@vibe-kit/modal";
const sandbox = await createSandbox({ image: "ubuntu:22.04" });

// Daytona - same agent API
import { createSandbox } from "@vibe-kit/daytona";
const sandbox = await createSandbox({ apiKey: DAYTONA_KEY });

// Agent usage identical across all providers
await sandbox.claude({ apiKey, model }).run("Build an app");
```

### Agent CLI Flags

Each agent supports raw CLI flags for full control:

```typescript
// Claude Code with custom flags
await sandbox.claude({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
  flags: [
    "--allowedTools", "Edit,Write,Bash",
    "--verbose",
    "--max-tokens", "4096",
  ],
}).run("Create a web app");

// Codex with custom flags
await sandbox.codex({
  apiKey: process.env.OPENAI_API_KEY,
  flags: [
    "--writable-roots", "/app",
    "--approval", "full-auto",
  ],
}).run("Fix the bug");
```

## 🔐 Authentication Package

Use your MAX subscriptions in AI Apps:

```bash
npm install @vibe-kit/auth
```

Handle authentication flows for your VibeKit-powered applications.

## 📖 Migration from v1

If you're using the old `@vibe-kit/sdk`, please migrate to the new v2 API:

```typescript
// OLD (v1) - deprecated:
import { VibeKit } from "@vibe-kit/sdk";
import { createE2BProvider } from "@vibe-kit/e2b";

const e2bProvider = createE2BProvider({
  apiKey: process.env.E2B_API_KEY,
  templateId: "vibekit-claude",
});

const vibeKit = new VibeKit()
  .withAgent({
    type: "claude",
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-sonnet-4-20250514",
  })
  .withSandbox(e2bProvider);

await vibeKit.executeCommand("claude -p ...");

// NEW (v2):
import { createSandbox } from "@vibe-kit/e2b";

const sandbox = await createSandbox({
  apiKey: process.env.E2B_API_KEY,
});

await sandbox.claude({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
}).run("Create a web app");
```

## 🤝 Contributing

Contributions welcome! Open an issue, start a discussion, or submit a pull request.

## 📄 License

MIT — see [LICENSE](./LICENSE) for details.

© 2025 Superagent Technologies Inc.
