# @vibe-kit/auth

Universal OAuth authentication library for AI providers' MAX subscriptions. Currently supports Claude AI with Gemini, Grok, and ChatGPT Max coming soon.

## Features

- **MAX Subscription Access**: Leverage your existing AI provider MAX subscriptions programmatically
- **Multiple Providers**: Claude AI (available), Gemini, Grok, ChatGPT Max (coming soon)
- **Environment-Specific Builds**: Separate Node.js and browser-compatible builds
- **OAuth 2.0 + PKCE**: Secure authentication with industry standards
- **Token Management**: Automatic token refresh and secure storage
- **Browser & Node.js**: Works in both web applications and server environments

## Installation

```bash
npm install @vibe-kit/auth
```

## Usage

### Node.js Environment

For Node.js applications (CLI tools, servers, etc.), use the Node.js-specific import:

```typescript
import { ClaudeAuth } from '@vibe-kit/auth/node';

// Start OAuth flow (opens browser automatically)
const token = await ClaudeAuth.authenticate();

// Check if authenticated
const isAuthenticated = await ClaudeAuth.isAuthenticated();

// Get valid token (auto-refresh if needed)
const accessToken = await ClaudeAuth.getValidToken();

// Verify authentication
const isValid = await ClaudeAuth.verify();

// Get authentication status
const status = await ClaudeAuth.getStatus();

// Logout
await ClaudeAuth.logout();
```

### Browser Environment

For browser/web applications, use the browser-safe import:

```typescript
import { ClaudeWebAuth, LocalStorageTokenStorage } from '@vibe-kit/auth/browser';
// OR use the default import which is browser-safe:
// import { ClaudeAuth, LocalStorageTokenStorage } from '@vibe-kit/auth';

// Create storage
const storage = new LocalStorageTokenStorage();
const auth = new ClaudeWebAuth(storage);

// Create authorization URL
const { url, state, codeVerifier } = ClaudeWebAuth.createAuthorizationUrl();

// Open URL in browser for user authentication
window.open(url, '_blank');

// After user authorizes and provides the code#state string:
const authCode = 'code123#state456'; // From user input
const token = await auth.authenticate(authCode, codeVerifier, state);

// Check authentication status
const isAuthenticated = await auth.isAuthenticated();

// Get valid token (auto-refresh if needed)
const accessToken = await auth.getValidToken();
```

### Using with AI Provider APIs

Once authenticated, use the access token with your MAX subscription to access AI APIs:

#### Claude AI (Available Now)

```typescript
import { ClaudeAuth } from '@vibe-kit/auth/node'; // For Node.js

// Authenticate and get token
let accessToken = await ClaudeAuth.getValidToken();
if (!accessToken) {
  await ClaudeAuth.authenticate();
  accessToken = await ClaudeAuth.getValidToken();
}

// Use with Claude Code CLI
// First, export the token as an environment variable:
// export CLAUDE_CODE_OAUTH_TOKEN=${accessToken}
// claude -p 'Hello, Claude!'
```

For browser applications:

```typescript
import { ClaudeWebAuth, LocalStorageTokenStorage } from '@vibe-kit/auth/browser';

const storage = new LocalStorageTokenStorage();
const auth = new ClaudeWebAuth(storage);

// Get token (assumes user is already authenticated)
const accessToken = await auth.getValidToken();
if (!accessToken) {
  // Handle authentication flow...
}

// Use with Claude Code CLI
// First, export the token as an environment variable:
// export CLAUDE_CODE_OAUTH_TOKEN=${accessToken}
// claude -p 'Hello!'
```

### Token Import/Export (Node.js only)

```typescript
import { ClaudeAuth } from '@vibe-kit/auth/node';

// Export token in different formats
const envToken = await ClaudeAuth.exportToken('env');
const jsonToken = await ClaudeAuth.exportToken('json');
const fullToken = await ClaudeAuth.exportToken('full');

// Import from various sources
await ClaudeAuth.importToken({ fromEnv: true });
await ClaudeAuth.importToken({ fromFile: './token.json' });
await ClaudeAuth.importToken({ refreshToken: 'your-refresh-token' });
```

## Types

```typescript
interface OAuthToken {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  created_at: number;
}
```

## Storage Options

- **MemoryTokenStorage**: In-memory storage for server-side use
- **LocalStorageTokenStorage**: Browser localStorage (client-side only)
- **CookieTokenStorage**: Cookie-based storage for SSR applications

## Security

- Tokens are stored with restricted file permissions (CLI)
- Automatic token refresh prevents expired token usage
- PKCE (Proof Key for Code Exchange) for secure OAuth flows
- State parameter validation prevents CSRF attacks

## Environment Compatibility

- **Node.js**: Use `@vibe-kit/auth/node` for full functionality including file system access and browser launching
- **Browser**: Use `@vibe-kit/auth/browser` or default import for browser-safe functionality
- **Universal**: The default import provides browser-safe functionality that works everywhere

## Why Use MAX Subscriptions?

Instead of paying per API call, leverage the subscriptions you already have:

- **Cost Effective**: Use your existing MAX subscriptions instead of pay-per-use APIs
- **Higher Limits**: MAX subscriptions often have higher rate limits and priority access
- **Latest Models**: Access to the newest and most capable models in each provider's lineup
- **Consistent Experience**: Same interface across different AI providers

## Usage with Other Libraries

The auth package can be used with any Claude AI client library or direct API calls:

```typescript
// Node.js applications
import { authenticate, getValidToken } from '@vibe-kit/auth/node';

// Browser applications  
import { ClaudeWebAuth } from '@vibe-kit/auth/browser';
```

#### Coming Soon

- **Gemini Max**: Access Google's most advanced AI models with your subscription
- **Grok Max**: Leverage xAI's premium models through your subscription  
- **ChatGPT Max**: Use OpenAI's latest models with your existing subscription

### With Official SDKs

```typescript
// Claude AI with Anthropic SDK
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAuth } from '@vibe-kit/auth/node';

const accessToken = await ClaudeAuth.getValidToken();
const anthropic = new Anthropic({
  apiKey: '', // Leave empty for OAuth
  authToken: accessToken, // Use your MAX subscription token
});

const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 1000,
  messages: [{ role: 'user', content: 'Hello!' }]
});
```