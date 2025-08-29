# VibeKit SDK API Documentation

## Overview
VibeKit is a TypeScript SDK for running AI coding agents (Claude, Codex, Gemini, OpenCode) in secure sandboxes with GitHub integration.

**Core Package**: `@vibe-kit/vibekit`  
**Version**: 0.0.43  
**Main Entry**: `dist/index.js`

**Sandbox Providers**:
- `@vibe-kit/e2b` - E2B cloud execution environment
- `@vibe-kit/daytona` - Daytona development platform  
- `@vibe-kit/northflank` - Northflank container platform
- `@vibe-kit/cloudflare` - Cloudflare edge sandboxes (Workers only)

## Installation
```bash
# Core VibeKit package
npm install @vibe-kit/vibekit

# Sandbox providers (choose one or more)
npm install @vibe-kit/e2b        # E2B sandbox provider
npm install @vibe-kit/daytona    # Daytona sandbox provider  
npm install @vibe-kit/northflank # Northflank sandbox provider
npm install @vibe-kit/cloudflare # Cloudflare sandbox provider (Workers only)
```

## Quick Start
```typescript
import { VibeKit } from '@vibe-kit/vibekit';
import { createE2BProvider } from '@vibe-kit/e2b';

// Create sandbox provider
const e2bProvider = createE2BProvider({
  apiKey: 'your-e2b-key',
  templateId: 'vibekit-codex'  // or vibekit-claude, vibekit-gemini, etc.
});

// Create VibeKit instance with builder pattern
const vibekit = new VibeKit()
  .withAgent({
    type: 'codex',
    provider: 'openai',
    apiKey: 'your-openai-key',
    model: 'codex-mini-latest'
  })
  .withSandbox(e2bProvider)
  .withGithub({
    token: 'your-github-token',
    repository: 'owner/repo'
  });

// Set up event listeners
vibekit.on('update', (message) => {
  console.log('Update:', message);
});

vibekit.on('error', (error) => {
  console.error('Error:', error);
});

// Generate code
const result = await vibekit.generateCode(
  'Add error handling to login function',
  'code'  // mode: 'code' or 'ask'
);

// Clean up
await vibekit.kill();
```









## Usage Examples

### Basic Code Generation
```typescript
import { VibeKit } from '@vibe-kit/vibekit';
import { createE2BProvider } from '@vibe-kit/e2b';

// Create sandbox provider
const e2bProvider = createE2BProvider({
  apiKey: process.env.E2B_API_KEY,
  templateId: 'vibekit-claude'
});

// Create VibeKit instance
const vibekit = new VibeKit()
  .withAgent({
    type: 'claude',
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514'
  })
  .withSandbox(e2bProvider)
  .withGithub({
    token: process.env.GITHUB_TOKEN,
    repository: 'owner/repo'
  })
  .withWorkingDirectory('/var/vibe0');

// Set up event listeners
vibekit.on('update', (msg) => console.log('Progress:', msg));
vibekit.on('error', (err) => console.error('Error:', err));

// Generate code
const result = await vibekit.generateCode(
  'Add input validation to the user registration form',
  'code'  // mode: 'code' or 'ask'
);

if (result.exitCode === 0) {
  const pr = await vibekit.createPullRequest({
    name: 'enhancement',
    color: '0075ca',
    description: 'New feature or request'
  });
  console.log('PR created:', pr.html_url);
}

// Clean up
await vibekit.kill();
```

### Different Sandbox Providers
```typescript
import { VibeKit } from '@vibe-kit/vibekit';
import { createE2BProvider } from '@vibe-kit/e2b';
import { createDaytonaProvider } from '@vibe-kit/daytona';
import { createNorthflankProvider } from '@vibe-kit/northflank';
import { createCloudflareProvider } from '@vibe-kit/cloudflare';

// Using E2B
const e2bProvider = createE2BProvider({
  apiKey: process.env.E2B_API_KEY,
  templateId: 'vibekit-codex'
});

// Using Daytona
const daytonaProvider = createDaytonaProvider({
  apiKey: process.env.DAYTONA_API_KEY,
  serverUrl: process.env.DAYTONA_SERVER_URL
});

// Using Northflank
const northflankProvider = createNorthflankProvider({
  apiKey: process.env.NORTHFLANK_API_KEY,
  projectId: process.env.NORTHFLANK_PROJECT_ID
});

// Using Cloudflare (Workers only)
const cloudflareProvider = createCloudflareProvider({
  env: env, // Worker env object with Sandbox binding
  hostname: "your-worker.domain.workers.dev"
});

// Create VibeKit with any provider
const vibekit = new VibeKit()
  .withAgent({
    type: 'codex',
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'codex-mini-latest'
  })
  .withSandbox(e2bProvider) // or daytonaProvider, northflankProvider, cloudflareProvider
  .withGithub({
    token: process.env.GITHUB_TOKEN,
    repository: 'owner/repo'
  });

const response = await vibekit.generateCode(
  'Refactor the authentication middleware',
  'code'
);

await vibekit.kill();
```

### Different Agent Types
```typescript
import { VibeKit } from '@vibe-kit/vibekit';
import { createE2BProvider } from '@vibe-kit/e2b';

const e2bProvider = createE2BProvider({
  apiKey: process.env.E2B_API_KEY,
  templateId: 'vibekit-claude'  // Use appropriate template for each agent
});

// Claude Agent
const claudeVibekit = new VibeKit()
  .withAgent({
    type: 'claude',
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514'
  })
  .withSandbox(e2bProvider);

// Codex Agent
const codexVibekit = new VibeKit()
  .withAgent({
    type: 'codex',
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'codex-mini-latest'
  })
  .withSandbox(e2bProvider);

// Gemini Agent
const geminiVibekit = new VibeKit()
  .withAgent({
    type: 'gemini',
    provider: 'google',
    apiKey: process.env.GEMINI_API_KEY,
    model: 'gemini-2.5-pro'
  })
  .withSandbox(e2bProvider);

// OpenCode Agent
const opencodeVibekit = new VibeKit()
  .withAgent({
    type: 'opencode',
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514'
  })
  .withSandbox(e2bProvider);

// Set up streaming
claudeVibekit.on('update', (message) => {
  console.log('Claude update:', message);
});

const result = await claudeVibekit.generateCode(
  'Add rate limiting to the authentication function',
  'code'
);

await claudeVibekit.kill();
```

### Sandbox Management
```typescript
import { VibeKit } from '@vibe-kit/vibekit';
import { createE2BProvider } from '@vibe-kit/e2b';

const e2bProvider = createE2BProvider({
  apiKey: process.env.E2B_API_KEY,
  templateId: 'vibekit-claude'
});

const vibekit = new VibeKit()
  .withAgent({
    type: 'claude',
    provider: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: 'claude-sonnet-4-20250514'
  })
  .withSandbox(e2bProvider)
  .withSecrets({ 
    MY_SECRET: 'secret-value',
    DATABASE_URL: 'postgres://...'
  });

// Set up command output streaming
vibekit.on('update', console.log);

// Execute custom commands
const cmdResult = await vibekit.executeCommand('npm test');

// Get sandbox host for port forwarding
const host = await vibekit.getHost(3000);
console.log('App running at:', host);

// Pause/resume for cost optimization
await vibekit.pause();
// ... later
await vibekit.resume();

// Clean up
await vibekit.kill();
```

### Cloudflare Workers Integration (Complete Setup)

**IMPORTANT**: Cloudflare sandboxes ONLY work within Cloudflare Workers - they cannot be used in regular Node.js applications, serverless functions, or any other environment.

#### 1. Required Project Structure
```
my-vibekit-worker/
├── src/
│   └── index.ts          # Your Worker code
├── wrangler.json         # Cloudflare configuration
├── package.json
└── node_modules/
    └── @cloudflare/
        └── sandbox/
            └── Dockerfile  # Container configuration
```

#### 2. wrangler.json Configuration
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
  ],
  "vars": {
    "ANTHROPIC_API_KEY": "your-key-here"
  }
}
```

#### 3. Complete Worker Implementation
```typescript
import { VibeKit } from '@vibe-kit/vibekit';
import { createCloudflareProvider } from '@vibe-kit/cloudflare';

// REQUIRED: Export Sandbox class for Durable Objects
export { Sandbox } from "@cloudflare/sandbox";

interface Env {
  ANTHROPIC_API_KEY: string;
  OPENAI_API_KEY?: string;
  GITHUB_TOKEN?: string;
  Sandbox: DurableObjectNamespace; // The Durable Object binding
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle VibeKit requests
    if (url.pathname === '/vibekit' || url.pathname.startsWith('/api/')) {
      try {
        // Create Cloudflare provider - MUST be inside Worker
        const provider = createCloudflareProvider({
          env: env, // Worker env with Sandbox binding
          hostname: request.headers.get("host") || "localhost"
        });

        // Create VibeKit instance
        const vibekit = new VibeKit()
          .withAgent({
            type: 'claude',
            provider: 'anthropic', 
            apiKey: env.ANTHROPIC_API_KEY,
            model: 'claude-sonnet-4-20250514'
          })
          .withSandbox(provider)
          .withGithub({
            token: env.GITHUB_TOKEN,
            repository: 'your-org/your-repo'
          });

        // Handle different endpoints
        if (url.pathname === '/vibekit/generate') {
          const body = await request.json() as { prompt: string; mode: string };
          
          const result = await vibekit.generateCode({
            prompt: body.prompt,
            mode: body.mode as 'code' | 'ask'
          });

          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        if (url.pathname === '/vibekit/host') {
          const body = await request.json() as { port: number };
          const host = await vibekit.getHost(body.port);
          
          return new Response(JSON.stringify({ url: host }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }

        return new Response('VibeKit Worker ready', { status: 200 });

      } catch (error) {
        return new Response(JSON.stringify({ 
          error: error.message 
        }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response('Not found', { status: 404 });
  }
};
```

#### 4. Preview URLs and Service Exposure

When your sandbox creates a service (like a web server), Cloudflare automatically generates preview URLs:

```typescript
// In your VibeKit code generation:
const result = await vibekit.generateCode({
  prompt: "Create a Node.js web server on port 3000",
  mode: "code"
});

// Get the preview URL
const previewUrl = await vibekit.getHost(3000);
// Returns: https://3000-sandbox-id.your-worker.domain.workers.dev

// This URL provides direct access to your sandbox service
```

#### 5. Local Development Port Configuration

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

#### 6. Deployment Commands
```bash
# Install dependencies
npm install @vibe-kit/vibekit @vibe-kit/cloudflare

# Deploy to Cloudflare
wrangler deploy

# For local development
wrangler dev
```

#### 7. Environment Variables in Worker
Set these in wrangler.json `vars` section or via Cloudflare dashboard:
```jsonc
{
  "vars": {
    "ANTHROPIC_API_KEY": "your-anthropic-key",
    "OPENAI_API_KEY": "your-openai-key", 
    "GITHUB_TOKEN": "your-github-token"
  }
}
```

#### 8. Key Differences from Other Providers

- **Worker-Only**: Cannot run outside Cloudflare Workers
- **No API Keys**: Uses Durable Object bindings instead of API keys
- **Automatic Preview URLs**: Services are automatically exposed with public URLs
- **Edge Distribution**: Sandboxes run on Cloudflare's global edge network
- **Container Platform**: Built on Cloudflare's container technology
- **Direct Access**: Preview URLs provide direct access to sandbox services
- **Export Required**: Must export the Sandbox class from your Worker

#### 9. Troubleshooting

**"Sandbox binding not found"**: Ensure your wrangler.json has proper Durable Object configuration and you're passing the correct `env` object.

**Preview URLs not working**: Ensure your Worker's hostname is correctly configured in the provider setup.

**Container errors**: The Dockerfile is provided by @cloudflare/sandbox package - don't create your own unless customizing.

## Supported Sandbox Runtimes

- **E2B**: Cloud-based code execution environment
- **Daytona**: Development environment platform
- **Northflank**: Container-based sandbox platform
- **Cloudflare**: Edge-native sandboxes on Cloudflare Workers (Workers only)

## Error Handling

All methods return promises that may reject. Always wrap in try-catch:

```typescript
try {
  const result = await vibekit.generateCode('...', 'code');
  if (result.exitCode !== 0) {
    console.error('Command failed:', result.stderr);
  }
} catch (error) {
  console.error('SDK error:', error.message);
} finally {
  // Always clean up
  await vibekit.kill();
}
```

## Environment Variables

Common environment variables:
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `GOOGLE_API_KEY` - Google API key
- `E2B_API_KEY` - E2B sandbox API key
- `DAYTONA_API_KEY` - Daytona API key
- `NORTHFLANK_API_KEY` - Northflank API key
- `GITHUB_TOKEN` - GitHub personal access token

**Note**: Cloudflare sandboxes don't require separate API keys - they use your Worker's environment and Durable Object bindings.

## TypeScript Support

Fully typed with TypeScript definitions included. Import types:

```typescript
import type {
  VibeKit,
  AgentResponse,
  AgentType,
  ModelProvider
} from '@vibe-kit/vibekit';

import type {
  E2BConfig
} from '@vibe-kit/e2b';

import type {
  DaytonaConfig
} from '@vibe-kit/daytona';

import type {
  NorthflankConfig
} from '@vibe-kit/northflank';

import type {
  CloudflareConfig
} from '@vibe-kit/cloudflare';
```
