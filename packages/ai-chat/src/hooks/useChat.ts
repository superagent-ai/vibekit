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

export function useChat(options: UseChatOptions = {}) {
  const {
    sessionId: initialSessionId,
    api = '/api/chat',
    onError,
    onFinish,
  } = options;

  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const [input, setInput] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use the AI SDK's useChat hook
  const aiChatResult = useAIChat({
    api,
    onError: (error: Error) => {
      console.error('Chat error:', error);
      onError?.(error);
    },
    onFinish: (data: any) => {
      if (data?.message) {
        const msg = data.message as any;
        const chatMessage: ChatMessage = {
          role: msg.role as any,
          content: msg.content && typeof msg.content === 'string' 
            ? msg.content 
            : '',
          timestamp: new Date().toISOString(),
        };
        onFinish?.(chatMessage);
      }
    },
  } as any);
  
  // Debug: Log what we got from useAIChat
  console.log('AI Chat Result:', aiChatResult);

  // Extract properties with defaults for those that might not exist
  const {
    messages = [],
    error,
    setMessages,
    stop: aiStop,
  } = aiChatResult;

  // These properties exist on the latest AI SDK
  const append = (aiChatResult as any).append;
  const reload = (aiChatResult as any).reload;
  const isLoading = (aiChatResult as any).isLoading ?? false;
  const sendMessage = (aiChatResult as any).sendMessage;
  const status = (aiChatResult as any).status ?? 'ready';
  
  // Check what's actually available
  if (typeof window !== 'undefined') {
    console.log('Available methods:', {
      append: typeof append,
      sendMessage: typeof sendMessage,
      reload: typeof reload,
      status,
      appendFunc: append?.toString?.().substring(0, 100),
    });
  }
  
  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
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

  // Wrap handleSubmit to send message
  const handleSubmit = useCallback(async (e?: React.FormEvent, options?: { body?: any }) => {
    if (e) {
      e.preventDefault();
    }
    
    if (!input.trim()) {
      return;
    }
    
    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    
    // Prepare body with additional options
    const body: any = { ...options?.body };
    if (sessionId) {
      body.sessionId = sessionId;
    }
    
    // Try to send the message using available methods
    if (sendMessage && typeof sendMessage === 'function') {
      // AI SDK v3+ uses sendMessage
      try {
        sendMessage(input, { body });
        setInput('');
      } catch (error) {
        console.error('sendMessage failed:', error);
      }
    } else if (append && typeof append === 'function') {
      // Fallback to append - it might expect different formats
      try {
        // The append function signature varies - try the most common format
        // append(message, options)
        append({
          role: 'user',
          content: input
        }, { 
          options: { body }
        });
        setInput('');
      } catch (error) {
        console.error('append failed:', error);
        onError?.(error as Error);
      }
    } else {
      console.error('No send method available:', {
        hasSendMessage: !!sendMessage,
        hasAppend: !!append,
        typeOfSendMessage: typeof sendMessage,
        typeOfAppend: typeof append,
      });
    }
  }, [sessionId, input, sendMessage, append]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (aiStop) {
      aiStop();
    }
  }, [aiStop]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Convert messages to ChatMessage format
  // Handle UIMessage format where content might be in parts
  const chatMessages: ChatMessage[] = messages.map((msg: any) => {
    let content = '';
    
    // Try to get content from the message
    if (msg.content && typeof msg.content === 'string') {
      content = msg.content;
    } else if (msg.parts && Array.isArray(msg.parts)) {
      // Extract text from parts
      content = msg.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join('');
    }
    
    return {
      id: msg.id,
      role: msg.role as any,
      content,
      timestamp: new Date().toISOString(),
    };
  });

  return {
    // Session management
    sessionId,
    createNewSession,
    loadSession,
    deleteSession,
    
    // Message handling
    messages: chatMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    
    // State
    isLoading,
    error,
    status,
    
    // Actions
    stop,
    reload,
    append,
  };
}