'use client';

import { ChevronDown, ChevronRight, Loader2, CheckCircle, AlertCircle, Terminal } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../../utils/cn';

export type ToolState = 
  | 'pending'
  | 'input-streaming' 
  | 'input-available' 
  | 'executing'
  | 'output-available' 
  | 'output-error';

interface ToolProps {
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

export function Tool({ children, className, defaultOpen = false }: ToolProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div 
      className={cn(
        'rounded-lg border bg-muted/30 overflow-hidden transition-colors',
        className
      )}
    >
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {children}
      </div>
    </div>
  );
}

interface ToolHeaderProps {
  type: string;
  state: ToolState;
  isOpen?: boolean;
  onToggle?: () => void;
}

export function ToolHeader({ type, state, isOpen = false, onToggle }: ToolHeaderProps) {
  const getStateIcon = () => {
    switch (state) {
      case 'pending':
      case 'input-streaming':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      case 'executing':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'output-available':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'output-error':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Terminal className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStateText = () => {
    switch (state) {
      case 'pending':
        return 'Preparing...';
      case 'input-streaming':
        return 'Receiving input...';
      case 'input-available':
        return 'Ready to execute';
      case 'executing':
        return 'Executing...';
      case 'output-available':
        return 'Completed';
      case 'output-error':
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  return (
    <div 
      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
      onClick={onToggle}
    >
      <div className="flex items-center gap-3">
        <button className="p-0.5" aria-label="Toggle tool details">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
        <Terminal className="h-4 w-4 text-primary" />
        <span className="font-mono text-sm font-medium">{type}</span>
      </div>
      <div className="flex items-center gap-2">
        {getStateIcon()}
        <span className="text-xs text-muted-foreground">{getStateText()}</span>
      </div>
    </div>
  );
}

interface ToolContentProps {
  children: ReactNode;
  isOpen?: boolean;
}

export function ToolContent({ children, isOpen = true }: ToolContentProps) {
  if (!isOpen) return null;
  
  return (
    <div className="px-4 pb-4 space-y-3 border-t bg-background/50">
      {children}
    </div>
  );
}

interface ToolInputProps {
  input: any;
  className?: string;
}

export function ToolInput({ input, className }: ToolInputProps) {
  const formatInput = (data: any): string => {
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Input Parameters
      </div>
      <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">
        <code>{formatInput(input)}</code>
      </pre>
    </div>
  );
}

interface ToolOutputProps {
  output?: any;
  errorText?: string;
  className?: string;
}

export function ToolOutput({ output, errorText, className }: ToolOutputProps) {
  const formatOutput = (data: any): string => {
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  if (errorText) {
    return (
      <div className={cn('space-y-2', className)}>
        <div className="text-xs font-medium text-destructive uppercase tracking-wider">
          Error
        </div>
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3">
          <p className="text-sm text-destructive">{errorText}</p>
        </div>
      </div>
    );
  }

  if (!output) return null;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Output
      </div>
      <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-x-auto">
        <code>{formatOutput(output)}</code>
      </pre>
    </div>
  );
}

interface ToolSectionProps {
  toolInvocations?: Array<{
    toolName: string;
    args?: any;
    result?: any;
    error?: string;
    state?: 'partial-call' | 'call' | 'result' | 'error';
  }>;
  className?: string;
}

export function ToolSection({ toolInvocations, className }: ToolSectionProps) {
  const [openTools, setOpenTools] = useState<Set<number>>(new Set());

  if (!toolInvocations || toolInvocations.length === 0) return null;

  const toggleTool = (index: number) => {
    setOpenTools(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const getToolState = (invocation: any): ToolState => {
    switch (invocation.state) {
      case 'partial-call':
        return 'input-streaming';
      case 'call':
        return 'executing';
      case 'result':
        return 'output-available';
      case 'error':
        return 'output-error';
      default:
        return 'pending';
    }
  };

  return (
    <div className={cn('space-y-2', className)}>
      {toolInvocations.map((invocation, index) => {
        const isOpen = openTools.has(index);
        const state = getToolState(invocation);
        
        return (
          <Tool key={index} defaultOpen={false}>
            <ToolHeader 
              type={invocation.toolName}
              state={state}
              isOpen={isOpen}
              onToggle={() => toggleTool(index)}
            />
            <ToolContent isOpen={isOpen}>
              {invocation.args && (
                <ToolInput input={invocation.args} />
              )}
              {(invocation.result || invocation.error) && (
                <ToolOutput 
                  output={invocation.result}
                  errorText={invocation.error}
                />
              )}
            </ToolContent>
          </Tool>
        );
      })}
    </div>
  );
}