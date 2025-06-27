"use client";

import { useRef, useState, useEffect, forwardRef } from "react";
import { Mic, Send, Square, Loader2, Paperclip, AtSign, Slash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModeSelector } from "@/components/ui/mode-selector";
import { cn } from "@/lib/utils";

interface TaskInputProps {
  value?: string;
  onChange?: (value: string) => void;
  onSubmit: (value: string, mode: "ask" | "code") => void;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  isLoading?: boolean;
  isRunning?: boolean;
  className?: string;
  showModeSelector?: boolean;
  showAttachment?: boolean;
  showCommands?: boolean;
  autoResize?: boolean;
  minHeight?: number;
  maxHeight?: number;
}

export const TaskInput = forwardRef<HTMLTextAreaElement, TaskInputProps>(({
  value: propValue,
  onChange,
  onSubmit,
  onStop,
  placeholder = "Start a new task...",
  disabled = false,
  isLoading = false,
  isRunning = false,
  className,
  showModeSelector = true,
  showAttachment = true,
  showCommands = true,
  autoResize = true,
  minHeight = 48,
  maxHeight = 120,
}, ref) => {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = (ref as any) || internalRef;
  
  const [internalValue, setInternalValue] = useState("");
  const [mode, setMode] = useState<"ask" | "code">("ask");
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [commandType, setCommandType] = useState<'slash' | 'at' | null>(null);

  // Use prop value if controlled, otherwise use internal state
  const value = propValue !== undefined ? propValue : internalValue;
  const setValue = (val: string) => {
    if (onChange) {
      onChange(val);
    } else {
      setInternalValue(val);
    }
  };

  const canSubmit = !isRunning && value.trim().length > 0 && !disabled;

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea && autoResize) {
      textarea.style.height = `${minHeight}px`;
      const scrollHeight = textarea.scrollHeight;
      textarea.style.height = `${Math.min(maxHeight, Math.max(minHeight, scrollHeight))}px`;
    }
  };

  const handleSubmit = () => {
    if (!canSubmit || isLoading) return;
    onSubmit(value, mode);
    setValue("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        handleSubmit();
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setValue(val);
    
    if (showCommands) {
      const lastChar = val.slice(-1);
      if (lastChar === '/' || lastChar === '@') {
        setShowCommandMenu(true);
        setCommandType(lastChar === '/' ? 'slash' : 'at');
      } else if (showCommandMenu && val.length === 0) {
        setShowCommandMenu(false);
        setCommandType(null);
      }
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <div className={cn(
      "bg-background border border-blue-500/20 rounded-full px-5 py-3",
      "shadow-xl shadow-blue-500/15 hover:shadow-2xl hover:shadow-blue-500/25",
      "hover:border-blue-500/30 transition-all duration-300 backdrop-blur-sm",
      "relative z-50", // High z-index to ensure tooltips appear above
      className
    )}>
      <div className="flex items-center gap-2">
        {showAttachment && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-full hover:bg-muted"
            disabled={isRunning || disabled}
            title="Attach file"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        )}
        
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyPress={handleKeyPress}
          placeholder={
            isRunning 
              ? "Task is running... Stop to send a new message" 
              : placeholder + (showCommands ? " • Use @ or / for commands" : "")
          }
          disabled={isRunning || disabled}
          className={cn(
            "flex-1 resize-none border-none p-2 focus:outline-none",
            "focus:border-transparent overflow-y-auto bg-transparent",
            `min-h-[${minHeight}px] max-h-[${maxHeight}px]`,
            (isRunning || disabled) && "opacity-50 cursor-not-allowed"
          )}
        />
        
        <div className="flex items-center gap-1 pb-1">
          {showModeSelector && !isRunning && (
            <div className="relative z-[60]"> {/* Higher z-index for mode selector */}
              <ModeSelector
                mode={mode}
                onModeChange={setMode}
                size="sm"
              />
            </div>
          )}

          {isRunning && onStop ? (
            <Button
              onClick={onStop}
              size="sm"
              variant="destructive"
              className="h-8 w-8 rounded-full p-0"
              title="Stop task"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canSubmit || isLoading}
              size="sm"
              className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full"
              title="Send message"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Send className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </div>
      
      {/* Command menu would go here if implemented */}
    </div>
  );
});

TaskInput.displayName = "TaskInput";