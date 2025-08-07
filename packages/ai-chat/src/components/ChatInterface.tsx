'use client';

import React, { useRef, useEffect } from 'react';
import { Message } from './Message';
import { MessageInput } from './MessageInput';
import { ToolCall } from './ToolCall';
import { useChat } from '../hooks/useChat';
import { cn } from '../utils/cn';
import { Loader2 } from 'lucide-react';

interface ChatInterfaceProps {
  sessionId?: string;
  className?: string;
  showMCPTools?: boolean;
}

export function ChatInterface({ 
  sessionId: initialSessionId, 
  className,
  showMCPTools = true 
}: ChatInterfaceProps) {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    sessionId,
    createNewSession,
    stop,
  } = useChat({ sessionId: initialSessionId });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Create new session if needed
  useEffect(() => {
    if (!sessionId) {
      createNewSession();
    }
  }, [sessionId, createNewSession]);

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center p-8">
            <div className="text-center space-y-4 max-w-md">
              <h2 className="text-2xl font-semibold">Start a conversation</h2>
              <p className="text-muted-foreground">
                Ask me anything! I can help with coding, answer questions, and use MCP tools to interact with your system.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-0">
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            
            {isLoading && (
              <div className="flex items-center gap-2 p-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Assistant is thinking...</span>
              </div>
            )}
            
            {error && (
              <div className="m-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                Error: {error.message}
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <MessageInput
        value={input}
        onChange={(value) => handleInputChange({ target: { value } } as any)}
        onSubmit={() => handleSubmit()}
        onStop={stop}
        isLoading={isLoading}
        placeholder={sessionId ? "Type a message..." : "Creating session..."}
      />
    </div>
  );
}