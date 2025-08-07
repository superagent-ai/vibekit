'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useChat as useAIChat } from '@ai-sdk/react';
import { ChatMessage } from '../types';

interface UseChatOptions {
  sessionId?: string;
  api?: string;
  onError?: (error: Error) => void;
  onFinish?: (message: ChatMessage) => void;
}

export function useChat(options: UseChatOptions = {}): {
  sessionId: string | undefined;
  createNewSession: () => Promise<any>;
  loadSession: (id: string) => Promise<any>;
  deleteSession: (id: string) => Promise<void>;
  messages: ChatMessage[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  isLoading: boolean;
  error: Error | undefined;
  stop: () => void;
  reload: any;
  append: any;
} {
  const {
    sessionId: initialSessionId,
    api = '/api/chat',
    onError,
    onFinish,
  } = options;

  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [input, setInput] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    messages,
    submit,
    isLoading,
    error,
    setMessages,
    stop: aiStop,
    regenerate,
    sendMessage,
  } = useAIChat({
    api,
    body: {
      sessionId,
    },
    onError: (error) => {
      console.error('Chat error:', error);
      onError?.(error);
    },
    onFinish: ({ message }) => {
      if (message) {
        const chatMessage: ChatMessage = {
          role: message.role as any,
          content: typeof message.content === 'string' ? message.content : '',
          timestamp: new Date().toISOString(),
        };
        onFinish?.(chatMessage);
      }
    },
  });

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const createNewSession = useCallback(async () => {
    try {
      const response = await fetch(`${api}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: `Chat ${new Date().toLocaleDateString()}` 
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to create session');
      }
      
      const session = await response.json();
      setSessionId(session.id);
      setMessages([]);
      return session;
    } catch (error) {
      console.error('Failed to create session:', error);
      onError?.(error as Error);
    }
  }, [api, setMessages, onError]);

  const loadSession = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${api}/sessions/${id}`);
      
      if (!response.ok) {
        throw new Error('Failed to load session');
      }
      
      const session = await response.json();
      setSessionId(session.id);
      setMessages(session.messages || []);
      return session;
    } catch (error) {
      console.error('Failed to load session:', error);
      onError?.(error as Error);
    }
  }, [api, setMessages, onError]);

  const deleteSession = useCallback(async (id: string) => {
    try {
      const response = await fetch(`${api}/sessions/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete session');
      }
      
      if (id === sessionId) {
        setSessionId(undefined);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      onError?.(error as Error);
    }
  }, [api, sessionId, setMessages, onError]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!sessionId) {
      console.error('No session ID available');
      return;
    }
    
    if (!input.trim()) {
      return;
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    
    // Send the message using the new API
    await sendMessage({
      role: 'user',
      content: input,
    });
    
    // Clear the input after sending
    setInput('');
  }, [sessionId, input, sendMessage]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    aiStop();
  }, [aiStop]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    // Session management
    sessionId,
    createNewSession,
    loadSession,
    deleteSession,
    
    // Message handling
    messages: messages.map(msg => ({
      id: msg.id,
      role: msg.role as any,
      content: typeof msg.content === 'string' ? msg.content : '',
      timestamp: new Date().toISOString(),
    })) as ChatMessage[],
    input,
    handleInputChange,
    handleSubmit,
    
    // State
    isLoading,
    error,
    
    // Actions
    stop,
    reload: regenerate,
    append: sendMessage,
  };
}