'use client';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent, MessageAvatar } from '@/components/ai-elements/message';
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
} from '@/components/ai-elements/prompt-input';
import { useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { Response } from '@/components/ai-elements/response';
import { GlobeIcon, Square } from 'lucide-react';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/source';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import { Loader } from '@/components/ai-elements/loader';
import { AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

const models = [
  {
    name: 'Claude Sonnet 4',
    value: 'claude-sonnet-4-20250514',
  },
  {
    name: 'Claude Opus 4.1',
    value: 'claude-opus-4-1-20250805',
  },
];

export default function ChatPage() {
  const [model, setModel] = useState<string>(models[0].value);
  const [webSearch, setWebSearch] = useState(false);
  const [inputValue, setInputValue] = useState('');
  
  // Use the AI SDK useChat hook
  const { 
    messages, 
    sendMessage,
    status,
    error,
    stop,
  } = useChat({
    onError: (error) => {
      console.error('Chat error:', error);
    },
    onFinish: (message) => {
      console.log('Message completed:', message);
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Submitting with input:', inputValue, 'status:', status);
    
    if (inputValue.trim() && status !== 'streaming') {
      // Send message with custom data
      await sendMessage({
        role: 'user',
        content: inputValue,
      }, {
        data: {
          model,
          showMCPTools: webSearch,
        },
      });
      setInputValue('');
    }
  };

  // Parse reasoning and sources from message metadata if available
  const getMessageExtras = (message: any) => {
    // This could be enhanced based on how your API returns reasoning/sources
    const extras: { reasoning?: string; sources?: Array<{ title: string; url: string }> } = {};
    
    // Check for reasoning in tool invocations or metadata
    if (message.toolInvocations?.some((t: any) => t.toolName === 'reasoning')) {
      extras.reasoning = message.toolInvocations.find((t: any) => t.toolName === 'reasoning')?.result;
    }
    
    // Check for sources
    if (message.toolInvocations?.some((t: any) => t.toolName === 'web_search')) {
      const searchResults = message.toolInvocations.find((t: any) => t.toolName === 'web_search')?.result;
      if (searchResults && Array.isArray(searchResults)) {
        extras.sources = searchResults.map((r: any) => ({
          title: r.title || 'Source',
          url: r.url || '#',
        }));
      }
    }
    
    return extras;
  };

  // Get message content as string
  const getMessageContent = (message: any): string => {
    // Handle parts array (assistant messages from streaming)
    if (Array.isArray(message.parts)) {
      const textContent = message.parts
        .filter((part: any) => part.type === 'text' || typeof part === 'string')
        .map((part: any) => {
          if (typeof part === 'string') return part;
          if (part.type === 'text' && part.text) return part.text;
          return '';
        })
        .join('');
      if (textContent) return textContent;
    }
    
    // Handle different content types
    if (typeof message.parts?.[0]?.text === 'string') {
      return message.parts[0].text;
    }
    if (typeof message.parts?.[0] === 'string') {
      return message.parts[0];
    }
    if (typeof message.text === 'string') {
      return message.text;
    }
    if (typeof message.content === 'string') {
      return message.content;
    }
    
    // Check if content is an array of text parts
    if (Array.isArray(message.content)) {
      const textParts = message.content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('');
      if (textParts) return textParts;
    }
    
    return '';
  };

  const isLoading = status === 'streaming' || status === 'awaiting_message';

  return (
    <Conversation className="h-screen relative">
      <ConversationContent>
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="max-w-2xl mx-auto p-8">
              <h2 className="text-2xl font-semibold mb-4 text-gray-800">
                Welcome to AI Chat
              </h2>
              <p className="text-gray-600 mb-6">
                Start a conversation by typing a message below. You can:
              </p>
              <ul className="text-left text-gray-600 space-y-2 mb-6">
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Ask questions and get intelligent responses</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Toggle web search with the globe icon for current information</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Switch between different AI models using the dropdown</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>View AI reasoning by expanding the thought process</span>
                </li>
              </ul>
              <p className="text-sm text-gray-500">
                Powered by Claude AI
              </p>
            </div>
          </div>
        )}
        
        {messages.map((message) => {
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
                        <SourcesTrigger />
                        <SourcesContent>
                          {extras.sources.map((source, index) => (
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
          <div className="p-4 mb-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 font-semibold">Error</p>
            <p className="text-red-500 text-sm">{error.message || 'An error occurred'}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 px-3 py-1 text-sm bg-red-100 hover:bg-red-200 rounded"
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
            <PromptInputButton
              onClick={() => setWebSearch(!webSearch)}
              className={webSearch ? 'bg-accent' : ''}
            >
              <GlobeIcon className="h-4 w-4" />
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