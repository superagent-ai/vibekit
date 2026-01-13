# @vibe-kit/cloudflare

Cloudflare sandbox provider for VibeKit - Run sandboxed code environments on Cloudflare's edge network using the [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/).

## Installation

```bash
npm install @vibe-kit/cloudflare @cloudflare/sandbox
```

## Usage

```typescript
import { createSandbox } from "@vibe-kit/cloudflare";

// This must be called within a Cloudflare Worker
const sandbox = await createSandbox({
  env: env, // Your Worker's env object containing the Sandbox binding
  hostname: "your-domain.com", // Your custom domain (NOT .workers.dev)
});

// Use agents
const result = await sandbox.claude({
  apiKey: env.ANTHROPIC_API_KEY,
}).run("Create a simple web server using Node.js");

// Or use low-level sandbox operations
await sandbox.exec("npm install express");
await sandbox.writeFile("/workspace/app.js", "console.log('Hello!')");

// Cleanup
await sandbox.close();
```

## Configuration

The `createSandbox` function accepts a configuration object with these properties:

- `env` (required): Your Cloudflare Worker's environment object containing the `Sandbox` Durable Object binding
- `hostname` (required): Your custom domain for generating preview URLs. **Must be a custom domain with wildcard DNS** - `.workers.dev` domains don't support the wildcard subdomains needed for preview URLs
- `sandboxId` (optional): Unique identifier for this sandbox. Same ID always returns the same sandbox instance
- `envs` (optional): Environment variables to set in the sandbox

## Cloudflare Worker Setup

Unlike other VibeKit providers, Cloudflare sandboxes run exclusively within Cloudflare Workers and use Cloudflare's container platform built on Durable Objects.

### 1. Configure wrangler.jsonc

```jsonc
{
  "name": "my-vibekit-worker",
  "main": "src/index.ts",
  "compatibility_date": "2024-01-01",
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./node_modules/@cloudflare/sandbox/Dockerfile",
      "max_instances": 1
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "class_name": "Sandbox",
        "name": "Sandbox"
      }
    ]
  },
  "migrations": [
    {
      "new_sqlite_classes": ["Sandbox"],
      "tag": "v1"
    }
  ]
}
```

### 2. Create your Worker

```typescript
import { createSandbox } from "@vibe-kit/cloudflare";

// Export the Sandbox class for Durable Objects
export { Sandbox } from "@cloudflare/sandbox";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { hostname } = new URL(request.url);
    
    // Create sandbox
    const sandbox = await createSandbox({
      env,
      hostname: "your-domain.com", // Your custom domain
    });

    try {
      // Use agents
      const result = await sandbox.claude({
        apiKey: env.ANTHROPIC_API_KEY,
      }).run("Create a Node.js web server");

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    } finally {
      await sandbox.close();
    }
  },
};
```

## Preview URLs

Preview URLs require a custom domain with wildcard DNS routing. They follow the pattern:

```
https://{port}-{sandbox-id}.your-domain.com
```

For example: `https://3000-abc123.your-domain.com`

**Note:** `.workers.dev` domains do not support wildcard DNS patterns required for preview URLs. See [Production Deployment](https://developers.cloudflare.com/sandbox/guides/production-deployment/) for setup instructions.

## Local Development

For local development with `wrangler dev`, only ports explicitly exposed in the Dockerfile are available for port forwarding.

To expose additional ports locally, create a custom Dockerfile:

```dockerfile
FROM docker.io/cloudflare/sandbox:0.1.3

EXPOSE 3000
EXPOSE 8080
EXPOSE 3001

# Always end with the same command as the base image
CMD ["bun", "index.ts"]
```

Then update your wrangler.jsonc to use the custom Dockerfile:

```jsonc
{
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./Dockerfile",
      "max_instances": 1
    }
  ]
}
```

## API Reference

### Sandbox Methods

The sandbox object includes all methods from the [Cloudflare Sandbox SDK](https://developers.cloudflare.com/sandbox/api/):

- `exec(command, options?)` - Execute a command and return the result
- `startProcess(command, options?)` - Start a background process
- `writeFile(path, content, options?)` - Write content to a file
- `readFile(path, options?)` - Read a file
- `exposePort(port, options)` - Expose a port via preview URL
- `destroy()` - Destroy the sandbox and free resources

Plus VibeKit agent methods:

- `claude(config)` - Create a Claude agent
- `codex(config)` - Create a Codex agent
- `gemini(config)` - Create a Gemini agent
- `grok(config)` - Create a Grok agent
- `opencode(config)` - Create an OpenCode agent

## Requirements

- **Cloudflare Workers**: Must run within a Cloudflare Worker environment
- **Wrangler**: For local development and deployment
- **Docker**: For building container images (happens automatically via wrangler)
- **Node.js 18+**: For development tooling
- **Custom Domain**: Required for preview URLs in production

## Environment Variables

Set API keys in your Worker's environment:

- `ANTHROPIC_API_KEY`: Required for Claude models
- `OPENAI_API_KEY`: Required for OpenAI/Codex models
- `GOOGLE_API_KEY`: Required for Gemini models

## License

MIT
