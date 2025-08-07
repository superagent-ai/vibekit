'use client';

import React from 'react';
import { ChatMessage } from '../types';
import { cn } from '../utils/cn';

interface MessageProps {
  message: ChatMessage;
  className?: string;
}

export function Message({ message, className }: MessageProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  
  return (
    <div
      className={cn(
        'flex w-full gap-4 p-4',
        isUser && 'bg-muted/50',
        className
      )}
    >
      <div className="flex-shrink-0">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium',
            isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
          )}
        >
          {isUser ? 'U' : 'A'}
        </div>
      </div>
      
      <div className="flex-1 space-y-2">
        <div className="text-sm font-medium">
          {isUser ? 'You' : 'Assistant'}
        </div>
        
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {message.content}
        </div>
        
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="text-xs text-muted-foreground">Tool Calls:</div>
            {message.toolCalls.map((toolCall, index) => (
              <ToolCallDisplay key={toolCall.id || index} toolCall={toolCall} />
            ))}
          </div>
        )}
        
        {message.toolResults && message.toolResults.length > 0 && (
          <div className="mt-2 space-y-2">
            <div className="text-xs text-muted-foreground">Tool Results:</div>
            {message.toolResults.map((result, index) => (
              <ToolResultDisplay key={result.id || index} result={result} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ToolCallDisplay({ toolCall }: { toolCall: any }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium">{toolCall.name}</span>
      </div>
      {toolCall.arguments && (
        <pre className="mt-1 text-xs text-muted-foreground">
          {JSON.stringify(toolCall.arguments, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ToolResultDisplay({ result }: { result: any }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2">
      {result.error ? (
        <div className="text-xs text-destructive">Error: {result.error}</div>
      ) : (
        <pre className="text-xs text-muted-foreground">
          {typeof result.result === 'string' 
            ? result.result 
            : JSON.stringify(result.result, null, 2)}
        </pre>
      )}
    </div>
  );
}