"use client";

import React, { useEffect, useRef, useState } from "react";
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
  CheckSquare,
  Wifi,
  WifiOff,
  Circle,
  CheckCircle
} from "lucide-react";
import { useSmartSessionLogs } from "@/hooks/use-smart-session-logs";
import { cn } from "@/lib/utils";
import { Todo, parseTodoWriteFromMessage } from "@/lib/todo-parser";

// Extend Day.js with plugins
dayjs.extend(relativeTime);
dayjs.extend(localizedFormat);
dayjs.extend(duration);

interface ExecutionLogsTableProps {
  sessionId: string | null;
  className?: string;
  onLogCountChange?: (count: number) => void;
  onTodoUpdate?: (todos: Todo[], timestamp: number) => void;
}


// Component to render todo list inline in the table
function TodoListRenderer({ todos }: { todos: Todo[] }) {
  const getStatusIcon = (status: Todo['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-2.5 w-2.5 text-green-600" />;
      case 'in_progress':
        return <Clock className="h-2.5 w-2.5 text-blue-600" />;
      case 'pending':
      default:
        return <Circle className="h-2.5 w-2.5 text-gray-400" />;
    }
  };
  
  const getPriorityButton = (priority?: string) => {
    if (!priority) return null;
    
    let letter: string;
    let className: string;
    
    switch (priority) {
      case 'high':
        letter = 'H';
        className = 'bg-red-500 text-white text-[8px] w-2.5 h-2.5';
        break;
      case 'medium':
        letter = 'M';
        className = 'bg-orange-500 text-white text-[8px] w-2.5 h-2.5';
        break;
      case 'low':
        letter = 'L';
        className = 'bg-green-500 text-white text-[8px] w-2.5 h-2.5';
        break;
      default:
        return null;
    }
    
    return (
      <div className={`rounded-full flex items-center justify-center font-bold ${className}`}>
        {letter}
      </div>
    );
  };
  
  return (
    <div className="mt-1 p-2 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800">
      <div className="flex items-center gap-1 mb-1">
        <List className="h-2.5 w-2.5 text-blue-600" />
        <span className="text-[10px] font-medium text-blue-800 dark:text-blue-200">
          Todos ({todos.length})
        </span>
      </div>
      <div className="space-y-0.5">
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-start gap-1.5 text-[10px]">
            <div className="mt-0.5 flex-shrink-0">
              {getStatusIcon(todo.status)}
            </div>
            <p className={`flex-1 leading-tight ${todo.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
              {todo.content}
            </p>
            {todo.priority && (
              <div className="mt-0.5 flex-shrink-0">
                {getPriorityButton(todo.priority)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ExecutionLogsTable({ sessionId, className, onLogCountChange, onTodoUpdate }: ExecutionLogsTableProps) {
  // Use smart loading strategy that automatically chooses static vs live based on session status
  const { logs, metadata, isLive, isLoading, error, isConnected, loadingStrategy } = useSmartSessionLogs(sessionId);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);
  const hasInitiallyLoaded = useRef(false);
  const previousLogCount = useRef(0);
  
  // Handle scrolling behavior - start at top on first load, then auto-scroll for new logs
  useEffect(() => {
    if (!scrollAreaRef.current || logs.length === 0) return;
    
    // First time logs are loaded - scroll to top
    if (!hasInitiallyLoaded.current) {
      scrollAreaRef.current.scrollTop = 0;
      hasInitiallyLoaded.current = true;
      previousLogCount.current = logs.length;
    } 
    // New logs added after initial load - auto-scroll to bottom if enabled
    else if (logs.length > previousLogCount.current && shouldAutoScroll.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
      previousLogCount.current = logs.length;
    } 
    // Update count even if not scrolling
    else {
      previousLogCount.current = logs.length;
    }
  }, [logs]);

  // Reset scroll state when session changes
  useEffect(() => {
    hasInitiallyLoaded.current = false;
    previousLogCount.current = 0;
    shouldAutoScroll.current = true;
  }, [sessionId]);

  // Update log count when logs change
  useEffect(() => {
    if (onLogCountChange) {
      onLogCountChange(logs.length);
    }
  }, [logs, onLogCountChange]);
  
  const getLogIcon = (type: string, data: string) => {
    // Check if this is specifically a "Sandbox ended" message
    if (data.includes('Sandbox ended:')) {
      return <Box className="h-4 w-4" />;
    }
    
    // Handle "result" type messages first with monitor icon
    if (data.includes('"type":"result"')) {
      return <Monitor className="h-4 w-4" />;
    }
    
    // Handle "end" type messages with box icon (these become "Sandbox ended" messages)
    if (data.includes('"type":"end"') || data.includes('"type": "end"')) {
      return <Box className="h-4 w-4" />;
    }
    
    // Handle JSON updates first
    try {
      const parsed = JSON.parse(data);
      
      // Check if this is an update message with end type in the data field
      if (parsed.type === 'update' && parsed.data && typeof parsed.data === 'string') {
        try {
          const innerParsed = JSON.parse(parsed.data);
          if (innerParsed.type === 'end') {
            return <Box className="h-4 w-4" />;
          }
        } catch (e) {
          // Continue with outer parsing
        }
      }
      
      // Check if this is a session result message
      if (parsed.type === 'result') {
        return <Monitor className="h-4 w-4" />;
      }
      // Check if this is a tool result message
      if (parsed.type === 'user' && parsed.message?.content) {
        const hasToolResult = parsed.message.content.some((item: any) => item.type === 'tool_result');
        if (hasToolResult) {
          return <Wrench className="h-4 w-4" />;
        }
      }
      // Check if this is a tool use message (but exclude TodoWrite)
      if (parsed.type === 'assistant' && parsed.message?.content) {
        const hasTools = parsed.message.content.some((item: any) => 
          item.type === 'tool_use' && item.name !== 'TodoWrite'
        );
        const hasText = parsed.message.content.some((item: any) => item.type === 'text');
        if (hasTools && !hasText) {
          return <Wrench className="h-4 w-4" />;
        }
      }
      if (parsed.type === 'assistant') return <Bot className="h-4 w-4" />;
      if (parsed.type === 'system' && parsed.subtype === 'init') return <Monitor className="h-4 w-4" />;
      if (parsed.type === 'git') return <GitBranch className="h-4 w-4" />;
      if (parsed.type === 'start') return <Box className="h-4 w-4" />;
      if (parsed.type === 'container_created') return <Container className="h-4 w-4" />;
      if (parsed.type === 'image_pull') return <Package className="h-4 w-4" />;
      if (parsed.type === 'repository_clone') return <GitBranch className="h-4 w-4" />;
    } catch (e) {
      // Not JSON, continue with text-based detection
    }
    
    // Check for Session started messages first  
    if (data.toLowerCase().includes('session') && data.toLowerCase().includes('started')) return <Clock className="h-4 w-4" />;
    
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
    
    // Check for file operation messages
    if (data.startsWith('Reading file:') || data.startsWith('Read file:') || data.startsWith('Writing file:') || data.startsWith('Wrote file:')) return <Wrench className="h-4 w-4" />;
    
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
    // Check if this is specifically a "Sandbox ended" message
    if (data.includes('Sandbox ended:')) {
      return 'Sandbox';
    }
    
    // Handle "result" type messages first
    if (data.includes('"type":"result"')) {
      return 'Session';
    }
    
    // Handle "end" type messages (these become "Sandbox ended" messages)
    if (data.includes('"type":"end"') || data.includes('"type": "end"')) {
      return 'Sandbox';
    }
    
    // Handle JSON updates first to check VibeKit update types
    try {
      const parsed = JSON.parse(data);
      
      // Check if this is an update message with end type in the data field
      if (parsed.type === 'update' && parsed.data && typeof parsed.data === 'string') {
        try {
          const innerParsed = JSON.parse(parsed.data);
          if (innerParsed.type === 'end') {
            return 'Sandbox';
          }
        } catch (e) {
          // Continue with outer parsing
        }
      }
      
      // Check if this is a session result message
      if (parsed.type === 'result') {
        return 'Session';
      }
      // Check if this is a tool result message
      if (parsed.type === 'user' && parsed.message?.content) {
        const hasToolResult = parsed.message.content.some((item: any) => item.type === 'tool_result');
        if (hasToolResult) {
          return 'Tool';
        }
      }
      // Check if this is a tool use message (but exclude TodoWrite)
      if (parsed.type === 'assistant' && parsed.message?.content) {
        const hasTools = parsed.message.content.some((item: any) => 
          item.type === 'tool_use' && item.name !== 'TodoWrite'
        );
        const hasText = parsed.message.content.some((item: any) => item.type === 'text');
        if (hasTools && !hasText) {
          return 'Tool';
        }
      }
      if (parsed.type === 'assistant') return 'Agent';
      if (parsed.type === 'system' && parsed.subtype === 'init') return 'Session';
      if (parsed.type === 'git') return 'Git';
      if (parsed.type === 'start') return 'Sandbox';
      if (parsed.type === 'container_created') return 'Container';
      if (parsed.type === 'image_pull') return 'Image';
      if (parsed.type === 'repository_clone') return 'Git';
    } catch (e) {
      // Not JSON, continue with text-based detection
    }
    
    // Check for Session started messages first
    if (data.toLowerCase().includes('session') && data.toLowerCase().includes('started')) {
      return 'Start';
    }
    
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
    
    // Check for Git-related messages (including exact VibeKit output)
    if (data.includes('Git:') || 
        data.includes('Cloning repository') || // Remove colon to match exact VibeKit output
        data.includes('Switching to branch') || 
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
    
    // Check for file operation messages
    if (data.startsWith('Reading file:') || data.startsWith('Read file:') || data.startsWith('Writing file:') || data.startsWith('Wrote file:')) {
      return 'Tool';
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

  const processEndMessage = (endData: any): string => {
    // If we have a sandbox_id, show it
    if (endData.sandbox_id) {
      return `Sandbox ended: ${endData.sandbox_id}`;
    }
    
    try {
      // Parse the output field which contains execution results
      let output;
      try {
        output = typeof endData.output === 'string' ? JSON.parse(endData.output) : endData.output;
      } catch (e) {
        console.warn('Failed to parse end message output:', e);
        return endData.sandbox_id ? `Sandbox ended: ${endData.sandbox_id}` : 'Session completed';
      }
      
      if (output && output.exitCode !== undefined) {
        const success = output.exitCode === 0;
        
        // Try to extract session results from stdout
        if (output.stdout && typeof output.stdout === 'string') {
          // Important: Split on actual newlines, not escaped \\n
          const lines = output.stdout.split('\n').filter((line: string) => line.trim());
          
          // Look for the final result line (contains session summary)
          let resultLine = null;
          for (const line of lines) {
            try {
              const lineData = JSON.parse(line);
              if (lineData.type === 'result') {
                resultLine = line;
                break;
              }
            } catch { 
              // Not a JSON line, skip
            }
          }
          
          if (resultLine) {
            try {
              const resultData = JSON.parse(resultLine);
              const duration = resultData.duration_ms ? `${Math.round(resultData.duration_ms / 1000)}s` : '';
              const cost = resultData.total_cost_usd ? `$${resultData.total_cost_usd.toFixed(4)}` : '';
              const turns = resultData.num_turns ? `${resultData.num_turns} turns` : '';
              
              // Extract token information from usage field
              let tokenInfo = '';
              if (resultData.usage) {
                const usage = resultData.usage;
                const totalTokens = (usage.input_tokens || 0) + 
                                   (usage.output_tokens || 0) + 
                                   (usage.cache_creation_input_tokens || 0) + 
                                   (usage.cache_read_input_tokens || 0);
                if (totalTokens > 0) {
                  tokenInfo = `${totalTokens.toLocaleString()} tokens`;
                }
              }
              
              // Try to extract meaningful task summary from result text
              let taskSummary = '';
              if (resultData.result && typeof resultData.result === 'string') {
                const result = resultData.result;
                
                // Look for completed tasks marked with ✅
                const completedMatch = result.match(/✅\s*\*\*([^*]+)\*\*/);
                if (completedMatch) {
                  taskSummary = completedMatch[1].trim();
                } else {
                  // Look for specific task descriptions
                  const taskPatterns = [
                    /Main Container \([^)]+\)/,
                    /implemented[^.!?]+(?:styling|styles|container)/i,
                    /completed[^.!?]+(?:styling|styles|implementation)/i,
                    /(?:CSS|styling|styles)[^.!?]+implemented/i
                  ];
                  
                  for (const pattern of taskPatterns) {
                    const match = result.match(pattern);
                    if (match) {
                      taskSummary = match[0].trim();
                      break;
                    }
                  }
                  
                  // If still no match, try to extract first meaningful line
                  if (!taskSummary) {
                    const lines = result.split('\n');
                    for (const line of lines) {
                      const trimmed = line.trim();
                      if (trimmed.startsWith('✅') || trimmed.includes('completed') || trimmed.includes('implemented')) {
                        // Extract the key part
                        taskSummary = trimmed.replace(/^[✅\s*]+/, '').substring(0, 60);
                        break;
                      }
                    }
                  }
                }
              }
              
              let summary = success ? 'Session completed' : '❌ Session failed';
              if (taskSummary) {
                summary += `: ${taskSummary}`;
              }
              
              const details = [duration, cost, turns, tokenInfo].filter(Boolean);
              if (details.length > 0) {
                summary += ` (${details.join(', ')})`;
              }
              
              return summary;
            } catch (e) {
              console.warn('Failed to parse result line:', e);
              // Fall through to simple success/failure
            }
          }
        }
        
        // Fallback - just show success or failure
        return success ? 'Session completed successfully' : '❌ Session failed';
      }
    } catch (e) {
      console.warn('Error processing end message:', e);
    }
    
    // Final fallback - check if we have sandbox_id anywhere in the data
    if (endData?.sandbox_id) {
      return `Sandbox ended: ${endData.sandbox_id}`;
    }
    
    return '🏁 Session ended';
  };

  const processLogMessage = (data: string, timestamp: number): string | React.ReactNode => {
    // Handle "result" type messages FIRST (they contain the metrics we want)
    if (data.includes('"type":"result"')) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === 'result') {
          const success = parsed.subtype === 'success';
          
          // Build the metrics array directly - no task description extraction
          const details = [];
          
          if (parsed.duration_ms) {
            details.push(`${Math.round(parsed.duration_ms / 1000)}s`);
          }
          
          if (parsed.total_cost_usd) {
            details.push(`$${parsed.total_cost_usd.toFixed(4)}`);
          }
          
          if (parsed.num_turns) {
            details.push(`${parsed.num_turns} turns`);
          }
          
          // Extract token information from usage field
          if (parsed.usage) {
            const usage = parsed.usage;
            const totalTokens = (usage.input_tokens || 0) + 
                               (usage.output_tokens || 0) + 
                               (usage.cache_creation_input_tokens || 0) + 
                               (usage.cache_read_input_tokens || 0);
            if (totalTokens > 0) {
              details.push(`${totalTokens.toLocaleString()} tokens`);
            }
          }
          
          // Build the summary without task description
          let summary = success ? 'Session completed' : '❌ Session failed';
          
          if (details.length > 0) {
            summary += `: ${details.join(', ')}`;
          }
          
          return summary;
        }
      } catch (e) {
        // Continue to other processing
      }
    }
    
    // Handle "end" type messages with proper error handling
    if (data.includes('"type":"end"') || data.includes('"type": "end"')) {
      try {
        const parsed = JSON.parse(data);
        
        // Check if this is an update message with nested end data
        if (parsed.type === 'update' && parsed.data && typeof parsed.data === 'string') {
          try {
            const endData = JSON.parse(parsed.data);
            if (endData.type === 'end' && endData.output) {
              return processEndMessage(endData);
            }
          } catch (e) {
            console.warn('Failed to parse nested end data:', e);
          }
        }
        // Direct end message
        else if (parsed.type === 'end' && parsed.output) {
          return processEndMessage(parsed);
        }
      } catch (parseError) {
        console.warn('Could not parse end message JSON:', parseError instanceof Error ? parseError.message : String(parseError));
        console.warn('Attempting fallback parsing for potentially truncated data...');
        
        // Fallback: Try to extract key metrics from the raw string using regex
        try {
          // Check if this looks like a truncated update message with end data
          if (data.includes('"type":"update"') && data.includes('"type": "end"')) {
            // Try to extract metrics directly from the string
            const exitCodeMatch = data.match(/exitCode["\s]*:\s*(\d+)/);
            const durationMatch = data.match(/duration_ms["\s]*:\s*(\d+)/);
            const costMatch = data.match(/total_cost_usd["\s]*:\s*([0-9.]+)/);
            const turnsMatch = data.match(/num_turns["\s]*:\s*(\d+)/);
            const inputTokensMatch = data.match(/input_tokens["\s]*:\s*(\d+)/);
            const outputTokensMatch = data.match(/output_tokens["\s]*:\s*(\d+)/);
            const cacheCreationMatch = data.match(/cache_creation_input_tokens["\s]*:\s*(\d+)/);
            const cacheReadMatch = data.match(/cache_read_input_tokens["\s]*:\s*(\d+)/);
            
            if (exitCodeMatch || durationMatch || costMatch || turnsMatch) {
              const success = exitCodeMatch ? parseInt(exitCodeMatch[1]) === 0 : true;
              
              const duration = durationMatch ? `${Math.round(parseInt(durationMatch[1]) / 1000)}s` : '';
              const cost = costMatch ? `$${parseFloat(costMatch[1]).toFixed(4)}` : '';
              const turns = turnsMatch ? `${turnsMatch[1]} turns` : '';
              
              let tokenInfo = '';
              const inputTokens = inputTokensMatch ? parseInt(inputTokensMatch[1]) : 0;
              const outputTokens = outputTokensMatch ? parseInt(outputTokensMatch[1]) : 0;
              const cacheCreation = cacheCreationMatch ? parseInt(cacheCreationMatch[1]) : 0;
              const cacheRead = cacheReadMatch ? parseInt(cacheReadMatch[1]) : 0;
              const totalTokens = inputTokens + outputTokens + cacheCreation + cacheRead;
              if (totalTokens > 0) {
                tokenInfo = `${totalTokens.toLocaleString()} tokens`;
              }
              
              // Try to extract task description
              let taskSummary = '';
              const mainContainerMatch = data.match(/Main Container[^"\\]*/);
              if (mainContainerMatch) {
                taskSummary = mainContainerMatch[0].substring(0, 50);
              }
              
              let summary = success ? 'Session completed' : '❌ Session failed';
              if (taskSummary) {
                summary += `: ${taskSummary}`;
              }
              
              const details = [duration, cost, turns, tokenInfo].filter(Boolean);
              if (details.length > 0) {
                summary += ` (${details.join(', ')})`;
              }
              
              console.log('✅ Fallback parsing successful:', summary);
              return summary;
            }
          }
        } catch (fallbackError) {
          console.warn('Fallback parsing also failed:', fallbackError);
        }
        
        // Check for sandbox_id in the raw data as last resort
        const sandboxIdMatch = data.match(/sandbox_id["\s]*:\s*["']([^"']+)["']/);
        if (sandboxIdMatch && sandboxIdMatch[1]) {
          return `Sandbox ended: ${sandboxIdMatch[1]}`;
        }
        
        return '🏁 Session ended';
      }
    }
    
    // Check for TodoWrite first before other JSON parsing
    const todos = parseTodoWriteFromMessage(data);
    if (todos) {
      // Defer the callback to avoid setState during render
      setTimeout(() => {
        if (onTodoUpdate) {
          onTodoUpdate(todos, timestamp);
        }
      }, 0);
      return <TodoListRenderer todos={todos} />;
    }
    
    // Try to parse as JSON for other VibeKit updates
    try {
      const parsed = JSON.parse(data);
      
      // Check if this is directly an "end" type message - skip it entirely
      if (parsed.type === 'end') {
        return null; // This will cause the log entry to not be rendered
      }
      
      // Check if this is an update message with a data field containing the inner JSON
      if (parsed.type === 'update' && parsed.data && typeof parsed.data === 'string') {
        try {
          const innerParsed = JSON.parse(parsed.data);
          
          // Check if the inner type is "end"
          if (innerParsed.type === 'end') {
            return processEndMessage(innerParsed);
          }
        } catch (e) {
          // Continue with normal processing if inner parsing fails
        }
      }
      
      
      // Format session result messages with summary
      if (parsed.type === 'result') {
        const subtype = parsed.subtype || 'unknown';
        const duration = parsed.duration_ms ? `${Math.round(parsed.duration_ms / 1000)}s` : '';
        const cost = parsed.total_cost_usd ? `$${parsed.total_cost_usd.toFixed(4)}` : '';
        const turns = parsed.num_turns ? `${parsed.num_turns} turns` : '';
        
        let summary = subtype === 'success' ? '✅ Execution completed' : '❌ Execution failed';
        
        const details = [duration, cost, turns].filter(Boolean);
        if (details.length > 0) {
          summary += ` (${details.join(', ')})`;
        }
        
        return summary;
      }
      
      // Format session end messages with summary - skip entirely  
      if (parsed.type === 'end') {
        return null; // Hide end messages completely
      }
      
      // Format tool result messages with summary instead of full content
      if (parsed.type === 'user' && parsed.message?.content) {
        const toolResults = parsed.message.content.filter((item: any) => item.type === 'tool_result');
        if (toolResults.length > 0) {
          const result = toolResults[0];
          const content = result.content || '';
          
          // Determine file type and create summary
          if (content.includes('→')) {
            // This looks like a file with line numbers
            const lines = content.split('\n').filter((line: string) => line.trim());
            return `File read successfully (${lines.length} lines)`;
          } else if (content.includes('Error:') || content.includes('error')) {
            return 'Tool execution failed';
          } else if (content.length > 100) {
            return `Tool completed successfully (${Math.round(content.length / 100)}00+ characters)`;
          } else {
            return 'Tool completed successfully';
          }
        }
      }
      
      // Format assistant messages to show the text content or tool use
      if (parsed.type === 'assistant') {
        if (parsed.message?.content) {
          const textContent = parsed.message.content
            .filter((item: any) => item.type === 'text')
            .map((item: any) => item.text)
            .join(' ');
          const toolUses = parsed.message.content
            .filter((item: any) => item.type === 'tool_use' && item.name !== 'TodoWrite');
          
          // If this has only non-TodoWrite tools (no text), format as tool use
          if (toolUses.length > 0 && !textContent) {
            return toolUses.map((tool: any) => {
              const toolName = tool.name || 'Unknown tool';
              const input = tool.input || {};
              
              // Format specific tool details
              switch (toolName) {
                case 'Read':
                  return `Read file: ${input.file_path || 'unknown file'}`;
                case 'Write':
                  return `Wrote file: ${input.file_path || 'unknown file'}`;
                case 'Edit':
                  return `Edited file: ${input.file_path || 'unknown file'}`;
                case 'MultiEdit':
                  return `Multi-edited file: ${input.file_path || 'unknown file'}`;
                case 'Bash':
                  return `Ran command: ${input.command || 'unknown command'}`;
                case 'Grep':
                  return `Searched for: ${input.pattern || 'unknown pattern'}`;
                case 'Glob':
                  return `Found files: ${input.pattern || 'unknown pattern'}`;
                case 'WebFetch':
                  return `Fetched URL: ${input.url || 'unknown URL'}`;
                default:
                  return `Used ${toolName}`;
              }
            }).join(', ');
          }
          
          // If this has text content, return styled React element for agent voice
          if (textContent) {
            return (
              <span className="italic text-[11px] text-muted-foreground">
                {textContent}
              </span>
            );
          }
        }
        // Fallback for assistant messages without recognizable content
        return 'Assistant message';
      }
      // Format system init messages with a nice summary
      else if (parsed.type === 'system' && parsed.subtype === 'init') {
        const model = parsed.model || 'Unknown';
        return `Session initialized with ${model}`;
      }
      // Format specific message types for better readability
      else if (parsed.type === 'git' && parsed.output) {
        return parsed.output; // Just "Cloning repository: joedanz/tictactoe"
      } else if (parsed.type === 'start' && parsed.sandbox_id) {
        return `Sandbox started: ${parsed.sandbox_id}`;
      } else if (parsed.stdout) {
        return parsed.stdout;
      } else if (parsed.stderr) {
        return parsed.stderr;
      } else {
        // For other JSON, show the raw JSON exactly as emitted
        return JSON.stringify(parsed);
      }
    } catch (e) {
      // Not JSON, process as regular text
    }
    
    // Check for PR links and render them as clickable links
    const prMatch = data.match(/Pull request #(\d+) created successfully: (https:\/\/github\.com\/[^\s]+)/);
    if (prMatch) {
      const prNumber = prMatch[1];
      const prUrl = prMatch[2];
      return (
        <span>
          Pull request{' '}
          <a 
            href={prUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 underline font-medium"
          >
            #{prNumber}
          </a>
          {' '}created successfully
        </span>
      );
    }
    
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
    <div className={cn("flex flex-col h-full", className)}>
      {logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Terminal className="h-8 w-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">Waiting for logs...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Fixed Header */}
          <div className="flex-shrink-0 border-b bg-muted/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Time</TableHead>
                  <TableHead className="w-[100px]">Type</TableHead>
                  <TableHead>Message</TableHead>
                </TableRow>
              </TableHeader>
            </Table>
          </div>
          
          {/* Scrollable Body */}
          <div 
            ref={scrollAreaRef}
            className="flex-1 overflow-auto min-h-0"
            onMouseEnter={() => { shouldAutoScroll.current = false; }}
            onMouseLeave={() => { shouldAutoScroll.current = true; }}
            style={{ maxHeight: '30vh' }}
          >
            <Table>
              <TableBody>
            {logs.map((log, index) => {
              const icon = getLogIcon(log.type, log.data);
              const typeColor = getLogTypeColor(log.type);
              const processedMessage = processLogMessage(log.data, log.timestamp);
              
              // Skip rendering this log entry if processedMessage is null
              if (processedMessage === null) {
                return null;
              }
              
              return (
                <TableRow key={index} className="group hover:bg-muted/50">
                  <TableCell className="w-[120px] font-mono text-xs text-muted-foreground" title={dayjs(log.timestamp).format('LLLL')}>
                    {formatTimestamp(log.timestamp, true)}
                  </TableCell>
                  <TableCell className="w-[100px]">
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
                      {typeof processedMessage === 'string' && log.type === 'command' && !processedMessage.startsWith('$') && !processedMessage.startsWith('Tool:') && (
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
          </div>
        </>
      )}
    </div>
  );
}