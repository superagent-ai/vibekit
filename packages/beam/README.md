# @vibe-kit/beam

Beam sandbox provider for VibeKit.

## Installation

```bash
npm install @vibe-kit/beam
```

## Prerequisites

Before using the Beam provider, you need to:

1. Sign up for a Beam account at [https://beam.cloud](https://beam.cloud)
2. Get your Beam Token and Workspace ID from the [dashboard](https://platform.beam.cloud/settings/api-keys)
3. Set them as environment variables:

```bash
export BEAM_TOKEN=YOUR_BEAM_TOKEN
export BEAM_WORKSPACE_ID=YOUR_WORKSPACE_ID
```

## Usage

```typescript
import { VibeKit } from "@vibe-kit/sdk";
import { createBeamProvider } from "@vibe-kit/beam";

// Create the Beam provider with configuration
const beamProvider = createBeamProvider({
  token: process.env.BEAM_TOKEN!,
  workspaceId: process.env.BEAM_WORKSPACE_ID!,
  cpu: 2, // optional, defaults to 2
  memory: "1Gi", // optional, defaults to "1Gi"
  keepWarmSeconds: 300, // optional, defaults to 300 (5 minutes)
});

// Create the VibeKit instance with the provider
const vibeKit = new VibeKit()
  .withAgent({
    type: "claude",
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-sonnet-4-20250514",
  })
  .withSandbox(beamProvider)
  .withWorkingDirectory("/workspace") // Optional: specify working directory
  .withSecrets({
    // Any environment variables for the sandbox
    NODE_ENV: "production",
  });

// Execute commands in the sandbox
const response = await vibeKit.executeCommand("npm install && npm test");
console.log(response);

// Clean up
await vibeKit.kill();
```

## Configuration

The Beam provider accepts the following configuration:

### Required Options

- `token` (string): Your Beam authentication token
- `workspaceId` (string): Your Beam workspace ID

### Optional Options

- `image` (string): Custom Docker image. If not provided, it will be auto-selected based on the agent type:
  - `claude` → `superagentai/vibekit-claude:1.0`
  - `codex` → `superagentai/vibekit-codex:1.0`
  - `opencode` → `superagentai/vibekit-opencode:1.0`
  - `gemini` → `superagentai/vibekit-gemini:1.1`
  - `grok` → `superagentai/vibekit-grok-cli:1.0`
  - Default: `ubuntu:22.04`

- `cpu` (number): Number of CPU cores to allocate (default: 2)
- `memory` (number | string): Memory allocation, e.g., 1024 or "1Gi" (default: "1Gi")
- `keepWarmSeconds` (number): How long to keep the sandbox warm after inactivity (default: 300 seconds)

## Features

- **Automatic Image Selection**: Automatically selects the appropriate Docker image based on agent type
- **Resource Configuration**: Configure CPU, memory, and keep-warm settings
- **Port Exposure**: Dynamically expose ports for web services
- **Command Execution**: Execute arbitrary commands with streaming output support
- **Working Directory Support**: Automatically creates and uses custom working directories
- **Background Execution**: Support for background command execution

## Advanced Usage

### Custom Docker Image

```typescript
const beamProvider = createBeamProvider({
  token: process.env.BEAM_TOKEN!,
  workspaceId: process.env.BEAM_WORKSPACE_ID!,
  image: "my-custom-image:latest",
});
```

### High-Performance Configuration

```typescript
const beamProvider = createBeamProvider({
  token: process.env.BEAM_TOKEN!,
  workspaceId: process.env.BEAM_WORKSPACE_ID!,
  cpu: 8,
  memory: "16Gi",
  keepWarmSeconds: 600, // 10 minutes
});
```

### Exposing Ports

```typescript
// Start a web server in the sandbox
await vibeKit.executeCommand("npm start");

// Get the public URL for the service
const url = await vibeKit.getHost(3000);
console.log(`Service available at: ${url}`);
```

## Limitations

- **Pause/Resume**: Beam doesn't directly support pause/resume operations. The sandbox remains active until terminated. Use `keepWarmSeconds` to manage idle timeouts.
- **Beta SDK**: The Beam TypeScript SDK is currently in beta. Some features may change in future releases.

## API Reference

### `createBeamProvider(config: BeamConfig): BeamSandboxProvider`

Factory function to create a Beam sandbox provider.

**Parameters:**
- `config.token` (required): Beam authentication token
- `config.workspaceId` (required): Beam workspace ID
- `config.image` (optional): Custom Docker image
- `config.cpu` (optional): Number of CPU cores
- `config.memory` (optional): Memory allocation
- `config.keepWarmSeconds` (optional): Keep-warm duration

**Returns:** A `BeamSandboxProvider` instance

## Requirements

- Node.js 18+
- Beam account and API credentials
- `@beamcloud/beam-js@rc` (installed automatically)

## Support

For issues related to:
- **Beam SDK**: Visit [Beam Documentation](https://docs.beam.cloud)
- **VibeKit Integration**: Open an issue on [GitHub](https://github.com/superagent-ai/vibekit/issues)

## License

MIT
