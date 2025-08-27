"use client";

import React, { useEffect, useRef, useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { DevServerLog } from '@/lib/preview/types';

interface TerminalOutputProps {
  logs: DevServerLog[];
  isConnected: boolean;
  height?: number;
  className?: string;
}

export function TerminalOutput({ 
  logs, 
  isConnected, 
  height = 400,
  className = '' 
}: TerminalOutputProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Check if user has scrolled away from bottom
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement;
    const isAtBottom = target.scrollTop + target.clientHeight >= target.scrollHeight - 50;
    setAutoScroll(isAtBottom);
  };

  const getLogTypeStyle = (type: DevServerLog['type']) => {
    switch (type) {
      case 'stderr':
        return 'text-red-400';
      case 'system':
        return 'text-blue-400';
      default:
        return 'text-gray-300';
    }
  };

  const getLogTypePrefix = (type: DevServerLog['type']) => {
    switch (type) {
      case 'stderr':
        return '[ERROR]';
      case 'system':
        return '[SYSTEM]';
      default:
        return '[INFO]';
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className={`bg-black text-green-400 font-mono text-sm relative ${className}`}>
      {/* Connection status */}
      <div className="absolute top-2 right-2 z-10">
        <Badge 
          variant={isConnected ? 'default' : 'secondary'}
          className={isConnected ? 'bg-green-600' : 'bg-gray-600'}
        >
          {isConnected ? 'Running' : 'Stopped'}
        </Badge>
      </div>

      {/* Terminal content */}
      <ScrollArea 
        className="w-full" 
        style={{ height }}
        onScrollCapture={handleScroll}
      >
        <div ref={scrollRef} className="p-4 space-y-1">
          {logs.length === 0 ? (
            <div className="text-gray-500 italic">
              {isConnected ? 'Waiting for output...' : 'Dev server not running'}
            </div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="flex gap-2 leading-relaxed">
                <span className="text-gray-500 shrink-0 w-20 text-xs">
                  {formatTimestamp(log.timestamp)}
                </span>
                <span className={`shrink-0 w-16 text-xs ${getLogTypeStyle(log.type)}`}>
                  {getLogTypePrefix(log.type)}
                </span>
                <span className="break-words whitespace-pre-wrap">
                  {log.message}
                </span>
              </div>
            ))
          )}
          
          {/* Cursor indicator when connected */}
          {isConnected && (
            <div className="flex gap-2">
              <span className="text-gray-500 shrink-0 w-20 text-xs">
                {formatTimestamp(new Date())}
              </span>
              <span className="text-green-400 animate-pulse">$</span>
              <span className="w-2 h-4 bg-green-400 animate-pulse"></span>
            </div>
          )}
          
          {/* Auto-scroll indicator */}
          {!autoScroll && logs.length > 0 && (
            <div className="sticky bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm p-2 text-center">
              <button
                onClick={() => {
                  setAutoScroll(true);
                  if (scrollRef.current) {
                    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                  }
                }}
                className="text-xs text-blue-400 hover:text-blue-300 underline"
              >
                New messages below • Click to scroll to bottom
              </button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}