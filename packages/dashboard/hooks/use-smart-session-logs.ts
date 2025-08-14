import { useState, useEffect, useRef, useCallback } from 'react';
import { LogEntry, SessionMetadata } from './use-session-logs';
import { useSessionLogs } from './use-session-logs';
import { useRealtimeSessionLogs } from './use-realtime-session-logs';

interface UseSmartSessionLogsOptions {
  enabled?: boolean;
}

interface UseSmartSessionLogsReturn {
  logs: LogEntry[];
  metadata: SessionMetadata | null;
  isLoading: boolean;
  error: string | null;
  isLive: boolean;
  isConnected: boolean;
  loadingStrategy: 'static' | 'hybrid' | 'unknown';
}

export function useSmartSessionLogs(
  sessionId: string | null,
  options: UseSmartSessionLogsOptions = {}
): UseSmartSessionLogsReturn {
  const { enabled = true } = options;
  
  
  const [loadingStrategy, setLoadingStrategy] = useState<'static' | 'hybrid' | 'unknown'>('unknown');
  const [sessionMetadata, setSessionMetadata] = useState<SessionMetadata | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  
  // Static loading for completed sessions
  const staticData = useSessionLogs(sessionId, { 
    enabled: enabled && loadingStrategy === 'static'
  });
  
  
  // Hybrid loading for running sessions (loads initial data, then streams)
  const realtimeData = useRealtimeSessionLogs(sessionId, { 
    enabled: enabled && loadingStrategy === 'hybrid'
  });
  
  // Fetch initial metadata to determine loading strategy
  const fetchMetadata = useCallback(async () => {
    if (!sessionId || !enabled) {
      setLoadingStrategy('unknown');
      return;
    }
    
    setMetadataLoading(true);
    setMetadataError(null);
    
    try {
      const response = await fetch(`/api/sessions/${sessionId}/metadata`);
      if (!response.ok) {
        throw new Error(`Failed to fetch metadata: ${response.statusText}`);
      }
      
      const metadata: SessionMetadata = await response.json();
      setSessionMetadata(metadata);
      
      // Determine loading strategy based on session status
      if (metadata.status === 'running') {
        setLoadingStrategy('hybrid');
      } else {
        setLoadingStrategy('static');
      }
    } catch (error: any) {
      console.error(`[SmartLogs] Failed to fetch metadata for session ${sessionId}:`, error);
      setMetadataError(error.message);
      // Fallback to static loading if metadata fetch fails
      setLoadingStrategy('static');
    } finally {
      setMetadataLoading(false);
    }
  }, [sessionId, enabled]);
  
  // Fetch metadata when session ID changes
  useEffect(() => {
    if (!sessionId || !enabled) {
      setLoadingStrategy('unknown');
      setSessionMetadata(null);
      setMetadataError(null);
      return;
    }
    
    fetchMetadata();
  }, [sessionId, enabled, fetchMetadata]);
  
  // Monitor running sessions for completion
  useEffect(() => {
    if (loadingStrategy === 'hybrid' && realtimeData.metadata?.status !== 'running') {
      // Session completed during streaming, switch to static mode
      setLoadingStrategy('static');
    }
  }, [loadingStrategy, sessionId, realtimeData.metadata?.status]);
  
  // Return the appropriate data based on loading strategy
  if (loadingStrategy === 'unknown' || metadataLoading) {
    return {
      logs: [],
      metadata: sessionMetadata,
      isLoading: true,
      error: metadataError,
      isLive: false,
      isConnected: false,
      loadingStrategy
    };
  }
  
  if (loadingStrategy === 'static') {
    return {
      ...staticData,
      isConnected: false,
      loadingStrategy,
      metadata: sessionMetadata || staticData.metadata
    };
  }
  
  // Hybrid mode
  return {
    ...realtimeData,
    loadingStrategy,
    metadata: sessionMetadata || realtimeData.metadata
  };
}