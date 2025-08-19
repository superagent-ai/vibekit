'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/use-chat';
import { useAuthStatus } from '../hooks/use-auth';
import { DEFAULT_MODELS } from '../utils/config';
import { GlobeIcon, Square, Wrench } from 'lucide-react';
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
import { ToolSection } from './ai-elements/tool';

/**
 * Configuration for ChatInterface component
 */
export interface ChatInterfaceProps {
  /** Custom CSS class for the container */
  className?: string;
  /** Available AI models */
  models?: Array<{ name: string; value: string }>;
  /** Project ID for project-specific chat */
  projectId?: string;
  /** Project root directory for MCP tool configuration */
  projectRoot?: string;
  /** Project name for display */
  projectName?: string;
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
  /** Filter for MCP servers - only these server IDs will be enabled */
  mcpServerFilter?: string[];
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
  projectId,
  projectRoot,
  projectName,
  mcpServerFilter,
}: ChatInterfaceProps) {
  const [model, setModel] = useState<string>(defaultModel);
  const [webSearch, setWebSearch] = useState(false);
  const [mcpTools, setMcpTools] = useState(true); // Enable MCP tools by default
  const [inputValue, setInputValue] = useState('');
  
  // Use refs to track current values for the fetch function
  const stateRef = useRef({
    model,
    webSearch,
    mcpTools,
  });
  
  // Update ref when state changes
  useEffect(() => {
    stateRef.current = {
      model,
      webSearch,
      mcpTools,
    };
  }, [model, webSearch, mcpTools]);
  
  const { authStatus, loading: authLoading } = useAuthStatus();
  
  const chat = useChat({
    model,
    webSearch,
    showMCPTools: mcpTools,
    onError,
    apiEndpoint,
    projectId,
    projectRoot,
    projectName,
    mcpServerFilter,
    // Pass a getter function to get current state
    getCurrentState: () => stateRef.current,
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
                        {authStatus.hasOAuthToken 
                          ? '✓ Using Claude Code OAuth' 
                          : '✓ Using Anthropic API Key'
                        }
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
        
        {messages.map((message: any, index: number) => {
          const extras = getMessageExtras(message);
          const content = getMessageContent(message);
          
          // Debug message parts
          if (message.role === 'assistant' && message.parts) {
            console.log(`[UI DEBUG] Message parts:`, message.parts.map((p: any) => ({ type: p.type, hasText: !!p.text, text: p.text?.substring(0, 100) })));
            message.parts.forEach((part: any, i: number) => {
              console.log(`[UI DEBUG] Part ${i}:`, part);
            });
          }
          
          // Transform AI SDK v5 parts into toolInvocations format for the UI
          let transformedMessage = { ...message };
          if (message.role === 'assistant' && message.parts) {
            const toolInvocations: any[] = [];
            
            message.parts.forEach((part: any) => {
              // Check if this part is a tool call (type starts with "tool-")
              if (part.type && part.type.startsWith('tool-')) {
                const toolName = part.type.replace('tool-', ''); // Remove "tool-" prefix
                
                console.log(`[UI DEBUG] Found tool part with keys:`, Object.keys(part));
                console.log(`[UI DEBUG] Full part object:`, part);
                
                // Try to find args and results in various possible locations
                const possibleArgs = part.args || part.arguments || part.parameters || part.input || part.toolCall?.arguments;
                const possibleResult = part.result || part.content || part.text || part.output || part.toolCall?.result;
                
                console.log(`[UI DEBUG] Possible args:`, possibleArgs);
                console.log(`[UI DEBUG] Possible result:`, possibleResult);
                
                // Map AI SDK states to the format expected by ToolSection
                const mapState = (state: string) => {
                  switch (state) {
                    case 'input-streaming':
                      return 'partial-call';
                    case 'input-available':
                      return 'call';
                    case 'output-available':
                      return possibleResult ? 'result' : 'call';
                    default:
                      return possibleResult ? 'result' : 'call';
                  }
                };
                
                // Transform to toolInvocations format
                const toolInvocation = {
                  toolName: toolName,
                  args: possibleArgs || {},
                  result: possibleResult,
                  state: mapState(part.state),
                  error: part.error || part.errorText
                };
                
                toolInvocations.push(toolInvocation);
                console.log(`[UI DEBUG] Transformed tool invocation:`, toolInvocation);
              }
            });
            
            if (toolInvocations.length > 0) {
              transformedMessage.toolInvocations = toolInvocations;
              console.log(`[UI DEBUG] Added ${toolInvocations.length} tool invocations to message`);
            }
          }
          
          // Skip messages with 'data' role
          if (message.role === 'data') return null;
          
          // Use a combination of id and index to ensure unique keys
          const messageKey = message.id ? `${message.id}-${index}` : `message-${index}`;
            
          return (
            <Message key={messageKey} role={transformedMessage.role}>
              <MessageAvatar>
                <AvatarFallback>
                  {transformedMessage.role === 'user' ? 'U' : 'AI'}
                </AvatarFallback>
              </MessageAvatar>
              <MessageContent>
                {transformedMessage.role === 'user' ? (
                  <div className="prose">{content}</div>
                ) : (
                  <>
                    {extras.reasoning && (
                      <Reasoning>
                        <ReasoningTrigger />
                        <ReasoningContent>{extras.reasoning}</ReasoningContent>
                      </Reasoning>
                    )}
                    {transformedMessage.toolInvocations && transformedMessage.toolInvocations.length > 0 && (
                      <ToolSection 
                        toolInvocations={transformedMessage.toolInvocations}
                        className="mb-4"
                      />
                    )}
                    <Response>{content}</Response>
                    {extras.sources && extras.sources.length > 0 && (
                      <Sources>
                        <SourcesTrigger count={extras.sources.length} />
                        <SourcesContent>
                          {extras.sources.map((source: any, sourceIndex: number) => (
                            <Source key={`source-${sourceIndex}-${source.url}`} title={source.title} href={source.url} />
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
                title="Toggle web search"
              >
                <GlobeIcon className="h-4 w-4" />
              </PromptInputButton>
            )}
            <PromptInputButton
              onClick={() => setMcpTools(!mcpTools)}
              className={mcpTools ? 'bg-accent' : ''}
              title="Toggle MCP tools"
            >
              <Wrench className="h-4 w-4" />
            </PromptInputButton>
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