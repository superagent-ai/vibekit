# @vibe-kit/flyio

Fly.io Sprites sandbox provider for VibeKit. It runs supported coding agents in
persistent, isolated Sprites using the official `@fly/sprites` SDK.

## Installation

```bash
npm install @vibe-kit/flyio
```

The provider requires Node.js 24 or later, matching the Sprites JavaScript SDK.

## Usage

```typescript
import { VibeKit } from "@vibe-kit/sdk";
import { createFlyIOProvider } from "@vibe-kit/flyio";

const flyioProvider = createFlyIOProvider({
  token: process.env.SPRITE_TOKEN!,
});

const vibeKit = new VibeKit()
  .withAgent({
    type: "codex",
    provider: "openai",
    apiKey: process.env.OPENAI_API_KEY!,
    model: "gpt-5",
  })
  .withSandbox(flyioProvider)
  .withWorkingDirectory("/home/sprite/project");

const result = await vibeKit.executeCommand("codex --version");
console.log(result);

await vibeKit.kill();
```

`createFlyIOProvider` accepts:

- `token` (required): a Fly.io Sprites API token.
- `baseURL`: an alternative Sprites API endpoint.
- `runtime`: `"dev"` (the default) or `"default"`. The dev runtime includes
  the supported coding-agent CLIs.
- `urlAuth`: `"sprite"` (the authenticated default) or `"public"`.
- `waitForCapacity`: wait for organization capacity during creation.
- `labels`: additional labels for created Sprites. The provider always adds
  the `vibekit` label.

## Lifecycle and URLs

`pause()` is intentionally a no-op because Sprites suspend automatically when
idle. `resume()` reconnects to an existing Sprite by name, and `kill()` deletes
the Sprite.

Every Sprite has one HTTPS URL routed to port 8080 by default, so
`getHost(8080)` returns that URL. Configure a Sprite service when an application
must route the URL to another HTTP port. URLs require Sprite authentication by
default; set `urlAuth: "public"` only when the service is safe to expose.
