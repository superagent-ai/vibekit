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
import { Response } from '@/components/ai-elements/response';
import { GlobeIcon } from 'lucide-react';
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

const models = [
  {
    name: 'GPT 4o',
    value: 'openai/gpt-4o',
  },
  {
    name: 'Claude 3.5 Sonnet',
    value: 'anthropic/claude-3-5-sonnet',
  },
];

export default function ChatPage() {
  const [input, setInput] = useState('');
  const [model, setModel] = useState<string>(models[0].value);
  const [webSearch, setWebSearch] = useState(false);
  
  // Mock messages for UI testing
  const [messages, setMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    reasoning?: string;
    sources?: Array<{ title: string; url: string }>;
  }>>([]);
  
  const [status, setStatus] = useState<'idle' | 'loading'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && status !== 'loading') {
      // Add user message
      const userMessage = {
        id: Date.now().toString(),
        role: 'user' as const,
        content: input,
      };
      
      setMessages(prev => [...prev, userMessage]);
      setInput('');
      setStatus('loading');
      
      // Simulate assistant response after a delay
      setTimeout(() => {
        const assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant' as const,
          content: `This is a mock response to: "${userMessage.content}". The UI is working correctly!`,
          reasoning: 'This is example reasoning text that would show the AI\'s thought process.',
          sources: webSearch ? [
            { title: 'Example Source 1', url: 'https://example.com/1' },
            { title: 'Example Source 2', url: 'https://example.com/2' },
          ] : undefined,
        };
        setMessages(prev => [...prev, assistantMessage]);
        setStatus('idle');
      }, 1500);
    }
  };

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
                (This is currently in demo mode - responses are simulated)
              </p>
            </div>
          </div>
        )}
        {messages.map((message) => (
          <Message key={message.id} role={message.role}>
            <MessageAvatar>
              <AvatarFallback>
                {message.role === 'user' ? 'U' : 'AI'}
              </AvatarFallback>
            </MessageAvatar>
            <MessageContent>
              {message.role === 'user' ? (
                <div className="prose">{message.content}</div>
              ) : (
                <>
                  {message.reasoning && (
                    <Reasoning>
                      <ReasoningTrigger />
                      <ReasoningContent>{message.reasoning}</ReasoningContent>
                    </Reasoning>
                  )}
                  <Response>{message.content}</Response>
                  {message.sources && message.sources.length > 0 && (
                    <Sources>
                      <SourcesTrigger />
                      <SourcesContent>
                        {message.sources.map((source, index) => (
                          <Source key={index} title={source.title} url={source.url} />
                        ))}
                      </SourcesContent>
                    </Sources>
                  )}
                </>
              )}
            </MessageContent>
          </Message>
        ))}
        {status === 'loading' && (
          <Message role="assistant">
            <MessageAvatar>
              <AvatarFallback>AI</AvatarFallback>
            </MessageAvatar>
            <MessageContent>
              <Loader />
            </MessageContent>
          </Message>
        )}
      </ConversationContent>
      
      <ConversationScrollButton />
      
      <PromptInput onSubmit={handleSubmit}>
        <PromptInputTextarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Send a message..."
          disabled={status === 'loading'}
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
              <PromptInputModelSelectTrigger className="w-[150px]">
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
          <PromptInputSubmit disabled={!input.trim() || status === 'loading'} />
        </PromptInputToolbar>
      </PromptInput>
    </Conversation>
  );
}