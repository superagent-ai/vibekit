---
title: 'Modal'
description: 'Configure VibeKit with Modal'
---

Modal is a serverless computing platform that provides a sandboxes product for secure code execution.

## Installation

First, install the Modal provider package:

```bash
npm install @vibe-kit/modal
```

## How to use

To use Modal with VibeKit, you must first setup your modal profile by following https://modal.com/docs/reference/cli/setup. You may need to run `pip install modal` for the Python SDK beforehand, whose setup with `modal setup` also enables the JS SDK.

### Using the provider directly

```typescript
import { VibeKit } from "@vibe-kit/sdk";
import { createModalProvider } from "@vibe-kit/modal";

const modalProvider = createModalProvider({
  image: "vibekit-claude", // Optional custom template
});

const vibeKit = new VibeKit()
  .withAgent({
    type: "claude",
    provider: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: "claude-sonnet-4-20250514",
  })
  .withSandbox(modalProvider);

// Generate code
const result = await vibeKit.generateCode({ 
  prompt: "Create a simple web server", 
  mode: "ask" 
});

// Get host URL (if applicable)
const host = await vibeKit.getHost(3000);

// Clean up
await vibeKit.kill();
```

### Using configuration object

```typescript
import { VibeKit, VibeConfig } from "@vibe-kit/sdk";

const config: VibeConfig = {
  ...,
  environment: {
    modal: {
      // Optional custom image you want to use 
      image: "super-codex" 
    },
  },
};
```

