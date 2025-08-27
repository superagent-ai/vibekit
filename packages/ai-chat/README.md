# @vibe-kit/ai-chat

A comprehensive, production-ready AI chat package for building sophisticated chat interfaces with streaming support, MCP integration, and extensive customization options. Designed for modern React applications with TypeScript-first architecture.

## Features

### Core Functionality
- 🤖 **AI SDK v5 Integration**: Built on Vercel AI SDK v5 for robust streaming support
- 🎯 **Multi-Model Support**: Pre-configured for Claude models with extensible architecture
- 🔐 **Smart Authentication**: Handles API keys, OAuth tokens, and Claude Code integration
- 📡 **Real-time Streaming**: Efficient message streaming with proper error handling
- 🛠️ **MCP Integration**: Model Context Protocol support for enhanced AI capabilities
- 🌐 **Web Search**: Optional web search integration for up-to-date information

### UI & Developer Experience
- 🎨 **Beautiful Components**: Fully themed with Radix UI and Tailwind CSS
- 📱 **Responsive Design**: Mobile-first responsive chat interface
- ⚛️ **React 19 Ready**: Optimized for latest React features and patterns
- 🔧 **Modular Architecture**: Use individual components or complete interface
- 📝 **TypeScript First**: Comprehensive type definitions throughout
- 🧪 **Testing Ready**: Components designed for easy testing

### Advanced Features
- 🏷️ **Project-Scoped Chat**: Associate conversations with specific projects
- 🔍 **Rich Message Types**: Support for text, images, code blocks, and more
- 💭 **Reasoning Display**: Show AI reasoning process when available
- 📊 **Source Attribution**: Display sources for web search results
- 🎛️ **Customizable Controls**: Temperature, max tokens, and model selection
- 📋 **Message Actions**: Copy, edit, and manage conversation history

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

### Project-Scoped Chat

```tsx
import { ChatInterface } from '@vibe-kit/ai-chat';

export default function ProjectChatPage({ params }: { params: { projectId: string } }) {
  return (
    <ChatInterface
      projectId={params.projectId}
      projectRoot="/path/to/project"
      projectName="My Project"
      showMCPTools={true}
      mcpServerFilter={['vibekit', 'filesystem']} // Only enable specific MCP servers
      className="h-screen"
    />
  );
}
```

### Custom Configuration

```tsx
import { ChatInterface } from '@vibe-kit/ai-chat';

export default function ChatPage() {
  return (
    <ChatInterface
      className="h-screen"
      models={[
        { name: 'Claude Sonnet', value: 'claude-sonnet-4-20250514' },
        { name: 'Claude Opus', value: 'claude-opus-4-1-20250805' },
        { name: 'Claude Haiku', value: 'claude-haiku' }
      ]}
      defaultModel="claude-sonnet-4-20250514"
      showWebSearch={true}
      showMCPTools={false}
      apiEndpoint="/api/custom-chat"
      welcomeMessage={{
        title: 'Welcome to My Assistant',
        subtitle: 'How can I help you today?',
        features: [
          'Web search integration',
          'Code analysis and generation', 
          'Project-aware conversations'
        ]
      }}
      onError={(error) => {
        console.error('Chat error:', error);
        // Custom error handling
      }}
      onFinish={(message) => {
        console.log('Message completed:', message);
        // Custom completion handling
      }}
    />
  );
}
```

### Using Hooks Directly

Build custom chat interfaces using the underlying hooks:

```tsx
import { useChat } from '@vibe-kit/ai-chat/hooks';

function CustomChat() {
  const {
    messages,
    sendMessage,
    status,
    error,
    getMessageContent,
    getMessageExtras,
    currentState
  } = useChat({
    model: 'claude-sonnet-4-20250514',
    temperature: 0.7,
    maxTokens: 4096,
    projectId: 'my-project',
    showMCPTools: true,
    webSearch: true,
    onError: (error) => console.error('Chat error:', error),
    onFinish: (message) => {
      console.log('Message finished:', message);
      // Save to database, trigger notifications, etc.
    }
  });

  const handleSend = async (content: string) => {
    try {
      await sendMessage(content);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messages.map(message => (
          <div key={message.id} className={`message ${message.role}`}>
            <div className="content">
              {getMessageContent(message)}
            </div>
            
            {/* Display extras like sources, reasoning */}
            {getMessageExtras(message).sources && (
              <div className="sources">
                {getMessageExtras(message).sources.map((source, i) => (
                  <a key={i} href={source.url}>{source.title}</a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <form onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.querySelector('input') as HTMLInputElement;
          handleSend(input.value);
          input.value = '';
        }}>
          <input
            type="text"
            placeholder="Ask anything..."
            disabled={status === 'loading'}
            className="w-full p-2 border rounded"
          />
          <button 
            type="submit" 
            disabled={status === 'loading'}
            className="mt-2 px-4 py-2 bg-blue-500 text-white rounded"
          >
            {status === 'loading' ? 'Sending...' : 'Send'}
          </button>
        </form>
        
        {error && (
          <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">
            Error: {error.message}
          </div>
        )}
      </div>
    </div>
  );
}
```

### Advanced Hook Usage

```tsx
import { useChat, useAuthStatus } from '@vibe-kit/ai-chat/hooks';
import { useEffect, useState } from 'react';

function AdvancedChat() {
  const { authStatus, loading: authLoading } = useAuthStatus();
  const [chatConfig, setChatConfig] = useState({
    model: 'claude-sonnet-4-20250514',
    temperature: 0.7,
    maxTokens: 4096,
  });

  const chat = useChat({
    ...chatConfig,
    getCurrentState: () => ({
      model: chatConfig.model,
      webSearch: true,
      mcpTools: true
    }),
    onError: (error) => {
      // Custom error handling based on error type
      if (error.message.includes('rate limit')) {
        console.log('Rate limited, backing off...');
      }
    }
  });

  // Show auth status
  if (authLoading) {
    return <div>Checking authentication...</div>;
  }

  if (authStatus.needsApiKey) {
    return <div>Please configure your API key</div>;
  }

  return (
    <div>
      {/* Model selector */}
      <div className="controls mb-4">
        <select 
          value={chatConfig.model}
          onChange={(e) => setChatConfig(prev => ({ ...prev, model: e.target.value }))}
        >
          <option value="claude-sonnet-4-20250514">Claude Sonnet</option>
          <option value="claude-opus-4-1-20250805">Claude Opus</option>
          <option value="claude-haiku">Claude Haiku</option>
        </select>
        
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={chatConfig.temperature}
          onChange={(e) => setChatConfig(prev => ({ 
            ...prev, 
            temperature: parseFloat(e.target.value) 
          }))}
        />
        <span>Temperature: {chatConfig.temperature}</span>
      </div>

      {/* Chat interface */}
      <CustomChatUI {...chat} />
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

Main hook for chat functionality with comprehensive configuration options.

```typescript
interface ChatOptions {
  /** AI model to use (defaults to claude-sonnet-4-20250514) */
  model?: string;
  /** Temperature for response generation (0-1, defaults to 0.7) */
  temperature?: number;
  /** Maximum tokens in response (defaults to 4096) */
  maxTokens?: number;
  /** Enable MCP tools (defaults to false) */
  showMCPTools?: boolean;
  /** Enable web search (defaults to false) */
  webSearch?: boolean;
  /** Error handler callback */
  onError?: (error: Error) => void;
  /** Completion handler callback */
  onFinish?: (message: any) => void;
  /** Custom API endpoint (defaults to /api/chat) */
  apiEndpoint?: string;
  /** Function to get current state (for handling state updates) */
  getCurrentState?: () => { model: string; webSearch: boolean; mcpTools: boolean };
  /** Project ID for project-specific chat */
  projectId?: string;
  /** Project root directory for MCP tool configuration */
  projectRoot?: string;
  /** Project name for display */
  projectName?: string;
  /** Filter for MCP servers - only these server IDs will be enabled */
  mcpServerFilter?: string[];
}
```

**Returns:**

```typescript
interface UseChatReturn {
  messages: Message[];
  sendMessage: (content: string) => Promise<void>;
  status: 'idle' | 'loading' | 'error';
  error: Error | null;
  getMessageContent: (message: Message) => React.ReactNode;
  getMessageExtras: (message: Message) => {
    sources?: Array<{ url: string; title: string }>;
    reasoning?: string;
    tools?: Array<{ name: string; result: any }>;
  };
  currentState: {
    model: string;
    webSearch: boolean;
    mcpTools: boolean;
  };
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

### Component Architecture

All UI components are built with modularity and customization in mind:

```tsx
import {
  // Main interface
  ChatInterface,
  
  // Individual AI elements
  Conversation,
  Message,
  Response,
  PromptInput,
  Reasoning,
  Sources,
  Tool,
  Loader,
  
  // UI primitives
  Button,
  Avatar,
  ScrollArea,
  Select,
  Textarea,
  Tooltip
} from '@vibe-kit/ai-chat/components';
```

## Configuration & Environment

### Environment Variables

```bash
# Required for API functionality
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Custom configurations
CHAT_MAX_TOKENS=4096
CHAT_TEMPERATURE=0.7
CHAT_DEFAULT_MODEL=claude-sonnet-4-20250514

# MCP Integration (optional)
MCP_CONFIG_DIR=.vibekit
MCP_ENABLED=true

# Web search (optional)
WEBSEARCH_ENABLED=true
WEBSEARCH_MAX_RESULTS=5

# Project context (optional)
PROJECT_ROOT=/path/to/project
PROJECT_ID=my-project
```

### Next.js Configuration

For optimal performance, configure your Next.js app:

```javascript
// next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['@vibe-kit/ai-chat']
  },
  // Enable streaming for AI responses
  headers: async () => [
    {
      source: '/api/chat',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'POST, OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type' }
      ]
    }
  ]
};

module.exports = nextConfig;
```

## Advanced Integration

### Custom Provider Integration

Extend the package to work with other AI providers:

```typescript
// lib/custom-provider.ts
import { createAnthropic } from '@ai-sdk/anthropic';

export function createCustomProvider(apiKey: string, config: any) {
  return createAnthropic({
    apiKey,
    baseURL: config.baseURL,
    // Custom provider configuration
  });
}

// Use in your API route
export async function POST(req: NextRequest) {
  const customProvider = createCustomProvider(process.env.CUSTOM_API_KEY!, {
    baseURL: 'https://api.custom-provider.com'
  });
  
  return handleChatRequest(req, {
    provider: customProvider,
    model: 'custom-model-name'
  });
}
```

### Database Integration

Save conversations to your database:

```typescript
// lib/chat-storage.ts
import { Message } from '@vibe-kit/ai-chat';

export async function saveChatMessage(
  projectId: string,
  message: Message
) {
  // Save to your database
  await db.chatMessages.create({
    data: {
      projectId,
      role: message.role,
      content: message.content,
      metadata: message.metadata
    }
  });
}

export async function loadChatHistory(projectId: string): Promise<Message[]> {
  const messages = await db.chatMessages.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' }
  });
  
  return messages.map(msg => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    metadata: msg.metadata
  }));
}
```

### Middleware Integration

Add custom middleware for logging, rate limiting, etc:

```typescript
// middleware/chat-middleware.ts
import { NextRequest } from 'next/server';

export async function chatMiddleware(req: NextRequest) {
  // Rate limiting
  const userId = getUserId(req);
  const rateLimitOk = await checkRateLimit(userId);
  
  if (!rateLimitOk) {
    return new Response('Rate limited', { status: 429 });
  }

  // Usage tracking
  await trackUsage(userId, {
    model: req.headers.get('x-chat-model'),
    timestamp: new Date()
  });

  return null; // Continue to chat handler
}
```

## Styling & Theming

### CSS Variables

Customize the appearance using CSS variables:

```css
/* globals.css */
:root {
  /* Chat interface colors */
  --chat-bg: #ffffff;
  --chat-border: #e5e7eb;
  --message-user-bg: #3b82f6;
  --message-assistant-bg: #f9fafb;
  --message-text: #111827;
  
  /* Input styling */
  --input-bg: #ffffff;
  --input-border: #d1d5db;
  --input-focus: #3b82f6;
  
  /* Component spacing */
  --chat-padding: 1rem;
  --message-spacing: 0.75rem;
}

[data-theme='dark'] {
  --chat-bg: #1f2937;
  --chat-border: #374151;
  --message-user-bg: #1d4ed8;
  --message-assistant-bg: #374151;
  --message-text: #f9fafb;
  
  --input-bg: #374151;
  --input-border: #4b5563;
  --input-focus: #60a5fa;
}
```

### Tailwind Configuration

Extend Tailwind for consistent theming:

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        chat: {
          bg: 'var(--chat-bg)',
          border: 'var(--chat-border)',
          'message-user': 'var(--message-user-bg)',
          'message-assistant': 'var(--message-assistant-bg)',
          text: 'var(--message-text)'
        }
      }
    }
  }
};
```

## Performance Optimization

### Code Splitting

Load components on demand:

```tsx
import dynamic from 'next/dynamic';

const ChatInterface = dynamic(
  () => import('@vibe-kit/ai-chat').then(mod => ({ default: mod.ChatInterface })),
  {
    loading: () => <div>Loading chat...</div>,
    ssr: false
  }
);
```

### Message Virtualization

For long conversations, implement virtualization:

```tsx
import { FixedSizeList as List } from 'react-window';

function VirtualizedChat({ messages }: { messages: Message[] }) {
  const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => (
    <div style={style}>
      <Message message={messages[index]} />
    </div>
  );

  return (
    <List
      height={600}
      itemCount={messages.length}
      itemSize={100}
      itemData={messages}
    >
      {Row}
    </List>
  );
}
```

## Testing

### Component Testing

```tsx
// __tests__/ChatInterface.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatInterface } from '@vibe-kit/ai-chat';

// Mock the chat API
jest.mock('@vibe-kit/ai-chat/hooks', () => ({
  useChat: () => ({
    messages: [],
    sendMessage: jest.fn(),
    status: 'idle',
    error: null
  }),
  useAuthStatus: () => ({
    authStatus: { isConfigured: true, needsApiKey: false },
    loading: false
  })
}));

describe('ChatInterface', () => {
  test('renders chat interface', () => {
    render(<ChatInterface />);
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeInTheDocument();
  });

  test('sends message when form is submitted', async () => {
    const mockSendMessage = jest.fn();
    
    render(<ChatInterface />);
    
    const input = screen.getByRole('textbox');
    const submitButton = screen.getByRole('button', { name: /send/i });
    
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(mockSendMessage).toHaveBeenCalledWith('Hello');
    });
  });
});
```

### Hook Testing

```tsx
// __tests__/useChat.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useChat } from '@vibe-kit/ai-chat/hooks';

describe('useChat', () => {
  test('initializes with empty messages', () => {
    const { result } = renderHook(() => useChat());
    
    expect(result.current.messages).toEqual([]);
    expect(result.current.status).toBe('idle');
  });

  test('handles error states', async () => {
    const mockOnError = jest.fn();
    const { result } = renderHook(() => useChat({
      onError: mockOnError
    }));

    await act(async () => {
      // Trigger error condition
      await result.current.sendMessage('test');
    });

    expect(mockOnError).toHaveBeenCalled();
  });
});
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

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Dependencies

### Core Dependencies
- `@ai-sdk/anthropic`: ^2.0.5 - Anthropic AI integration
- `@ai-sdk/react`: ^2.0.19 - React hooks for AI SDK
- `ai`: ^5.0.19 - Vercel AI SDK core
- `@vibe-kit/logger`: ^0.0.1 - Structured logging

### UI Dependencies
- `@radix-ui/react-*`: UI primitives
- `lucide-react`: ^0.536.0 - Icon library
- `react-markdown`: ^10.1.0 - Markdown rendering
- `react-syntax-highlighter`: ^15.6.1 - Code highlighting

### Peer Dependencies
- `next`: >=14.0.0 - Next.js framework
- `react`: >=18.0.0 - React library
- `react-dom`: >=18.0.0 - React DOM

## Changelog

### 0.0.1
- Initial release with Claude integration
- Full-featured chat interface
- Streaming response support
- Authentication management
- MCP tool integration
- Web search capabilities
- TypeScript-first architecture

## Contributing

We welcome contributions to improve the ai-chat package!

### Development Process
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run the full test suite
5. Update documentation
6. Submit a pull request

### Guidelines
- Follow TypeScript best practices
- Add comprehensive tests for new features
- Update documentation for API changes
- Maintain compatibility with existing components
- Use conventional commit messages

## Support & Community

- **Issues**: [GitHub Issues](https://github.com/superagent-ai/vibekit/issues)
- **Documentation**: [VibeKit Docs](https://docs.vibekit.sh)
- **Community**: [Discord](https://discord.gg/vibekit)

## License

MIT - Part of the VibeKit project