import { useState, useEffect, useRef } from 'react';

export interface LogEntry {
  timestamp: number;
  type: 'update' | 'stdout' | 'stderr' | 'error' | 'command' | 'info' | 'start' | 'end';
  data: string;
  metadata?: any;
}

export interface SessionMetadata {
  sessionId: string;
  agentName: string;
  projectId?: string;
  projectRoot?: string;
  taskId?: string;
  taskTitle?: string;
  startTime: number;
  endTime?: number;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
}

interface UseSessionLogsOptions {
  pollingInterval?: number;  // ms between polls (default: 500ms)
  enabled?: boolean;          // Whether to poll for updates
}

interface UseSessionLogsReturn {
  logs: LogEntry[];
  metadata: SessionMetadata | null;
  isLoading: boolean;
  error: string | null;
  isLive: boolean;  // Whether session is still running
}

export function useSessionLogs(
  sessionId: string | null,
  options: UseSessionLogsOptions = {}
): UseSessionLogsReturn {
  const { pollingInterval = 500, enabled = true } = options;
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  
  const nextLineRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initial load
  useEffect(() => {
    if (!sessionId || !enabled) {
      setLogs([]);
      setMetadata(null);
      setError(null);
      return;
    }
    
    const loadInitialData = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/sessions/${sessionId}/logs`);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load session');
        }
        
        setLogs(data.logs);
        setMetadata(data.metadata);
        nextLineRef.current = data.totalLines;
        setIsLive(data.metadata.status === 'running');
      } catch (err: any) {
        setError(err.message);
        console.error('Failed to load session logs:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadInitialData();
  }, [sessionId, enabled]);
  
  // Polling for updates
  useEffect(() => {
    if (!sessionId || !enabled || !isLive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    
    const pollForUpdates = async () => {
      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/logs?tail=true&from=${nextLineRef.current}`
        );
        const data = await response.json();
        
        if (!response.ok) {
          console.error('Failed to tail logs:', data.error);
          return;
        }
        
        if (data.logs.length > 0) {
          setLogs(prev => [...prev, ...data.logs]);
          nextLineRef.current = data.nextLine;
          
          // Check if session ended
          const endLog = data.logs.find((log: LogEntry) => log.type === 'end');
          if (endLog) {
            setIsLive(false);
            
            // Fetch final metadata
            const metaResponse = await fetch(`/api/sessions/${sessionId}/logs`);
            const metaData = await metaResponse.json();
            if (metaData.success) {
              setMetadata(metaData.metadata);
            }
          }
        }
      } catch (err) {
        console.error('Failed to poll for updates:', err);
      }
    };
    
    // Start polling
    intervalRef.current = setInterval(pollForUpdates, pollingInterval);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, enabled, isLive, pollingInterval]);
  
  return {
    logs,
    metadata,
    isLoading,
    error,
    isLive
  };
}

// Helper function to format log entry for display
export function formatLogEntry(entry: LogEntry): string {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const prefix = `[${time}] [${entry.type.toUpperCase()}]`;
  
  if (entry.type === 'command' && entry.metadata?.command) {
    return `${prefix} Command: ${entry.data}`;
  }
  
  return `${prefix} ${entry.data}`;
}

// Helper function to get log entry color based on type
export function getLogEntryColor(type: LogEntry['type']): string {
  switch (type) {
    case 'error':
      return 'text-red-600';
    case 'stderr':
      return 'text-orange-600';
    case 'command':
      return 'text-blue-600';
    case 'info':
      return 'text-green-600';
    case 'start':
    case 'end':
      return 'text-purple-600';
    default:
      return 'text-gray-700';
  }
}