import { useState, useEffect, useRef, useCallback } from 'react';
import { LogEntry, SessionMetadata } from './use-session-logs';

interface UseRealtimeSessionLogsOptions {
  enabled?: boolean;
}

interface UseRealtimeSessionLogsReturn {
  logs: LogEntry[];
  metadata: SessionMetadata | null;
  isLoading: boolean;
  error: string | null;
  isLive: boolean;
  isConnected: boolean;
}

export function useRealtimeSessionLogs(
  sessionId: string | null,
  options: UseRealtimeSessionLogsOptions = {}
): UseRealtimeSessionLogsReturn {
  const { enabled = true } = options;
  
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [metadata, setMetadata] = useState<SessionMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isConnectingRef = useRef(false);
  
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    isConnectingRef.current = false;
    setIsConnected(false);
    setIsLive(false);
  }, []);
  
  const connect = useCallback(() => {
    if (!sessionId || !enabled) {
      return;
    }
    
    // Prevent duplicate connections
    if (isConnectingRef.current || eventSourceRef.current) {
      console.log('SSE connection already exists or is connecting, skipping...');
      return;
    }
    
    isConnectingRef.current = true;
    
    // Clean up any existing connection
    cleanup();
    
    setIsLoading(true);
    setError(null);
    
    // Create new EventSource connection
    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
    eventSourceRef.current = eventSource;
    
    eventSource.onopen = () => {
      console.log('SSE connection opened for session:', sessionId);
      isConnectingRef.current = false;
      setIsConnected(true);
      setIsLoading(false);
      reconnectAttemptsRef.current = 0;
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'connected':
            console.log('Connected to session stream:', data.sessionId);
            break;
            
          case 'metadata':
            setMetadata(data.metadata);
            setIsLive(data.metadata.status === 'running');
            break;
            
          case 'logs':
            console.log(`[SSE] Received ${data.logs.length} logs`);
            if (data.incremental) {
              // Append new logs
              setLogs(prev => [...prev, ...data.logs]);
            } else {
              // Replace all logs (initial load)
              setLogs(data.logs);
            }
            break;
            
          case 'completed':
            console.log('Session completed with exit code:', data.exitCode);
            setIsLive(false);
            break;
            
          default:
            console.log('Unknown SSE message type:', data.type);
        }
      } catch (err) {
        console.error('Failed to parse SSE message:', err, event.data);
      }
    };
    
    eventSource.onerror = (err) => {
      console.error('SSE connection error:', err);
      isConnectingRef.current = false;
      setIsConnected(false);
      
      // Attempt to reconnect with exponential backoff
      if (reconnectAttemptsRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})...`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connect();
        }, delay);
      } else {
        setError('Connection lost. Please refresh the page.');
        setIsLoading(false);
        cleanup();
      }
    };
  }, [sessionId, enabled, cleanup]);
  
  // Connect when session ID changes
  useEffect(() => {
    if (!sessionId || !enabled) {
      setLogs([]);
      setMetadata(null);
      setError(null);
      cleanup();
      return;
    }
    
    connect();
    
    return () => {
      cleanup();
    };
  }, [sessionId, enabled]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
  return {
    logs,
    metadata,
    isLoading,
    error,
    isLive,
    isConnected
  };
}