'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChatSession } from '../types';

interface UseChatStorageOptions {
  api?: string;
  autoLoad?: boolean;
}

export function useChatStorage(options: UseChatStorageOptions = {}) {
  const { api = '/api/chat', autoLoad = true } = options;
  
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const listSessions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${api}/sessions`);
      
      if (!response.ok) {
        throw new Error('Failed to list sessions');
      }
      
      const data = await response.json();
      setSessions(data);
      return data;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('Failed to list sessions:', error);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const createSession = useCallback(async (title?: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${api}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: title || `Chat ${new Date().toLocaleDateString()}` 
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create session');
      }
      
      const session = await response.json();
      setSessions((prev) => [session, ...prev]);
      setCurrentSession(session);
      return session;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('Failed to create session:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const loadSession = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${api}/sessions/${id}`);
      
      if (!response.ok) {
        throw new Error('Failed to load session');
      }
      
      const session = await response.json();
      setCurrentSession(session);
      return session;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('Failed to load session:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [api]);

  const deleteSession = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${api}/sessions/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete session');
      }
      
      setSessions((prev) => prev.filter((s) => s.id !== id));
      
      if (currentSession?.id === id) {
        setCurrentSession(null);
      }
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('Failed to delete session:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [api, currentSession]);

  const renameSession = useCallback(async (id: string, title: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${api}/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to rename session');
      }
      
      const updatedSession = await response.json();
      
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? updatedSession : s))
      );
      
      if (currentSession?.id === id) {
        setCurrentSession(updatedSession);
      }
      
      return updatedSession;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('Failed to rename session:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [api, currentSession]);

  const clearSession = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${api}/sessions/${id}/clear`, {
        method: 'POST',
      });
      
      if (!response.ok) {
        throw new Error('Failed to clear session');
      }
      
      const clearedSession = await response.json();
      
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? clearedSession : s))
      );
      
      if (currentSession?.id === id) {
        setCurrentSession(clearedSession);
      }
      
      return clearedSession;
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('Failed to clear session:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [api, currentSession]);

  // Auto-load sessions on mount
  useEffect(() => {
    if (autoLoad) {
      listSessions();
    }
  }, [autoLoad, listSessions]);

  return {
    // Data
    sessions,
    currentSession,
    
    // State
    isLoading,
    error,
    
    // Actions
    listSessions,
    createSession,
    loadSession,
    deleteSession,
    renameSession,
    clearSession,
  };
}