'use client';

import React, { useState } from 'react';
import '../styles/button-active.css';
import { useChat as useAIChat } from 'ai/react';
import { useState as useStateReact } from 'react';
import { GlobeIcon } from 'lucide-react';
import { cn } from '../utils/cn';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from './ai-elements/conversation';
import { Message, MessageContent } from './ai-elements/message';
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

interface ChatInterfaceProps {
  sessionId?: string;
  className?: string;
  api?: string;
  showMCPTools?: boolean;
}

const models = [
  { name: 'Claude 3.5 Sonnet', value: 'claude-3-5-sonnet-20241022' },
  { name: 'GPT-4o', value: 'gpt-4o' },
];

// Override fetch to log requests
if (typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    console.log('=== FETCH INTERCEPTED ===');
    console.log('URL:', args[0]);
    console.log('Method:', args[1]?.method || 'GET');
    console.log('Body:', args[1]?.body);
    console.log('Headers:', args[1]?.headers);
    
    try {
      const response = await originalFetch(...args);
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
      console.log('Response type:', response.type);
      
      // Clone response to read body without consuming it
      const cloned = response.clone();
      
      // Try to read error if not ok
      if (!response.ok) {
        try {
          const text = await cloned.text();
          console.error('Response error body:', text);
        } catch (e) {
          console.error('Could not read error body');
        }
      }
      
      return response;
    } catch (error) {
      console.error('Fetch error:', error);
      console.error('Fetch error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
      throw error;
    }
  };
}

export function ChatInterface({ 
  sessionId: initialSessionId, 
  className,
  api = 'http://localhost:3001/api/chat',
  showMCPTools = true 
}: ChatInterfaceProps) {
  const [model, setModel] = useState<string>(models[0].value);
  const [webSearch, setWebSearch] = useState(false);
  
  // Debug: Log state changes and render
  React.useEffect(() => {
    console.log('WebSearch state is now:', webSearch);
    console.log('Button should be:', webSearch ? 'BLUE/ACTIVE' : 'DEFAULT');
  }, [webSearch]);
  
  // Use the AI SDK's useChat hook directly
  const chatResult = useAIChat({
    api,
    body: {
      model,
      webSearch,
    },
    streamProtocol: 'text', // Use text protocol for simple responses
    onResponse: (response) => {
      console.log('Got response:', response);
      console.log('Response status:', response.status);
      console.log('Response ok:', response.ok);
    },
    onFinish: (message) => {
      console.log('Finished with message:', message);
    },
    onError: (error) => {
      console.error('=== useChat onError ===');
      console.error('Full error:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Error name:', error.name);
      }
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response text:', error.response.statusText);
      }
    },
  });
  
  console.log('useAIChat result:', chatResult);
  console.log('Available methods:', Object.keys(chatResult));
  
  const { 
    messages = [], 
    append,
    isLoading = false,
    error,
    input: chatInput = '',
    handleInputChange: chatHandleInputChange,
    handleSubmit: chatHandleSubmit,
  } = chatResult || {};
  
  // Log whenever messages change
  React.useEffect(() => {
    if (messages && Array.isArray(messages)) {
      console.log('=== MESSAGES CHANGED ===');
      console.log('Total messages:', messages.length);
      console.log('Messages array:', messages);
    }
  }, [messages]);

  // Debug: Log hook state
  React.useEffect(() => {
    console.log('=== Chat State Update ===');
    console.log('Messages count:', messages?.length || 0);
    console.log('Is Loading:', isLoading);
    console.log('Error:', error);
    console.log('API URL:', api);
    console.log('Current settings:', { model, webSearch });
    
    if (messages && messages.length > 0) {
      console.log('All messages:', messages);
      messages.forEach((msg, i) => {
        console.log(`Message ${i}:`, {
          role: msg.role,
          content: msg.content,
          id: msg.id
        });
      });
    }
    
    if (error) {
      console.error('=== CHAT ERROR ===');
      console.error('Message:', error?.message);
      console.error('Stack:', error?.stack);
      console.error('Full error object:', error);
    }
  }, [messages, isLoading, error, api, model, webSearch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submit triggered with:', {
      chatInput,
      isLoading,
      model,
      webSearch,
      api,
    });
    
    if (chatInput?.trim() && !isLoading) {
      console.log('Calling chatHandleSubmit...');
      try {
        await chatHandleSubmit(e);
        console.log('chatHandleSubmit completed');
      } catch (error) {
        console.error('Error in handleSubmit:', error);
        console.error('Error type:', typeof error);
        console.error('Error details:', {
          message: error?.message,
          stack: error?.stack,
          name: error?.name,
        });
      }
    } else {
      console.log('Not sending - empty input or loading:', { 
        inputEmpty: !chatInput?.trim(), 
        isLoading 
      });
    }
  };

  return (
    <div className={className}>
      <Conversation>
        <ConversationContent>
          {!messages || messages.length === 0 ? (
            <div className="flex h-full items-center justify-center p-8">
              <div className="text-center space-y-4 max-w-md">
                <h2 className="text-2xl font-semibold">Start a conversation</h2>
                <p className="text-muted-foreground">
                  Ask me anything! I can help with coding, answer questions, and use MCP tools to interact with your system.
                </p>
              </div>
            </div>
          ) : (
            <>
              {messages && messages.map((message) => {
                console.log('Rendering message:', message);
                return (
                  <Message key={message.id} from={message.role as 'user' | 'assistant'}>
                    <MessageContent>
                      {/* Handle reasoning content if present */}
                      {(message as any).experimental_providerMetadata?.deepseek && (
                        <Reasoning>
                          <ReasoningTrigger>View reasoning</ReasoningTrigger>
                          <ReasoningContent>
                            {String((message as any).experimental_providerMetadata.deepseek.reasoning || '')}
                          </ReasoningContent>
                        </Reasoning>
                      )}
                      
                      {/* Handle message content - parse if needed */}
                      {(() => {
                        const content = (message as any).content || (message as any).text || '';
                        
                        // Check if content has the streaming format (0:"text")
                        if (typeof content === 'string' && content.includes('0:"')) {
                          // Parse the streaming format
                          const lines = content.split('\n');
                          let parsedContent = '';
                          
                          for (const line of lines) {
                            if (line.startsWith('0:')) {
                              try {
                                const jsonStr = line.substring(2);
                                const parsed = JSON.parse(jsonStr);
                                parsedContent += parsed;
                              } catch (e) {
                                // If parsing fails, just use the line as is
                              }
                            }
                          }
                          
                          return parsedContent ? <Response>{parsedContent}</Response> : null;
                        }
                        
                        // Otherwise just display the content as is
                        return content ? <Response>{content}</Response> : null;
                      })()}
                    
                    {/* Handle tool invocations */}
                    {(message as any).toolInvocations && (message as any).toolInvocations.length > 0 && (
                      <div className="mt-4 space-y-2">
                        {(message as any).toolInvocations.map((tool: any, toolIndex: number) => (
                          <div
                            key={toolIndex}
                            className="rounded-lg border bg-muted/30 p-3 text-sm"
                          >
                            <div className="font-medium">Tool: {tool.toolName}</div>
                            {tool.state === 'result' && tool.result && (
                              <div className="mt-2 text-muted-foreground">
                                <pre className="whitespace-pre-wrap">
                                  {JSON.stringify(tool.result, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Handle sources if present */}
                    {(message as any).experimental_providerMetadata?.sources && 
                     Array.isArray((message as any).experimental_providerMetadata.sources) && 
                     (message as any).experimental_providerMetadata.sources.length > 0 && (
                      <Sources>
                        <SourcesTrigger count={(message as any).experimental_providerMetadata.sources.length}>
                          View {(message as any).experimental_providerMetadata.sources.length} sources
                        </SourcesTrigger>
                        <SourcesContent>
                          {(message as any).experimental_providerMetadata.sources.map((source: any, sourceIndex: number) => (
                            <Source key={sourceIndex}>
                              <a href={source.url} target="_blank" rel="noopener noreferrer">
                                {source.title}
                              </a>
                            </Source>
                          ))}
                        </SourcesContent>
                      </Sources>
                    )}
                    </MessageContent>
                  </Message>
                );
              })}
              
              {/* Show loading indicator */}
              {isLoading && (
                <Message from="assistant">
                  <MessageContent>
                    <Loader />
                  </MessageContent>
                </Message>
              )}
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <PromptInput onSubmit={handleSubmit} className="mt-4">
        <PromptInputTextarea
          value={chatInput || ''}
          onChange={(e) => {
            if (chatHandleInputChange) {
              chatHandleInputChange(e);
            } else {
              console.log('No handleInputChange available');
            }
          }}
          placeholder="Type a message..."
        />
        <PromptInputToolbar>
          <PromptInputTools>
            {showMCPTools && (
              <PromptInputButton
                type="button"
                aria-pressed={webSearch}
                data-active={webSearch ? 'true' : 'false'}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const newValue = !webSearch;
                  console.log('Search clicked, changing from', webSearch, 'to', newValue);
                  setWebSearch(newValue);
                }}
                className={cn(
                  'relative',
                  webSearch && 'search-button-active'
                )}
                style={{
                  backgroundColor: webSearch ? '#3b82f6' : 'transparent',
                  color: webSearch ? 'white' : 'inherit',
                  border: webSearch ? '1px solid #3b82f6' : '1px solid hsl(var(--border))',
                }}
              >
                <GlobeIcon size={16} style={{ color: webSearch ? 'white' : 'currentColor' }} />
                <span>Search {webSearch ? '(On)' : '(Off)'}</span>
              </PromptInputButton>
            )}
            <PromptInputModelSelect
              value={model}
              onValueChange={setModel}
            >
              <PromptInputModelSelectTrigger>
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
          <PromptInputSubmit
            disabled={!chatInput?.trim() || isLoading}
            status={isLoading ? 'streaming' : 'ready'}
          />
        </PromptInputToolbar>
      </PromptInput>
    </div>
  );
}