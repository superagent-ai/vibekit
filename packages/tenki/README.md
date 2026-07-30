# @vibe-kit/tenki

[Tenki](https://tenki.cloud) sandbox provider for VibeKit. Runs coding agents inside Tenki's disposable Linux microVMs, with per-second billing, preview URLs, and pause/resume.

## Installation

```bash
npm install @vibe-kit/tenki
```

## Prerequisites

1. Sign up for Tenki and create a workspace at [tenki.cloud](https://tenki.cloud) (comes with free monthly credit).
2. Create an API key (prefixed `tk_`) in your account settings.
3. Set it as an environment variable:

```bash
export TENKI_AUTH_TOKEN=tk_your_key_here
```

## Usage

```typescript
import { VibeKit } from "@vibe-kit/sdk";
import { createTenkiProvider } from "@vibe-kit/tenki";

// Create the Tenki provider with configuration
const tenkiProvider = createTenkiProvider({
  apiKey: process.env.TENKI_AUTH_TOKEN!, // optional; falls back to TENKI_AUTH_TOKEN / TENKI_API_KEY
  cpuCores: 2, // optional
  memoryMb: 4096, // optional
});

// Create the VibeKit instance with the provider
const vibeKit = new VibeKit()
  .withAgent({
    type: "claude",
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "sonnet", // alias for the current Sonnet; a pinned dated model can 404
  })
  .withSandbox(tenkiProvider)
  .withWorkingDirectory("/var/vibe0") // optional
  .withSecrets({
    // Any environment variables for the sandbox
    NODE_ENV: "development",
  });

try {
  // Run a command in the sandbox and read its output
  // (executeCommand is VibeKit's supported entrypoint; generateCode is deprecated)
  const result = await vibeKit.executeCommand("echo 'hello from the sandbox'");
  console.log(result.stdout);

  // Execute commands in the sandbox
  await vibeKit.executeCommand("npm install && npm test");

  // Start a dev server in the background and get its public URL
  await vibeKit.executeCommand("npm run dev", { background: true });
  const url = await vibeKit.getHost(3000);
  console.log(`Service available at: ${url}`);
} finally {
  // Always tear the sandbox down, even if a command or getHost() throws.
  await vibeKit.kill();
}
```

## Configuration

`createTenkiProvider` accepts:

- **`apiKey`** (string, optional): your Tenki API key (`tk_…`). Falls back to `TENKI_AUTH_TOKEN`, then `TENKI_API_KEY`.
- **`baseUrl`** (string, optional): override the Tenki API endpoint (defaults to `https://api.tenki.cloud`).
- **`workspaceId`** (string, optional): explicit workspace scope — only needed for service-token callers; a workspace API key (`tk_…`) infers it automatically.
- **`cpuCores`** (number, optional): vCPU cores for the sandbox.
- **`memoryMb`** (number, optional): memory in MB for the sandbox.
- **`maxDurationMs`** (number, optional): hard cap on total sandbox lifetime — a backstop so an abandoned sandbox self-terminates.
- **`idleTimeoutMinutes`** (number, optional): auto-stop after N idle minutes. Keep it longer than your longest single task.
- **`waitTimeoutMs`** (number, optional): how long `create()` waits for readiness; bounds provisioning independently of per-command timeouts.
- **`sticky`** (boolean, optional): keep the sandbox persistent/long-lived, enabling reliable `resume`.
- **`image`** (string | object, optional): boot from a pre-built **Tenki registry** image. This is a Tenki registry reference, **not** a Docker Hub image. When set, the agent CLI is assumed to be pre-installed.
- **`snapshotId`** (string, optional): boot from a Tenki snapshot. Same skip-install behavior as `image`.
- **`installAgent`** (boolean, optional): install the requested agent's CLI at create time on Tenki's default base image. Defaults to `true` unless `image`/`snapshotId` is supplied.

## How it works

By default this provider boots Tenki's stock base image and installs the requested agent's CLI at create time (`@anthropic-ai/claude-code`, `@openai/codex`, `@google/gemini-cli`, `opencode-ai`, or `@vibe-kit/grok-cli` — the same packages used by the prebuilt VibeKit images). To avoid the per-create install, pre-bake those CLIs into a Tenki registry image or snapshot and pass it via `image` / `snapshotId`.

## Features

- Runtime agent-CLI installation on Tenki's default base image (no image maintenance required)
- Optional custom Tenki registry image / snapshot
- Background command execution with streamed stdout/stderr
- Preview URLs via exposed ports (`getHost`)
- Pause / resume of long-lived sandboxes
- Environment variable injection
- Custom working directory

## Requirements

- Node.js 18+
- A Tenki account, workspace, and API key

## License

MIT
