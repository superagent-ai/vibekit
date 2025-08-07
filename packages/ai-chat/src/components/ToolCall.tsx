'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Terminal, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../utils/cn';

interface ToolCallProps {
  toolName: string;
  serverId?: string;
  arguments?: any;
  result?: any;
  error?: string;
  isExecuting?: boolean;
  className?: string;
}

export function ToolCall({
  toolName,
  serverId,
  arguments: args,
  result,
  error,
  isExecuting = false,
  className,
}: ToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const status = isExecuting ? 'executing' : error ? 'error' : result ? 'success' : 'pending';

  return (
    <div
      className={cn(
        'rounded-lg border bg-muted/30',
        status === 'error' && 'border-destructive/50',
        status === 'success' && 'border-green-500/50',
        status === 'executing' && 'border-primary/50',
        className
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-muted/50"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        
        <Terminal className="h-4 w-4 text-primary" />
        
        <span className="flex-1 text-sm font-medium">
          {toolName}
          {serverId && (
            <span className="ml-2 text-xs text-muted-foreground">
              ({serverId})
            </span>
          )}
        </span>
        
        {status === 'executing' && (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        )}
        {status === 'success' && (
          <CheckCircle className="h-4 w-4 text-green-500" />
        )}
        {status === 'error' && (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-2">
          {args && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Arguments:
              </div>
              <pre className="rounded bg-background p-2 text-xs overflow-x-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {result && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Result:
              </div>
              <pre className="rounded bg-background p-2 text-xs overflow-x-auto max-h-[200px] overflow-y-auto">
                {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}

          {error && (
            <div>
              <div className="text-xs font-medium text-destructive mb-1">
                Error:
              </div>
              <div className="rounded bg-destructive/10 p-2 text-xs text-destructive">
                {error}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}