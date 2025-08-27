# @vibe-kit/cloudflare

Cloudflare sandbox provider for VibeKit - Run sandboxed code environments on Cloudflare's edge network.

## Installation

```bash
npm install @vibe-kit/cloudflare
```

## Usage

```typescript
import { VibeKit } from "@vibe-kit/sdk";
import { createCloudflareProvider } from "@vibe-kit/cloudflare";

// This must be called within a Cloudflare Worker
const provider = createCloudflareProvider({
  env: env, // Your Worker's env object containing the Sandbox binding
  hostname: "your-worker.domain.workers.dev", // Your Worker's hostname for preview URLs
});

const vibeKit = new VibeKit()
  .withSandbox(provider)
  .withAgent({
    type: "claude",
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-sonnet-4-20250514",
  })

// Use the sandbox
const result = await vibeKit.generateCode({
  prompt: "Create a simple web server using Node.js",
  mode: "code",
});
```

## Configuration

The `createCloudflareProvider` function accepts a configuration object with these properties:

- `env` (required): Your Cloudflare Worker's environment object containing the `Sandbox` Durable Object binding
- `hostname` (required): Your Worker's hostname used for generating preview URLs when exposing ports

## Cloudflare Worker Setup

Unlike other VibeKit providers, Cloudflare sandboxes run exclusively within Cloudflare Workers and use Cloudflare's container platform built on Durable Objects. Here's how to set up your Worker:

### 1. Configure wrangler.json

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

### 3. Create your Worker

```typescript
import { VibeKit } from "@vibe-kit/sdk";
import { createCloudflareProvider } from "@vibe-kit/cloudflare";

// Export the Sandbox class for Durable Objects
export { Sandbox } from "@cloudflare/sandbox";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle VibeKit requests
    if (new URL(request.url).pathname === "/vibekit") {
      const provider = createCloudflareProvider({
        env,
        hostname: request.headers.get("host") || "localhost",
      });

      const vibeKit = new VibeKit()
        .withSandbox(provider)
        .withAgent({
          type: "claude",
          provider: "anthropic",
          apiKey: process.env.ANTHROPIC_API_KEY!,
          model: "claude-sonnet-4-20250514",
        })

      const result = await vibeKit.generateCode({
        prompt: "Create a Node.js web server",
        mode: "code",
      });

      return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};
```

## Local Development

For local development with `wrangler dev`, only ports explicitly exposed in the Dockerfile are available for port forwarding. This is not an issue in production.

To test multiple ports locally, create a custom Dockerfile:

```dockerfile
FROM docker.io/cloudflare/sandbox:0.1.3

EXPOSE 3000
EXPOSE 8080
EXPOSE 3001

# Always end with the same command as the base image
CMD ["bun", "index.ts"]
```

Then update your wrangler.json to use the custom Dockerfile:

```jsonc
{
  "containers": [
    {
      "class_name": "Sandbox",
      "image": "./Dockerfile",  // Point to your custom Dockerfile
      "max_instances": 1
    }
  ]
}
```

## Requirements

- **Cloudflare Workers**: Must run within a Cloudflare Worker environment
- **Wrangler**: For local development and deployment
- **Docker**: For building container images (happens automatically via wrangler)
- **Node.js 18+**: For development tooling

## Environment Variables

Set the keys you need in your Worker's environment:

- `ANTHROPIC_API_KEY`: Required for using Anthropic Claude models
- `OPENAI_API_KEY`: Required for using OpenAI models
- `GOOGLE_API_KEY`: Required for using Google Gemini models

## License

MIT
