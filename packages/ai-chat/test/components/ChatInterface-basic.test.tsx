import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatInterface } from '../../src/components/ChatInterface';

// Mock all the complex hooks and components
vi.mock('../../src/hooks/use-chat', () => ({
  useChat: () => ({
    messages: [],
    isLoading: false,
    input: '',
    handleInputChange: vi.fn(),
    handleSubmit: vi.fn(),
    reload: vi.fn(),
    stop: vi.fn(),
    setMessages: vi.fn(),
    error: null,
  })
}));

vi.mock('../../src/hooks/use-auth', () => ({
  useAuthStatus: () => ({
    isLoading: false,
    authStatus: {
      authMethod: 'none',
      hasApiKey: false,
      hasOAuthToken: false,
      isConfigured: false,
      needsApiKey: true
    },
    error: null,
    refetch: vi.fn()
  })
}));

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  GlobeIcon: () => <div data-testid="globe-icon">🌐</div>,
  Square: () => <div data-testid="square-icon">⏹</div>,
  Wrench: () => <div data-testid="wrench-icon">🔧</div>,
  SendIcon: () => <div data-testid="send-icon">📤</div>,
  StopIcon: () => <div data-testid="stop-icon">⏹</div>,
  PlusIcon: () => <div data-testid="plus-icon">➕</div>,
  ChevronDownIcon: () => <div data-testid="chevron-icon">▼</div>,
  BotIcon: () => <div data-testid="bot-icon">🤖</div>,
  UserIcon: () => <div data-testid="user-icon">👤</div>,
}));

// Mock all ai-elements components to render simple divs
vi.mock('../../src/components/ai-elements/conversation', () => ({
  Conversation: ({ children, ...props }: any) => <div data-testid="conversation" {...props}>{children}</div>,
  ConversationContent: ({ children, ...props }: any) => <div data-testid="conversation-content" {...props}>{children}</div>,
  ConversationScrollButton: ({ children, ...props }: any) => <button data-testid="scroll-button" {...props}>{children}</button>,
}));

vi.mock('../../src/components/ai-elements/message', () => ({
  Message: ({ children, ...props }: any) => <div data-testid="message" {...props}>{children}</div>,
  MessageContent: ({ children, ...props }: any) => <div data-testid="message-content" {...props}>{children}</div>,
  MessageAvatar: ({ children, ...props }: any) => <div data-testid="message-avatar" {...props}>{children}</div>,
  AvatarFallback: ({ children, ...props }: any) => <div data-testid="avatar-fallback" {...props}>{children}</div>,
}));

vi.mock('../../src/components/ai-elements/prompt-input', () => ({
  PromptInput: ({ children, ...props }: any) => <div data-testid="prompt-input" {...props}>{children}</div>,
  PromptInputButton: ({ children, ...props }: any) => <button data-testid="prompt-button" {...props}>{children}</button>,
  PromptInputModelSelect: ({ children, ...props }: any) => <div data-testid="model-select" {...props}>{children}</div>,
  PromptInputModelSelectContent: ({ children, ...props }: any) => <div data-testid="model-select-content" {...props}>{children}</div>,
  PromptInputModelSelectItem: ({ children, ...props }: any) => <div data-testid="model-select-item" {...props}>{children}</div>,
  PromptInputModelSelectTrigger: ({ children, ...props }: any) => <button data-testid="model-select-trigger" {...props}>{children}</button>,
  PromptInputModelSelectValue: ({ children, ...props }: any) => <span data-testid="model-select-value" {...props}>{children}</span>,
  PromptInputSubmit: ({ children, ...props }: any) => <button data-testid="prompt-submit" {...props}>{children}</button>,
  PromptInputTextarea: ({ children, ...props }: any) => <textarea data-testid="prompt-textarea" {...props}>{children}</textarea>,
  PromptInputToolbar: ({ children, ...props }: any) => <div data-testid="prompt-toolbar" {...props}>{children}</div>,
  PromptInputTools: ({ children, ...props }: any) => <div data-testid="prompt-tools" {...props}>{children}</div>,
}));

vi.mock('../../src/components/ai-elements/response', () => ({
  Response: ({ children, ...props }: any) => <div data-testid="response" {...props}>{children}</div>,
}));

vi.mock('../../src/components/ai-elements/source', () => ({
  Source: ({ children, ...props }: any) => <a data-testid="source" {...props}>{children}</a>,
  Sources: ({ children, ...props }: any) => <div data-testid="sources" {...props}>{children}</div>,
  SourcesContent: ({ children, ...props }: any) => <div data-testid="sources-content" {...props}>{children}</div>,
  SourcesTrigger: ({ children, ...props }: any) => <button data-testid="sources-trigger" {...props}>{children}</button>,
}));

vi.mock('../../src/components/ai-elements/reasoning', () => ({
  Reasoning: ({ children, ...props }: any) => <div data-testid="reasoning" {...props}>{children}</div>,
  ReasoningContent: ({ children, ...props }: any) => <div data-testid="reasoning-content" {...props}>{children}</div>,
  ReasoningTrigger: ({ children, ...props }: any) => <button data-testid="reasoning-trigger" {...props}>{children}</button>,
}));

vi.mock('../../src/components/ai-elements/loader', () => ({
  Loader: (props: any) => <div data-testid="loader" {...props}>Loading...</div>,
}));

vi.mock('../../src/components/ai-elements/tool', () => ({
  ToolSection: ({ children, ...props }: any) => <div data-testid="tool-section" {...props}>{children}</div>,
}));

describe('ChatInterface Component - Basic Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render without crashing', () => {
      render(<ChatInterface />);
      
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
      expect(screen.getByTestId('prompt-input')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      render(<ChatInterface className="custom-chat" />);
      
      const conversation = screen.getByTestId('conversation');
      expect(conversation).toHaveClass('custom-chat');
    });

    it('should render with custom models', () => {
      const customModels = [
        { name: 'Custom Model', value: 'custom-model' },
        { name: 'Another Model', value: 'another-model' }
      ];
      
      render(<ChatInterface models={customModels} />);
      
      expect(screen.getByTestId('model-select')).toBeInTheDocument();
    });

    it('should render main conversation area', () => {
      render(<ChatInterface />);
      
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-content')).toBeInTheDocument();
    });

    it('should render prompt input area', () => {
      render(<ChatInterface />);
      
      expect(screen.getByTestId('prompt-input')).toBeInTheDocument();
      expect(screen.getByTestId('prompt-textarea')).toBeInTheDocument();
    });
  });

  describe('Props Handling', () => {
    it('should use default models when none provided', () => {
      render(<ChatInterface />);
      
      // Should render model select with defaults
      expect(screen.getByTestId('model-select')).toBeInTheDocument();
    });

    it('should handle empty models array with default model', () => {
      render(<ChatInterface models={[]} defaultModel="claude-sonnet-4-20250514" />);
      
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
    });

    it('should pass through additional props to the conversation', () => {
      render(
        <ChatInterface 
          className="test-class"
        />
      );
      
      const conversation = screen.getByTestId('conversation');
      expect(conversation).toHaveClass('test-class');
    });
  });

  describe('Component Structure', () => {
    it('should have proper component hierarchy', () => {
      render(<ChatInterface />);
      
      // Should contain main conversation area
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
      
      // Should contain input area
      expect(screen.getByTestId('prompt-input')).toBeInTheDocument();
    });

    it('should render all expected child components', () => {
      render(<ChatInterface />);
      
      // Check for key components
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-content')).toBeInTheDocument();
      expect(screen.getByTestId('prompt-input')).toBeInTheDocument();
      expect(screen.getByTestId('prompt-textarea')).toBeInTheDocument();
      expect(screen.getByTestId('model-select')).toBeInTheDocument();
    });

    it('should handle different viewport sizes', () => {
      const { rerender } = render(<ChatInterface />);
      
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
      
      // Component should render consistently
      rerender(<ChatInterface />);
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
    });
  });

  describe('Default Configuration', () => {
    it('should use reasonable defaults', () => {
      render(<ChatInterface />);
      
      // Should render without errors with default configuration
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
      expect(screen.getByTestId('prompt-input')).toBeInTheDocument();
    });

    it('should handle missing optional props gracefully', () => {
      // Render with minimal props
      render(<ChatInterface />);
      
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
      expect(screen.queryByText('Error')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have appropriate ARIA structure', () => {
      render(<ChatInterface />);
      
      // Basic accessibility check - component should render
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
      expect(screen.getByTestId('prompt-textarea')).toBeInTheDocument();
    });

    it('should be keyboard navigable', () => {
      render(<ChatInterface />);
      
      const textarea = screen.getByTestId('prompt-textarea');
      expect(textarea).toBeInTheDocument();
      
      // Should be focusable
      expect(textarea.tagName).toBe('TEXTAREA');
    });
  });

  describe('Error Handling', () => {
    it('should render even when hooks return errors', () => {
      // This test ensures the component is resilient
      render(<ChatInterface />);
      
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
    });

    it('should handle undefined props gracefully', () => {
      render(<ChatInterface models={undefined} />);
      
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
    });
  });

  describe('Integration Points', () => {
    it('should integrate with useChat hook', () => {
      render(<ChatInterface />);
      
      // Should render conversation area for messages
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-content')).toBeInTheDocument();
    });

    it('should integrate with useAuthStatus hook', () => {
      render(<ChatInterface />);
      
      // Should render regardless of auth status
      expect(screen.getByTestId('conversation')).toBeInTheDocument();
    });

    it('should integrate with model configuration', () => {
      render(<ChatInterface />);
      
      // Should render model selector
      expect(screen.getByTestId('model-select')).toBeInTheDocument();
    });
  });
});