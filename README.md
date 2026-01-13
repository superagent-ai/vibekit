<div align="center">

<img width="700px" src="./assets/vibekit-cli.png" />

# VibeKit 🖖

Run Claude Code, Gemini, Codex — or any coding agent — in cloud sandboxes.

---

[Website](https://vibekit.sh) • [Docs](https://docs.vibekit.sh) • [Discord](https://discord.com/invite/mhmJUTjW4b)

---
</div>

## 🚀 Quick Start

```bash
npm install @vibe-kit/e2b
```

```typescript
import { createSandbox } from "@vibe-kit/e2b";

const sandbox = await createSandbox({
  apiKey: process.env.E2B_API_KEY,
});

await sandbox.claude({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
}).run("Create a REST API with Express");

await sandbox.close();
```

## 📦 Packages

### Core

```bash
npm install @vibe-kit/core
```

Agent implementations and the `attachAgents` utility.

### Providers

| Package | Provider |
|---------|----------|
| `@vibe-kit/e2b` | [E2B](https://e2b.dev) |
| `@vibe-kit/modal` | [Modal](https://modal.com) |
| `@vibe-kit/daytona` | [Daytona](https://daytona.io) |
| `@vibe-kit/cloudflare` | [Cloudflare Workers](https://workers.cloudflare.com) |
| `@vibe-kit/beam` | [Beam](https://beam.cloud) |
| `@vibe-kit/blaxel` | [Blaxel](https://blaxel.ai) |

## 💡 Usage

### Basic

```typescript
import { createSandbox } from "@vibe-kit/e2b";

const sandbox = await createSandbox({
  apiKey: process.env.E2B_API_KEY,
});

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

await sandbox.close();
```

### Multiple Agents

```typescript
const sandbox = await createSandbox({ apiKey });

await sandbox.claude({ apiKey: ANTHROPIC_KEY }).run("Build the frontend");
await sandbox.codex({ apiKey: OPENAI_KEY }).run("Write tests for api.ts");
await sandbox.gemini({ apiKey: GOOGLE_KEY }).run("Add documentation");
```

### Switching Providers

```typescript
// E2B
import { createSandbox } from "@vibe-kit/e2b";
const sandbox = await createSandbox({ apiKey: E2B_KEY });

// Modal
import { createSandbox } from "@vibe-kit/modal";
const sandbox = await createSandbox({ image: "ubuntu:22.04" });

// Daytona
import { createSandbox } from "@vibe-kit/daytona";
const sandbox = await createSandbox({ apiKey: DAYTONA_KEY });

// Agent usage identical across all providers
await sandbox.claude({ apiKey, model }).run("Build an app");
```

### CLI Flags

Pass flags directly to agent CLIs:

```typescript
await sandbox.claude({
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: "claude-sonnet-4-20250514",
  flags: [
    "--allowedTools", "Edit,Write,Bash",
    "--verbose",
    "--max-tokens", "4096",
  ],
}).run("Create a web app");

await sandbox.codex({
  apiKey: process.env.OPENAI_API_KEY,
  flags: [
    "--writable-roots", "/app",
    "--approval", "full-auto",
  ],
}).run("Fix the bug");
```

## 🤝 Contributing

Contributions welcome! Open an issue, start a discussion, or submit a pull request.

## 📄 License

MIT — see [LICENSE](./LICENSE) for details.

© 2025 Superagent Technologies Inc.