"use client";

import { useState, useEffect } from "react";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  Settings,
  GitBranch,
  Eye,
  Trash2,
  Loader2
} from "lucide-react";

// Extend Day.js with plugins
dayjs.extend(relativeTime);

export interface Execution {
  id: string;
  sessionId: string;
  timestamp: string;
  agent: string;
  sandbox: string;
  branch: string;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
  duration?: number;
  taskId?: string;
  taskTitle?: string;
  subtaskTitle?: string;
}

interface ExecutionsListProps {
  subtaskId: number;
  projectId: string;
  onSelectExecution: (execution: Execution) => void;
  selectedExecutionId?: string;
  className?: string;
}

export function ExecutionsList({ 
  subtaskId, 
  projectId, 
  onSelectExecution,
  selectedExecutionId,
  className 
}: ExecutionsListProps) {
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Fetch execution history
  useEffect(() => {
    const fetchExecutions = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/projects/${projectId}/tasks/execution-history?subtaskId=${subtaskId}`);
        const data = await response.json();
        
        if (data.success && data.executions) {
          setExecutions(data.executions);
        } else {
          setError(data.error || 'Failed to load executions');
        }
      } catch (err: any) {
        setError('Failed to load execution history');
        console.error('Failed to load executions:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchExecutions();
    
    // Refresh every 5 seconds if there's a running execution
    const interval = setInterval(() => {
      if (executions.some(e => e.status === 'running')) {
        fetchExecutions();
      }
    }, 5000);
    
    return () => clearInterval(interval);
  }, [subtaskId, projectId]);
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'completed':
        return 'text-green-600 bg-green-50 border-green-200';
      case 'failed':
        return 'text-red-600 bg-red-50 border-red-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };
  
  const getAgentIcon = (agent: string) => {
    return <Bot className="h-3 w-3" />;
  };
  
  const getSandboxIcon = (sandbox: string) => {
    return <Settings className="h-3 w-3" />;
  };
  
  const formatDuration = (duration?: number) => {
    if (!duration) return 'N/A';
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };
  
  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading executions...</span>
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
  
  if (executions.length === 0) {
    return (
      <div className={cn("flex items-center justify-center py-8", className)}>
        <div className="text-center">
          <Play className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No executions yet</p>
          <p className="text-xs text-muted-foreground mt-1">Execute the subtask to see history</p>
        </div>
      </div>
    );
  }
  
  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="space-y-2 p-1">
        {executions.map((execution, index) => (
          <div
            key={`${execution.sessionId}-${index}`}
            className={cn(
              "p-3 rounded-lg border cursor-pointer transition-all hover:shadow-sm",
              selectedExecutionId === execution.id ? 
                "border-primary bg-primary/5" : 
                "hover:bg-muted/50"
            )}
            onClick={() => onSelectExecution(execution)}
          >
            {/* Execution Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline" 
                  className={cn("gap-1 text-xs", getStatusColor(execution.status))}
                >
                  {getStatusIcon(execution.status)}
                  {execution.status}
                </Badge>
                {index === 0 && (
                  <Badge variant="outline" className="text-xs">Latest</Badge>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectExecution(execution);
                }}
              >
                <Eye className="h-3 w-3 mr-1" />
                View Logs
              </Button>
            </div>
            
            {/* Execution Details */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              {/* Agent */}
              <div className="flex items-center gap-1 text-muted-foreground">
                {getAgentIcon(execution.agent)}
                <span className="capitalize">{execution.agent}</span>
              </div>
              
              {/* Sandbox */}
              <div className="flex items-center gap-1 text-muted-foreground">
                {getSandboxIcon(execution.sandbox)}
                <span className="capitalize">{execution.sandbox}</span>
              </div>
              
              {/* Branch */}
              <div className="flex items-center gap-1 text-muted-foreground">
                <GitBranch className="h-3 w-3" />
                <span className="truncate">{execution.branch}</span>
              </div>
            </div>
            
            {/* Execution Metadata */}
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span title={dayjs(execution.timestamp).format('LLLL')}>
                {dayjs(execution.timestamp).fromNow()}
              </span>
              {execution.duration && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(execution.duration)}
                </span>
              )}
              {execution.exitCode !== undefined && (
                <span className={cn(
                  "font-mono",
                  execution.exitCode === 0 ? "text-green-600" : "text-red-600"
                )}>
                  Exit: {execution.exitCode}
                </span>
              )}
            </div>
            
            {/* Task Hierarchy and Session ID */}
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground/50">
              {execution.taskId && (
                <span className="font-medium">
                  Task {execution.taskId}.{subtaskId}
                  {execution.subtaskTitle && `: ${execution.subtaskTitle}`}
                </span>
              )}
              <span className="font-mono">
                Session: {execution.sessionId.slice(-8)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}