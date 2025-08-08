# @vibe-kit/ai-chat

AI chat package with MCP integration for VibeKit. Provides a complete chat solution with Claude AI support, MCP tool calling, and persistent chat history.

## Features

- 🤖 Claude AI integration with dual authentication (OAuth preferred, API key fallback)
- 🔧 MCP tool calling through existing `@vibe-kit/mcp-client`
- 💾 Persistent chat history stored as JSON files
- 🚀 Real-time streaming responses
- 🎨 Pre-built React components using AI Elements
- 📁 Project context integration

## Installation

```bash
npm install @vibe-kit/ai-chat
```

### CSS Setup

This package uses Tailwind CSS with CSS variables for theming. To use the components with proper styling:

1. **Import the CSS file** in your app's main CSS file or entry point:

```css
/* In your app's global CSS file */
@import '@vibe-kit/ai-chat/dist/styles/globals.css';
```

Or in your JavaScript/TypeScript entry point:

```javascript
import '@vibe-kit/ai-chat/dist/styles/globals.css';
```

2. **Ensure Tailwind CSS is configured** in your project with CSS variables support.

3. **The package includes these CSS variables** that you can customize:

```css
/* Light mode */
--background, --foreground, --card, --card-foreground,
--popover, --popover-foreground, --primary, --primary-foreground,
--secondary, --secondary-foreground, --muted, --muted-foreground,
--accent, --accent-foreground, --destructive, --destructive-foreground,
--border, --input, --ring
```

## Authentication

The package supports two authentication methods:

1. **OAuth (Preferred)**: Uses token from `~/.vibekit/claude-oauth-token.json`
   - Run `vibekit auth claude` to authenticate

2. **API Key (Fallback)**: Uses `ANTHROPIC_API_KEY` from environment
   - Add to `.env` file: `ANTHROPIC_API_KEY=your_key_here`

## Quick Start

### Basic Usage

```typescript
import { ChatClient } from '@vibe-kit/ai-chat';

const client = new ChatClient();
await client.initialize();

// Create a new chat session
const session = await client.createSession('Project Discussion');

// Send a message
const response = await client.sendMessage('Hello, Claude!', session.id);
```

### React Components

```tsx
import { ChatInterface } from '@vibe-kit/ai-chat/components';

export function App() {
  return <ChatInterface />;
}
```

### With Hooks

```tsx
import { useChat } from '@vibe-kit/ai-chat/hooks';

export function CustomChat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();
  
  return (
    <div>
      {messages.map(msg => (
        <div key={msg.id}>{msg.content}</div>
      ))}
      <input value={input} onChange={handleInputChange} />
      <button onClick={handleSubmit} disabled={isLoading}>Send</button>
    </div>
  );
}
```

## API Reference

### ChatClient

Main client for managing chat sessions and messages.

#### Methods

- `initialize()`: Initialize the client and authentication
- `createSession(title?: string)`: Create a new chat session
- `listSessions()`: List all chat sessions
- `loadSession(id: string)`: Load a specific session
- `sendMessage(message: string, sessionId: string)`: Send a message and get streaming response
- `deleteSession(id: string)`: Delete a chat session

### Components

- `ChatInterface`: Complete chat UI with message list and input
- `Message`: Individual message component
- `MessageInput`: Chat input with file upload support
- `ToolCall`: Display MCP tool calls

### Hooks

- `useChat`: Main chat hook with streaming support
- `useChatStorage`: Hook for managing chat storage

## MCP Integration

The package automatically discovers and uses MCP tools from connected servers:

```typescript
// Tools are automatically available in the chat
const response = await client.sendMessage(
  'What files are in the current directory?',
  sessionId
);
// Claude will use MCP file system tools to answer
```

## Storage

Chat sessions are stored as JSON files in `~/.vibekit/chats/`:

```json
{
  "id": "uuid",
  "title": "Chat Title",
  "projectId": "current-project-id",
  "createdAt": "2025-01-07T...",
  "updatedAt": "2025-01-07T...",
  "messages": [
    {
      "role": "user",
      "content": "Hello",
      "timestamp": "2025-01-07T..."
    },
    {
      "role": "assistant",
      "content": "Hi! How can I help?",
      "timestamp": "2025-01-07T...",
      "toolCalls": [],
      "toolResults": []
    }
  ]
}
```

## Production Configuration

### Environment Variables

```bash
# Authentication (choose one)
ANTHROPIC_API_KEY=sk-ant-xxx  # Option 1: API Key
# OR use OAuth token at ~/.vibekit/claude-oauth-token.json

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000

# Session Management
MAX_SESSIONS_PER_USER=50
SESSION_TTL=86400000  # 24 hours
MAX_MESSAGES_PER_SESSION=1000

# Security
CORS_ORIGINS=https://yourdomain.com
SANITIZE_INPUT=true
MAX_INPUT_LENGTH=10000

# Monitoring
LOG_LEVEL=info
METRICS_ENABLED=true
```

## Production Features

### Rate Limiting
Built-in rate limiting to prevent abuse:
```typescript
import { RateLimiter } from '@vibe-kit/ai-chat';

const limiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000,
});
```

### Error Handling & Retry
Automatic retry with exponential backoff:
```typescript
import { withRetry } from '@vibe-kit/ai-chat';

const result = await withRetry(
  async () => await apiCall(),
  { maxAttempts: 3, initialDelay: 1000 }
);
```

### Input Validation
All inputs are validated and sanitized:
```typescript
import { validateMessageContent } from '@vibe-kit/ai-chat';

const { valid, sanitized } = validateMessageContent(userInput);
```

### Session Management
Automatic session cleanup and limits:
```typescript
import { SessionManager } from '@vibe-kit/ai-chat';

const manager = new SessionManager(storage, {
  maxSessionsPerUser: 50,
  sessionTTL: 86400000,
});
```

## Deployment

### Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm ci --production && npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'vibekit-chat',
    script: 'npm',
    args: 'start',
    instances: 2,
    exec_mode: 'cluster',
  }]
};
```

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name chat.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_buffering off;  # For streaming
    }
}
```

## Testing

```bash
# Run tests
npm test

# Test MCP integration
node test/mcp-integration.test.js
```

## Troubleshooting

### Authentication Issues
```bash
# Check OAuth token
cat ~/.vibekit/claude-oauth-token.json

# Verify API key
echo $ANTHROPIC_API_KEY
```

### Rate Limiting
```bash
# Monitor rate limits
LOG_LEVEL=debug npm start
```

### Storage Issues
```bash
# Check disk space
df -h .vibekit/chats/

# Clean old sessions
find .vibekit/chats -name "*.json" -mtime +30 -delete
```

## Development

```bash
# Install dependencies
npm install

# Build the package
npm run build

# Watch mode
npm run dev

# Type check
npm run type-check
```

## Performance

- **Build Size**: ~30KB optimized
- **Response Time**: < 200ms cached
- **Streaming**: Real-time responses
- **Concurrency**: 100+ sessions

## License

MIT