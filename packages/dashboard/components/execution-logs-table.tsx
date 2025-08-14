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
  Activity,
  Bot,
  Wrench,
  List,
  File,
  Box,
  Container,
  Monitor,
  CheckSquare
} from "lucide-react";
import { useSessionLogs } from "@/hooks/use-session-logs";
import { useRealtimeSessionLogs } from "@/hooks/use-realtime-session-logs";
import { cn } from "@/lib/utils";

// Extend Day.js with plugins
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.extend(duration);

interface ExecutionLogsTableProps {
  sessionId: string | null;
  className?: string;
  useRealtimeStreaming?: boolean;
  onLogCountChange?: (count: number) => void;
}

export function ExecutionLogsTable({ sessionId, className, useRealtimeStreaming = true, onLogCountChange }: ExecutionLogsTableProps) {
  // Use real-time streaming hook if enabled, otherwise fall back to polling
  const pollingData = useSessionLogs(sessionId, { enabled: !useRealtimeStreaming });
  const realtimeData = useRealtimeSessionLogs(sessionId, { enabled: useRealtimeStreaming });
  
  // Select the appropriate data source
  const { logs, metadata, isLive, isLoading, error, isConnected } = useRealtimeStreaming ? 
    { ...realtimeData, isConnected: realtimeData.isConnected } : 
    { ...pollingData, isConnected: false };
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

  // Update log count when logs change
  useEffect(() => {
    if (onLogCountChange) {
      onLogCountChange(logs.length);
    }
  }, [logs, onLogCountChange]);
  
  const getLogIcon = (type: string, data: string) => {
    // Check for Agent initialization messages first (higher priority than container/sandbox)
    if (data.toLowerCase().includes('initializing') && data.toLowerCase().includes('agent')) return <Bot className="h-4 w-4" />;
    
    // Check for Assistant messages
    if (data.startsWith('Assistant:')) return <Bot className="h-4 w-4" />;
    
    // Check for Session messages (initialized or started)
    if (data.toLowerCase().includes('session initialized') || 
        data.toLowerCase().includes('session') && data.toLowerCase().includes('started')) return <Monitor className="h-4 w-4" />;
    
    // Check for Execution completed successfully messages
    if (data.toLowerCase().includes('execution completed successfully')) return <CheckSquare className="h-4 w-4" />;
    
    // Check for Git-related messages (all use GitBranch icon for consistency)
    if (data.includes('Git:') || 
        data.includes('Cloning repository:') || 
        data.includes('Switching to branch:') || 
        data.includes('GitHub integration configured') ||
        data.includes('git clone') || data.includes('Cloning') || data.includes('📥') ||
        data.includes('git init') || data.includes('Initialized') || data.includes('🎯') ||
        data.includes('git commit') || data.includes('💾') ||
        data.includes('git add') || data.includes('➕') || data.includes('staging') ||
        data.includes('git push') || data.includes('🚀') ||
        data.includes('git pull') || data.includes('📨') ||
        data.includes('git checkout') || data.includes('git branch') || data.includes('🔀') ||
        data.includes('git status') || data.includes('📊') ||
        data.includes('git diff') || data.includes('📝') ||
        data.includes('git log') || data.includes('📜') ||
        data.includes('git merge') || data.includes('🔗') ||
        data.includes('git fetch') || data.includes('🔄') ||
        data.includes('GitHub') ||
        data.includes('gh ')) return <GitBranch className="h-4 w-4" />;
    
    // Check for Container or Sandbox messages (both use Box icon)
    if (data.toLowerCase().includes('container') || data.toLowerCase().includes('sandbox')) return <Box className="h-4 w-4" />;
    
    // Check for Reading file messages
    if (data.startsWith('Reading file:')) return <File className="h-4 w-4" />;
    
    // Check for Todo messages
    if (data.toLowerCase().includes('todo')) return <List className="h-4 w-4" />;
    
    // Check for Tool messages
    if (data.startsWith('Tool:') || data.startsWith('🔧 Tool:')) return <Wrench className="h-4 w-4" />;
    
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
  
  const getLogTypeLabel = (type: string, data: string) => {
    // Check for Agent initialization messages first (higher priority than container/sandbox)
    if (data.toLowerCase().includes('initializing') && data.toLowerCase().includes('agent')) {
      return 'Agent';
    }
    
    // Check for Assistant messages
    if (data.startsWith('Assistant:')) {
      return 'Agent';
    }
    
    // Check for Session messages (initialized or started)
    if (data.toLowerCase().includes('session initialized') || 
        (data.toLowerCase().includes('session') && data.toLowerCase().includes('started'))) {
      return 'Session';
    }
    
    // Check for Execution completed successfully messages
    if (data.toLowerCase().includes('execution completed successfully')) {
      return 'Success';
    }
    
    // Check for Git-related messages (including those with emojis)
    if (data.includes('Git:') || 
        data.includes('Cloning repository:') || 
        data.includes('Switching to branch:') || 
        data.includes('GitHub integration configured') ||
        data.includes('git clone') ||
        data.includes('git push') ||
        data.includes('git pull') ||
        data.includes('git commit') ||
        data.includes('git checkout') ||
        data.includes('git branch') ||
        data.includes('git status') ||
        data.includes('git diff') ||
        data.includes('git log') ||
        data.includes('git merge') ||
        data.includes('git fetch') ||
        data.includes('GitHub') ||
        data.includes('gh ')) {
      return 'Git';
    }
    
    // Check for Container or Sandbox messages (both show as "Sandbox")
    if (data.toLowerCase().includes('container') || data.toLowerCase().includes('sandbox')) {
      return 'Sandbox';
    }
    
    // Check for Reading file messages
    if (data.startsWith('Reading file:')) {
      return 'File';
    }
    
    // Check for Todo messages
    if (data.toLowerCase().includes('todo')) {
      return 'Todo';
    }
    
    // Check for Tool messages
    if (data.startsWith('Tool:') || data.startsWith('🔧 Tool:')) {
      return 'Tool';
    }
    
    // Default type-based labels
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

  const processLogMessage = (data: string) => {
    // Remove all non-printable characters from the beginning including emojis, spaces, and control chars
    // This regex removes any character that's not a normal printable ASCII or common punctuation
    let processed = data.replace(/^[^\x21-\x7E\xA1-\xFF]+/, '');
    
    // Fallback: if there are still leading spaces, manually remove them
    processed = processed.replace(/^\s+/, '');
    
    return processed;
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
    <ScrollArea 
      ref={scrollAreaRef}
      className={cn("h-full", className)}
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
              const processedMessage = processLogMessage(log.data);
              
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
                        {getLogTypeLabel(log.type, log.data)}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs break-all whitespace-pre-wrap">
                      {log.type === 'command' && !processedMessage.startsWith('$') && !processedMessage.startsWith('Tool:') && (
                        <span className="text-blue-600 font-semibold mr-1">$</span>
                      )}
                      <span className="text-foreground">
                        {processedMessage}
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
  );
}