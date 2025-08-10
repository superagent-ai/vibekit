'use client';

import { useState } from 'react';
import { useChat } from '../hooks/use-chat';
import { useAuthStatus } from '../hooks/use-auth';
import { DEFAULT_MODELS } from '../utils/config';
import { GlobeIcon, Square } from 'lucide-react';
import { Button } from './ui/button';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from './ai-elements/conversation';
import { Message, MessageContent, MessageAvatar, AvatarFallback } from './ai-elements/message';
import {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
} from './ai-elements/prompt-input';
import { Response } from './ai-elements/response';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from './ai-elements/source';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from './ai-elements/reasoning';
import { Loader } from './ai-elements/loader';

/**
 * Configuration for ChatInterface component
 */
export interface ChatInterfaceProps {
  /** Custom CSS class for the container */
  className?: string;
  /** Available AI models */
  models?: Array<{ name: string; value: string }>;
  /** Default selected model */
  defaultModel?: string;
  /** Show web search toggle button */
  showWebSearch?: boolean;
  /** Error handler callback */
  onError?: (error: Error) => void;
  /** Custom API endpoint (defaults to /api/chat) */
  apiEndpoint?: string;
  /** Welcome message configuration */
  welcomeMessage?: {
    title?: string;
    subtitle?: string;
    features?: string[];
  };
}

/**
 * Main chat interface component
 * Provides a complete chat UI with AI integration
 */
export function ChatInterface({
  className = 'h-screen relative',
  models = DEFAULT_MODELS,
  defaultModel = models[0].value,
  showWebSearch = true,
  onError,
  apiEndpoint,
  welcomeMessage,
}: ChatInterfaceProps) {
  const [model, setModel] = useState<string>(defaultModel);
  const [webSearch, setWebSearch] = useState(false);
  const [inputValue, setInputValue] = useState('');
  
  const { authStatus, loading: authLoading } = useAuthStatus();
  
  const chat = useChat({
    model,
    webSearch,
    onError,
    apiEndpoint,
  }) as any;
  
  const { 
    messages, 
    status,
    error,
    stop,
    getMessageContent,
    getMessageExtras,
  } = chat;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (inputValue.trim() && status !== 'streaming') {
      // Use sendMessage which is the AI SDK v5 method
      if (chat.sendMessage) {
        // sendMessage expects a message object with role and content
        await chat.sendMessage({
          role: 'user',
          content: inputValue,
        });
      } else {
        console.error('sendMessage method not available');
      }
      setInputValue('');
    }
  };

  const isLoading = status === 'streaming';

  return (
    <Conversation className={className}>
      <ConversationContent>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="max-w-2xl mx-auto p-8">
              <h2 className="text-2xl font-semibold mb-4 text-foreground">
                {welcomeMessage?.title || 'Welcome to AI Chat'}
              </h2>
              <p className="text-muted-foreground mb-6">
                {welcomeMessage?.subtitle || 'Start a conversation by typing a message below. You can:'}
              </p>
              <ul className="text-left text-muted-foreground space-y-2 mb-6">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Ask questions and get intelligent responses</span>
                </li>
                {showWebSearch && (
                  <li className="flex items-start">
                    <span className="mr-2">•</span>
                    <span>Toggle web search with the globe icon for current information</span>
                  </li>
                )}
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Switch between different AI models using the dropdown</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>View AI reasoning by expanding the thought process</span>
                </li>
              </ul>
              <p className="text-sm text-muted-foreground">
                Powered by Claude AI
              </p>
              {!authLoading && authStatus && (
                <div className="mt-4 p-3 bg-muted rounded-lg text-sm">
                  {authStatus.needsApiKey ? (
                    <div className="space-y-2">
                      {authStatus.claudeCodeMaxUser ? (
                        <>
                          <p className="text-destructive">
                            ⚠ Claude Code Max account detected ({authStatus.claudeCodeMaxUser})
                          </p>
                          <p className="text-destructive text-xs">
                            Claude Code Max tokens are for Claude.ai only. To use the API, please set ANTHROPIC_API_KEY in your .env file.
                          </p>
                        </>
                      ) : (
                        <p className="text-destructive">
                          ⚠ No authentication configured. Please set ANTHROPIC_API_KEY in your .env file.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-primary">
                        ✓ Using Anthropic API Key
                      </p>
                      {authStatus.claudeCodeMaxUser && (
                        <p className="text-muted-foreground text-xs">
                          Claude Code Max account: {authStatus.claudeCodeMaxUser}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        
        {messages.map((message: any) => {
          const extras = getMessageExtras(message);
          const content = getMessageContent(message);
          
          // Skip messages with 'data' role
          if (message.role === 'data') return null;
            
          return (
            <Message key={message.id} role={message.role}>
              <MessageAvatar>
                <AvatarFallback>
                  {message.role === 'user' ? 'U' : 'AI'}
                </AvatarFallback>
              </MessageAvatar>
              <MessageContent>
                {message.role === 'user' ? (
                  <div className="prose">{content}</div>
                ) : (
                  <>
                    {extras.reasoning && (
                      <Reasoning>
                        <ReasoningTrigger />
                        <ReasoningContent>{extras.reasoning}</ReasoningContent>
                      </Reasoning>
                    )}
                    <Response>{content}</Response>
                    {extras.sources && extras.sources.length > 0 && (
                      <Sources>
                        <SourcesTrigger count={extras.sources.length} />
                        <SourcesContent>
                          {extras.sources.map((source: any, index: any) => (
                            <Source key={index} title={source.title} href={source.url} />
                          ))}
                        </SourcesContent>
                      </Sources>
                    )}
                  </>
                )}
              </MessageContent>
            </Message>
          );
        })}
        
        {isLoading && (
          <Message role="assistant">
            <MessageAvatar>
              <AvatarFallback>AI</AvatarFallback>
            </MessageAvatar>
            <MessageContent>
              <Loader />
            </MessageContent>
          </Message>
        )}
        
        {error && (
          <div className="p-4 mb-4 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-destructive font-semibold">Error</p>
            <p className="text-destructive/80 text-sm">{error.message || 'An error occurred'}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-3 py-1 text-sm bg-destructive/20 hover:bg-destructive/30 rounded"
            >
              Refresh Page
            </button>
          </div>
        )}
      </ConversationContent>
      
      <ConversationScrollButton />
      
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Send a message..."
          disabled={isLoading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <PromptInputToolbar>
          <PromptInputTools>
            {showWebSearch && (
              <PromptInputButton
                onClick={() => setWebSearch(!webSearch)}
                className={webSearch ? 'bg-accent' : ''}
              >
                <GlobeIcon className="h-4 w-4" />
              </PromptInputButton>
            )}
            <PromptInputModelSelect value={model} onValueChange={setModel}>
              <PromptInputModelSelectTrigger className="w-[180px]">
                <PromptInputModelSelectValue />
              </PromptInputModelSelectTrigger>
              <PromptInputModelSelectContent>
                {models.map((m) => (
                  <PromptInputModelSelectItem key={m.value} value={m.value}>
                    {m.name}
                  </PromptInputModelSelectItem>
                ))}
              </PromptInputModelSelectContent>
            </PromptInputModelSelect>
          </PromptInputTools>
          {isLoading ? (
            <Button
              type="button"
              onClick={stop}
              size="icon"
              variant="destructive"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <PromptInputSubmit disabled={!inputValue.trim() || isLoading} />
          )}
        </PromptInputToolbar>
      </PromptInput>
    </Conversation>
  );
}