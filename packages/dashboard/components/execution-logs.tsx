"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  GitBranch,
  GitCommit,
  GitPullRequest,
  Terminal,
  FileCode,
  Package,
  AlertCircle,
  Info,
  Clock
} from "lucide-react";
import { useSessionLogs, formatLogEntry, getLogEntryColor } from "@/hooks/use-session-logs";
import { cn } from "@/lib/utils";

interface ExecutionLogsProps {
  sessionId: string | null;
  className?: string;
}

export function ExecutionLogs({ sessionId, className }: ExecutionLogsProps) {
  const { logs, metadata, isLive, isLoading, error } = useSessionLogs(sessionId);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  
  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (shouldAutoScroll.current && scrollAreaRef.current) {
      const scrollContainer = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [logs]);
  
  const getLogIcon = (type: string, data: string) => {
    // Check for git operations
    if (data.includes('git clone')) return <GitBranch className="h-3 w-3" />;
    if (data.includes('git commit') || data.includes('git add')) return <GitCommit className="h-3 w-3" />;
    if (data.includes('git push') || data.includes('git pull')) return <GitPullRequest className="h-3 w-3" />;
    
    // Check for package operations
    if (data.includes('npm install') || data.includes('yarn install')) return <Package className="h-3 w-3" />;
    
    // Check for file operations
    if (data.includes('mkdir') || data.includes('touch') || data.includes('cp')) return <FileCode className="h-3 w-3" />;
    
    // Default icons by type
    switch (type) {
      case 'command':
        return <Terminal className="h-3 w-3" />;
      case 'error':
        return <XCircle className="h-3 w-3" />;
      case 'warning':
        return <AlertCircle className="h-3 w-3" />;
      case 'info':
        return <Info className="h-3 w-3" />;
      case 'start':
      case 'end':
        return <Clock className="h-3 w-3" />;
      default:
        return null;
    }
  };
  
  const formatLogLine = (log: any) => {
    const time = new Date(log.timestamp).toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    // Special formatting for commands
    if (log.type === 'command' || log.data.startsWith('$')) {
      return (
        <div className="flex items-start gap-2 font-mono text-xs py-1">
          <span className="text-muted-foreground opacity-60">[{time}]</span>
          <span className="text-blue-600 font-semibold">$</span>
          <span className="text-blue-600">{log.data.replace(/^\$\s*/, '')}</span>
        </div>
      );
    }
    
    // Special formatting for git operations
    if (log.data.includes('Cloning into') || log.data.includes('remote:') || log.data.includes('Receiving objects')) {
      return (
        <div className="flex items-start gap-2 font-mono text-xs py-1">
          <span className="text-muted-foreground opacity-60">[{time}]</span>
          <GitBranch className="h-3 w-3 text-green-600 mt-0.5" />
          <span className="text-green-600">{log.data}</span>
        </div>
      );
    }
    
    // Error formatting
    if (log.type === 'error' || log.type === 'stderr') {
      return (
        <div className="flex items-start gap-2 font-mono text-xs py-1">
          <span className="text-muted-foreground opacity-60">[{time}]</span>
          <XCircle className="h-3 w-3 text-red-600 mt-0.5" />
          <span className="text-red-600">{log.data}</span>
        </div>
      );
    }
    
    // Default formatting
    const icon = getLogIcon(log.type, log.data);
    const color = getLogEntryColor(log.type);
    
    return (
      <div className="flex items-start gap-2 font-mono text-xs py-1">
        <span className="text-muted-foreground opacity-60">[{time}]</span>
        {icon && <span className={cn("mt-0.5", color)}>{icon}</span>}
        <span className={cn(color)}>{log.data}</span>
      </div>
    );
  };
  
  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (error) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <div className="text-center">
          <XCircle className="h-8 w-8 mx-auto mb-2 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }
  
  if (!sessionId) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <p className="text-sm text-muted-foreground">No execution session</p>
      </div>
    );
  }
  
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Execution Logs</h3>
          {isLive ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </Badge>
          ) : metadata?.status === 'completed' ? (
            <Badge variant="outline" className="gap-1 text-green-600 border-green-600">
              <CheckCircle2 className="h-3 w-3" />
              Completed
            </Badge>
          ) : metadata?.status === 'failed' ? (
            <Badge variant="outline" className="gap-1 text-red-600 border-red-600">
              <XCircle className="h-3 w-3" />
              Failed
            </Badge>
          ) : null}
        </div>
        
        {metadata && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Session: {metadata.sessionId}</span>
            {metadata.endTime && (
              <span>
                Duration: {Math.round((metadata.endTime - metadata.startTime) / 1000)}s
              </span>
            )}
          </div>
        )}
      </div>
      
      {/* Log content */}
      <ScrollArea 
        ref={scrollAreaRef}
        className="flex-1 mt-3"
        onMouseEnter={() => { shouldAutoScroll.current = false; }}
        onMouseLeave={() => { shouldAutoScroll.current = true; }}
      >
        <div className="space-y-0.5 pb-4">
          {logs.length === 0 ? (
            <div className="text-center py-8">
              <Terminal className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
              <p className="text-sm text-muted-foreground">Waiting for logs...</p>
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="hover:bg-muted/50 px-2 -mx-2 rounded">
                {formatLogLine(log)}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}