"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CommandPalette, type CommandItem } from "@/components/ui/command-palette";
import type { ChatInputProps } from "./types";

export function ChatInput({
  value,
  onChange,
  onSubmit,
  placeholder = "What would you like to build?",
  autoResize = true,
  enableCommandPalette = true,
  isLoading = false,
  className,
  minHeight = "100px",
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [commandTrigger, setCommandTrigger] = useState<"@" | "/" | null>(null);
  const [commandSearch, setCommandSearch] = useState("");
  const [commandPosition, setCommandPosition] = useState({ top: 0, left: 0 });
  const [cursorPosition, setCursorPosition] = useState(0);

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    if (!autoResize || !textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const minHeightNum = parseInt(minHeight);
    textarea.style.height = minHeight; // Reset to min height
    textarea.style.height = Math.max(minHeightNum, textarea.scrollHeight) + "px";
  }, [autoResize, minHeight]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const newCursorPosition = e.target.selectionStart;
    setCursorPosition(newCursorPosition);

    // Command palette logic
    if (enableCommandPalette) {
      const lastChar = newValue[newCursorPosition - 1];
      const prevChar = newValue[newCursorPosition - 2];
      
      if ((lastChar === "@" || lastChar === "/") && (!prevChar || prevChar === " " || prevChar === "\n")) {
        setCommandTrigger(lastChar as "@" | "/");
        setCommandSearch("");
        
        // Calculate position for command palette
        if (textareaRef.current) {
          const textarea = textareaRef.current;
          const rect = textarea.getBoundingClientRect();
          const windowHeight = window.innerHeight;
          const spaceBelow = windowHeight - rect.bottom;
          const menuHeight = 300; // Approximate height of command palette
          
          // Position above if not enough space below
          const position = {
            top: spaceBelow < menuHeight ? rect.top - menuHeight - 10 : rect.bottom + 10,
            left: rect.left,
          };
          setCommandPosition(position);
        }
      } else if (commandTrigger) {
        // Update search or close palette
        const triggerIndex = newValue.lastIndexOf(commandTrigger, newCursorPosition);
        if (triggerIndex !== -1 && triggerIndex <= newCursorPosition) {
          // Check if we're still right after the trigger or have some search text
          if (triggerIndex === newCursorPosition - 1) {
            // Cursor is right after trigger, keep palette open with empty search
            setCommandSearch("");
          } else {
            const searchText = newValue.substring(triggerIndex + 1, newCursorPosition);
            if (searchText.includes(" ")) {
              setCommandTrigger(null);
            } else {
              setCommandSearch(searchText);
            }
          }
        } else {
          // Trigger character was deleted or cursor moved away
          setCommandTrigger(null);
          setCommandSearch("");
        }
      }
    }

    onChange(newValue);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const handleCommandSelect = (item: CommandItem) => {
    if (!textareaRef.current || !commandTrigger) return;

    const currentValue = textareaRef.current.value;
    const beforeTrigger = currentValue.substring(0, currentValue.lastIndexOf(commandTrigger));
    const afterCursor = currentValue.substring(cursorPosition);
    
    let insertText = "";
    if (commandTrigger === "@") {
      // Insert file reference
      insertText = item.path || item.name;
    } else if (commandTrigger === "/") {
      // Insert prompt content
      insertText = item.content || item.name;
    }
    
    const newValue = beforeTrigger + insertText + " " + afterCursor;
    onChange(newValue);
    
    // Reset command palette
    setCommandTrigger(null);
    setCommandSearch("");
    
    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
      const newCursorPos = beforeTrigger.length + insertText.length + 1;
      textareaRef.current?.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        className={cn(
          "w-full max-h-[300px] p-3 resize-none",
          "bg-background border-0 outline-none ring-0",
          "text-base placeholder:text-muted-foreground",
          "focus:outline-none focus:ring-0",
          isLoading && "opacity-50 cursor-not-allowed",
          className
        )}
        style={{ 
          minHeight,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(155, 155, 155, 0.5) transparent'
        }}
      />

      {/* Command Palette */}
      {enableCommandPalette && commandTrigger && (
        <CommandPalette
          trigger={commandTrigger}
          searchTerm={commandSearch}
          onSelect={handleCommandSelect}
          onClose={() => setCommandTrigger(null)}
          position={commandPosition}
        />
      )}
    </div>
  );
}