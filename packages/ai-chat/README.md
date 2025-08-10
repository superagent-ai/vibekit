# @vibe-kit/ai-chat

A production-ready, modular AI chat package for building chat interfaces with streaming support, authentication management, and customizable components.

## Features

- **AI SDK v5 Integration**: Built on top of Vercel AI SDK v5 for robust streaming support
- **Anthropic Claude Support**: Pre-configured for Claude models with easy extensibility
- **Authentication Management**: Handles both API keys and OAuth token detection
- **Modular Components**: Reusable React components with full TypeScript support
- **Streaming Responses**: Real-time streaming with proper error handling
- **Customizable UI**: Fully themed components using Radix UI and Tailwind CSS
- **Production Ready**: Comprehensive error handling, type safety, and documentation

## Installation

```bash
npm install @vibe-kit/ai-chat
```

## Quick Start

### 1. Set up Authentication

Add your Anthropic API key to your environment:

```bash
# .env
ANTHROPIC_API_KEY=your-api-key-here
```

### 2. Add API Route

Create an API route in your Next.js app:

```typescript
// app/api/chat/route.ts
import { handleChatRequest } from '@vibe-kit/ai-chat/server';
import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  return handleChatRequest(req);
}
```

### 3. Add Chat Interface

```tsx
// app/chat/page.tsx
import { ChatInterface } from '@vibe-kit/ai-chat';

export default function ChatPage() {
  return <ChatInterface />;
}
```

## Advanced Usage

### Custom Configuration

```tsx
import { ChatInterface } from '@vibe-kit/ai-chat';

export default function ChatPage() {
  return (
    <ChatInterface
      className="h-screen"
      models={[
        { name: 'Claude Sonnet', value: 'claude-sonnet-4-20250514' },
        { name: 'Claude Opus', value: 'claude-opus' }
      ]}
      defaultModel="claude-sonnet-4-20250514"
      showWebSearch={true}
      apiEndpoint="/api/custom-chat"
      welcomeMessage={{
        title: 'Welcome to My Assistant',
        subtitle: 'How can I help you today?',
        features: ['Custom feature 1', 'Custom feature 2']
      }}
      onError={(error) => console.error('Chat error:', error)}
    />
  );
}
```

### Using Hooks Directly

```tsx
import { useChat } from '@vibe-kit/ai-chat/hooks';

function CustomChat() {
  const {
    messages,
    sendMessage,
    status,
    error,
    getMessageContent,
    getMessageExtras
  } = useChat({
    model: 'claude-sonnet-4-20250514',
    temperature: 0.7,
    maxTokens: 4096,
    onError: (error) => console.error(error)
  });

  // Build your custom UI
  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          {getMessageContent(message)}
        </div>
      ))}
    </div>
  );
}
```

### Authentication Status

```tsx
import { useAuthStatus } from '@vibe-kit/ai-chat/hooks';

function AuthIndicator() {
  const { authStatus, loading } = useAuthStatus();
  
  if (loading) return <div>Checking auth...</div>;
  
  if (authStatus.needsApiKey) {
    return <div>Please configure your API key</div>;
  }
  
  return <div>Ready to chat!</div>;
}
```

### Server-Side Authentication

```typescript
import { AuthManager } from '@vibe-kit/ai-chat/server';

// In your API route
const authManager = AuthManager.getInstance();
const apiKey = authManager.getApiKey();

if (!apiKey) {
  const error = authManager.getErrorMessage();
  return new Response(error, { status: 401 });
}
```

## Components

### ChatInterface

Main chat interface component with built-in UI.

```tsx
interface ChatInterfaceProps {
  className?: string;
  models?: Array<{ name: string; value: string }>;
  defaultModel?: string;
  showWebSearch?: boolean;
  onError?: (error: Error) => void;
  apiEndpoint?: string;
  welcomeMessage?: {
    title?: string;
    subtitle?: string;
    features?: string[];
  };
}
```

### Individual Components

All UI components are exported for custom implementations:

```tsx
import {
  Conversation,
  Message,
  PromptInput,
  Response,
  Reasoning,
  Sources,
  Loader
} from '@vibe-kit/ai-chat/components';
```

## API Reference

### Hooks

#### `useChat(options: ChatOptions)`

Main hook for chat functionality.

```typescript
interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  showMCPTools?: boolean;
  webSearch?: boolean;
  onError?: (error: Error) => void;
  onFinish?: (message: Message) => void;
  apiEndpoint?: string;
}
```

#### `useAuthStatus()`

Hook for monitoring authentication status.

```typescript
interface AuthStatus {
  authMethod: string;
  hasApiKey: boolean;
  isConfigured: boolean;
  claudeCodeMaxUser?: string;
  needsApiKey: boolean;
}
```

### Server Functions

#### `handleChatRequest(req: NextRequest)`

Handles chat API requests with streaming support.

#### `handleStatusRequest(req: NextRequest)`

Returns authentication status for the client.

## Environment Variables

```bash
# Required for API functionality
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Custom configurations
CHAT_MAX_TOKENS=4096
CHAT_TEMPERATURE=0.7
```

## Development

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

### Type Checking

```bash
npm run type-check
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.