"use client";

import { useEffect, useRef, useState } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import localizedFormat from "dayjs/plugin/localizedFormat";
import duration from "dayjs/plugin/duration";
import { Badge } from "@/components/ui/badge";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Clock,
  Database,
  Activity
} from "lucide-react";
import { useSessionLogs } from "@/hooks/use-session-logs";
import { cn } from "@/lib/utils";

// Extend Day.js with plugins
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.extend(duration);

interface ExecutionLogsTableProps {
  sessionId: string | null;
  className?: string;
}

export function ExecutionLogsTable({ sessionId, className }: ExecutionLogsTableProps) {
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
    // Enhanced Git operation detection
    if (data.includes('git clone') || data.includes('Cloning') || data.includes('📥')) return <GitBranch className="h-4 w-4" />;
    if (data.includes('git init') || data.includes('Initialized') || data.includes('🎯')) return <GitBranch className="h-4 w-4" />;
    if (data.includes('git commit') || data.includes('💾')) return <GitCommit className="h-4 w-4" />;
    if (data.includes('git add') || data.includes('➕') || data.includes('staging')) return <GitCommit className="h-4 w-4" />;
    if (data.includes('git push') || data.includes('🚀')) return <GitPullRequest className="h-4 w-4" />;
    if (data.includes('git pull') || data.includes('📨')) return <GitPullRequest className="h-4 w-4" />;
    if (data.includes('git checkout') || data.includes('git branch') || data.includes('🔀')) return <GitBranch className="h-4 w-4" />;
    if (data.includes('git status') || data.includes('📊')) return <GitBranch className="h-4 w-4" />;
    if (data.includes('git diff') || data.includes('📝')) return <GitBranch className="h-4 w-4" />;
    if (data.includes('git log') || data.includes('📜')) return <GitBranch className="h-4 w-4" />;
    if (data.includes('git merge') || data.includes('🔗')) return <GitPullRequest className="h-4 w-4" />;
    if (data.includes('git fetch') || data.includes('🔄')) return <GitBranch className="h-4 w-4" />;
    if (data.includes('GitHub') || data.includes('🐙')) return <GitPullRequest className="h-4 w-4" />;
    if (data.includes('gh ')) return <GitPullRequest className="h-4 w-4" />;
    
    // Check for package operations
    if (data.includes('npm install') || data.includes('yarn install')) return <Package className="h-4 w-4" />;
    if (data.includes('npm run') || data.includes('yarn run')) return <Activity className="h-4 w-4" />;
    
    // Check for file operations
    if (data.includes('mkdir') || data.includes('touch') || data.includes('cp')) return <FileCode className="h-4 w-4" />;
    
    // Check for database operations
    if (data.includes('SELECT') || data.includes('INSERT') || data.includes('UPDATE')) return <Database className="h-4 w-4" />;
    
    // Default icons by type
    switch (type) {
      case 'command':
        return <Terminal className="h-4 w-4" />;
      case 'error':
      case 'stderr':
        return <XCircle className="h-4 w-4" />;
      case 'info':
        return <Info className="h-4 w-4" />;
      case 'start':
      case 'end':
        return <Clock className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };
  
  const getLogTypeLabel = (type: string) => {
    switch (type) {
      case 'command':
        return 'Command';
      case 'stdout':
        return 'Output';
      case 'stderr':
        return 'Error';
      case 'error':
        return 'Error';
      case 'info':
        return 'Info';
      case 'start':
        return 'Start';
      case 'end':
        return 'End';
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  };
  
  const getLogTypeColor = (type: string) => {
    switch (type) {
      case 'command':
        return 'text-blue-600 bg-blue-50';
      case 'error':
      case 'stderr':
        return 'text-red-600 bg-red-50';
      case 'info':
        return 'text-cyan-600 bg-cyan-50';
      case 'start':
      case 'end':
        return 'text-purple-600 bg-purple-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };
  
  // State for current time to trigger re-renders for relative time
  const [, setCurrentTime] = useState(Date.now());
  
  // Update relative times every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000);
    return () => clearInterval(interval);
  }, []);
  
  const formatTimestamp = (timestamp: number, useRelative = false) => {
    const time = dayjs(timestamp);
    
    if (useRelative && metadata?.status === 'running') {
      // For running logs, show relative time
      return time.fromNow();
    }
    
    // For completed logs or when not using relative, show absolute time
    // If the log is from today, just show time
    if (time.isSame(dayjs(), 'day')) {
      return time.format('HH:mm:ss');
    }
    
    // If from this year, show month, day and time
    if (time.isSame(dayjs(), 'year')) {
      return time.format('MMM D, HH:mm:ss');
    }
    
    // Otherwise show full date and time
    return time.format('MMM D YYYY, HH:mm:ss');
  };
  
  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading execution logs...</span>
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
        <div className="text-center">
          <Terminal className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No execution history available</p>
          <p className="text-xs text-muted-foreground mt-1">Execute the subtask to see logs</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Execution History</h3>
          {isLive ? (
            <Badge variant="outline" className="gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Live
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
            <span>Session: {metadata.sessionId?.slice(-8)}</span>
            {metadata.startTime && (
              <span title={dayjs(metadata.startTime).format('LLL')}>
                Started: {dayjs(metadata.startTime).fromNow()}
              </span>
            )}
            {metadata.endTime && (
              <span>
                Duration: {dayjs.duration(metadata.endTime - metadata.startTime).format('m[m] s[s]')}
              </span>
            )}
            <span>{logs.length} entries</span>
          </div>
        )}
      </div>
      
      {/* Table content */}
      <ScrollArea 
        ref={scrollAreaRef}
        className="flex-1 mt-3"
        onMouseEnter={() => { shouldAutoScroll.current = false; }}
        onMouseLeave={() => { shouldAutoScroll.current = true; }}
      >
        {logs.length === 0 ? (
          <div className="text-center py-8">
            <Terminal className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">Waiting for logs...</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[120px]">Time</TableHead>
                <TableHead className="w-[100px]">Type</TableHead>
                <TableHead>Message</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log, index) => {
                const icon = getLogIcon(log.type, log.data);
                const typeColor = getLogTypeColor(log.type);
                
                return (
                  <TableRow key={index} className="group hover:bg-muted/50">
                    <TableCell className="font-mono text-xs text-muted-foreground" title={dayjs(log.timestamp).format('LLLL')}>
                      {formatTimestamp(log.timestamp, true)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className={cn("opacity-70", typeColor.replace('bg-', 'text-'))}>
                          {icon}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs px-1.5 py-0", typeColor)}
                        >
                          {getLogTypeLabel(log.type)}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-mono text-xs break-all whitespace-pre-wrap">
                        {log.type === 'command' && !log.data.startsWith('$') && !log.data.startsWith('🔧') && (
                          <span className="text-blue-600 font-semibold mr-1">$</span>
                        )}
                        <span className={cn(
                          log.type === 'error' || log.type === 'stderr' ? 'text-red-600' :
                          log.type === 'command' ? 'text-blue-600' :
                          log.type === 'info' ? 'text-cyan-600' :
                          'text-foreground'
                        )}>
                          {log.data}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </ScrollArea>
    </div>
  );
}