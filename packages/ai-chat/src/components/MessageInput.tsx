'use client';

import React, { useState, useRef, KeyboardEvent } from 'react';
import { Send, Paperclip, Square } from 'lucide-react';
import { cn } from '../utils/cn';

interface MessageInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
  maxLength?: number;
}

export function MessageInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isLoading = false,
  placeholder = 'Type a message...',
  className,
  maxLength = 4000,
}: MessageInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !isLoading) {
        onSubmit();
      }
    }
  };

  const handleSubmit = () => {
    if (value.trim() && !isLoading) {
      onSubmit();
    }
  };

  const handleStop = () => {
    if (onStop) {
      onStop();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Handle file drop here if needed
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      console.log('Files dropped:', files);
      // TODO: Handle file upload
    }
  };

  // Auto-resize textarea
  React.useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [value]);

  return (
    <div
      className={cn(
        'relative flex items-end gap-2 border-t bg-background p-4',
        isDragging && 'ring-2 ring-primary ring-offset-2',
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex-1 relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={isLoading}
          className={cn(
            'w-full resize-none rounded-lg border bg-background px-4 py-2 pr-12',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-primary',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'min-h-[44px] max-h-[200px]'
          )}
          rows={1}
        />
        
        <div className="absolute bottom-2 right-2 flex items-center gap-1">
          <button
            type="button"
            className={cn(
              'rounded-md p-1.5 text-muted-foreground transition-colors',
              'hover:bg-muted hover:text-foreground',
              'disabled:cursor-not-allowed disabled:opacity-50'
            )}
            disabled={isLoading}
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <button
          type="button"
          onClick={handleStop}
          className={cn(
            'rounded-lg bg-destructive p-2.5 text-destructive-foreground',
            'transition-colors hover:bg-destructive/90',
            'focus:outline-none focus:ring-2 focus:ring-destructive'
          )}
          title="Stop generating"
        >
          <Square className="h-4 w-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading}
          className={cn(
            'rounded-lg bg-primary p-2.5 text-primary-foreground',
            'transition-colors hover:bg-primary/90',
            'focus:outline-none focus:ring-2 focus:ring-primary',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
          title="Send message"
        >
          <Send className="h-4 w-4" />
        </button>
      )}

      {maxLength && (
        <div className="absolute bottom-1 left-4 text-xs text-muted-foreground">
          {value.length} / {maxLength}
        </div>
      )}
    </div>
  );
}