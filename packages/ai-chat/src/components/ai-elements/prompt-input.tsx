'use client';

import * as React from 'react';
import { cn } from '../../utils/cn';
import { ArrowUp, ChevronDown, Loader2, Square } from 'lucide-react';

// Main PromptInput form container
const PromptInput = React.forwardRef<
  HTMLFormElement,
  React.FormHTMLAttributes<HTMLFormElement>
>(({ className, style, ...props }, ref) => {
  return (
    <form
      ref={ref}
      className={cn('relative w-full', className)}
      style={{
        ...style,
      }}
      {...props}
    />
  );
});
PromptInput.displayName = 'PromptInput';

// Textarea component with auto-resize
const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, style, onKeyDown, ...props }, ref) => {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  
  React.useImperativeHandle(ref, () => textareaRef.current!);

  // Auto-resize based on content
  React.useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      const adjustHeight = () => {
        textarea.style.height = 'auto';
        textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
      };
      adjustHeight();
      
      const handleInput = () => adjustHeight();
      textarea.addEventListener('input', handleInput);
      return () => textarea.removeEventListener('input', handleInput);
    }
  }, []);

  // Handle Enter vs Shift+Enter
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If Enter is pressed without Shift, submit the form
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Find the parent form and submit it
      const form = textareaRef.current?.closest('form');
      if (form) {
        const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
        form.dispatchEvent(submitEvent);
      }
    }
    // If there's an existing onKeyDown handler, call it
    if (onKeyDown) {
      onKeyDown(e);
    }
  };

  return (
    <textarea
      ref={textareaRef}
      onKeyDown={handleKeyDown}
      className={cn(
        'flex w-full text-sm bg-transparent',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      style={{
        minHeight: '80px',
        padding: '12px',
        borderRadius: '12px 12px 0 0',
        border: '1px solid hsl(var(--border))',
        borderBottom: 'none',
        backgroundColor: 'hsl(var(--background))',
        resize: 'none', // Explicitly disable resize handle
        ...style,
      }}
      {...props}
    />
  );
});
PromptInputTextarea.displayName = 'PromptInputTextarea';

// Toolbar container
const PromptInputToolbar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        'flex items-center justify-between',
        className
      )}
      style={{
        padding: '8px',
        borderRadius: '0 0 12px 12px',
        border: '1px solid hsl(var(--border))',
        borderTop: '1px solid hsl(var(--border) / 0.5)',
        backgroundColor: 'hsl(var(--muted) / 0.3)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
});
PromptInputToolbar.displayName = 'PromptInputToolbar';

// Tools container (left side of toolbar)
const PromptInputTools = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('flex items-center gap-1', className)}
      style={style}
      {...props}
    >
      {children}
    </div>
  );
});
PromptInputTools.displayName = 'PromptInputTools';

// Generic button for tools
interface PromptInputButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  'data-active'?: string;
}

const PromptInputButton = React.forwardRef<
  HTMLButtonElement,
  PromptInputButtonProps
>(({ className, children, type = 'button', style, onClick, ...props }, ref) => {
  // Extract default styles that can be overridden
  const defaultStyles = {
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid hsl(var(--border))',
    backgroundColor: 'transparent',
  };
  
  // Check if this is an active search button to prevent hover conflicts
  const dataActive = props['data-active'];
  const isActiveButton = dataActive === 'true' || className?.includes('search-button-active');
  
  return (
    <button
      ref={ref}
      type={type}
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        // Conditionally apply hover styles
        !isActiveButton && 'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        'transition-colors cursor-pointer',
        className
      )}
      style={{
        ...defaultStyles,
        ...style, // Style prop overrides defaults
      }}
      {...props}
    >
      {children}
    </button>
  );
});
PromptInputButton.displayName = 'PromptInputButton';

// Submit button with status-based icons
interface PromptInputSubmitProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  status?: 'ready' | 'streaming' | 'submitted' | 'error';
}

const PromptInputSubmit = React.forwardRef<
  HTMLButtonElement,
  PromptInputSubmitProps
>(({ className, status = 'ready', disabled, style, onClick, ...props }, ref) => {
  const isDisabled = disabled || status === 'submitted';

  const getIcon = () => {
    switch (status) {
      case 'streaming':
        return <Square className="h-3.5 w-3.5" />;
      case 'submitted':
        return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
      default:
        return <ArrowUp className="h-3.5 w-3.5" />;
    }
  };

  const getButtonStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      width: '32px',
      height: '32px',
      borderRadius: '8px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.2s',
      border: 'none',
      cursor: isDisabled ? 'not-allowed' : 'pointer',
      opacity: isDisabled ? 0.5 : 1,
    };

    if (status === 'streaming') {
      return {
        ...baseStyles,
        backgroundColor: 'hsl(var(--destructive))',
        color: 'hsl(var(--destructive-foreground))',
      };
    }
    
    return {
      ...baseStyles,
      backgroundColor: isDisabled ? 'hsl(var(--muted))' : 'hsl(var(--primary))',
      color: isDisabled ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary-foreground))',
    };
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (status === 'streaming' && onClick) {
      e.preventDefault();
      onClick(e);
    }
  };

  return (
    <button
      ref={ref}
      type={status === 'streaming' ? 'button' : 'submit'}
      disabled={isDisabled}
      onClick={handleClick}
      className={cn(
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
        'hover:opacity-90',
        className
      )}
      style={{
        ...getButtonStyles(),
        ...style,
      }}
      {...props}
    >
      {getIcon()}
      <span className="sr-only">
        {status === 'streaming' ? 'Stop' : 'Send message'}
      </span>
    </button>
  );
});
PromptInputSubmit.displayName = 'PromptInputSubmit';

// Model Select components with working dropdown
interface ModelSelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const PromptInputModelSelect = React.forwardRef<
  HTMLDivElement,
  ModelSelectProps
>(({ children, className, style, value, onValueChange, ...props }, ref) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  
  // Pass context to children
  const contextValue = React.useMemo(() => ({
    value,
    onValueChange,
    isOpen,
    setIsOpen,
    triggerRef: triggerRef as React.RefObject<HTMLButtonElement>,
  }), [value, onValueChange, isOpen]);

  return (
    <ModelSelectContext.Provider value={contextValue}>
      <div ref={ref} className={cn('relative', className)} style={style} {...props}>
        {children}
      </div>
    </ModelSelectContext.Provider>
  );
});
PromptInputModelSelect.displayName = 'PromptInputModelSelect';

// Context for model select
const ModelSelectContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLButtonElement>;
}>({
  isOpen: false,
  setIsOpen: () => {},
});

const PromptInputModelSelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, children, style, ...props }, ref) => {
  const { isOpen, setIsOpen, triggerRef } = React.useContext(ModelSelectContext);
  
  React.useImperativeHandle(ref, () => triggerRef?.current!);
  
  return (
    <button
      ref={triggerRef}
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        'hover:bg-accent hover:text-accent-foreground',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-50',
        'transition-colors cursor-pointer',
        className
      )}
      style={{
        padding: '6px 10px',
        borderRadius: '8px',
        border: '1px solid hsl(var(--border))',
        backgroundColor: 'transparent',
        ...style,
      }}
      {...props}
    >
      {children}
      <ChevronDown className={cn('h-3 w-3 opacity-50 transition-transform', isOpen && 'rotate-180')} />
    </button>
  );
});
PromptInputModelSelectTrigger.displayName = 'PromptInputModelSelectTrigger';

const PromptInputModelSelectValue = React.forwardRef<
  HTMLSpanElement,
  React.HTMLAttributes<HTMLSpanElement>
>(({ className, ...props }, ref) => {
  const { value } = React.useContext(ModelSelectContext);
  
  // Map value to display name
  const displayName = value === 'gpt-4o' ? 'GPT-4o' : 'Claude 3.5';
  
  return (
    <span ref={ref} className={cn('text-xs', className)} {...props}>
      {displayName}
    </span>
  );
});
PromptInputModelSelectValue.displayName = 'PromptInputModelSelectValue';

const PromptInputModelSelectContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, style, ...props }, ref) => {
  const { isOpen, triggerRef } = React.useContext(ModelSelectContext);
  const [position, setPosition] = React.useState<'top' | 'bottom'>('top');
  const contentRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    if (isOpen && triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceAbove = rect.top;
      const dropdownHeight = 200; // Estimated max height
      
      // Position dropdown down if there's enough space below, otherwise up
      if (spaceBelow > dropdownHeight) {
        setPosition('bottom');
      } else if (spaceAbove > dropdownHeight) {
        setPosition('top');
      } else {
        // If neither has enough space, pick the one with more space
        setPosition(spaceBelow > spaceAbove ? 'bottom' : 'top');
      }
    }
  }, [isOpen, triggerRef]);
  
  React.useImperativeHandle(ref, () => contentRef.current!);
  
  if (!isOpen) return null;
  
  return (
    <div
      ref={contentRef}
      className={cn(
        'absolute left-0 z-50',
        position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        className
      )}
      style={{
        minWidth: '180px',
        maxHeight: '200px',
        overflowY: 'auto',
        borderRadius: '8px',
        border: '1px solid hsl(var(--border))',
        backgroundColor: 'hsl(var(--popover))',
        color: 'hsl(var(--popover-foreground))',
        padding: '4px',
        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
});
PromptInputModelSelectContent.displayName = 'PromptInputModelSelectContent';

const PromptInputModelSelectItem = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { value: string }
>(({ className, children, style, value, onClick, ...props }, ref) => {
  const { onValueChange, setIsOpen } = React.useContext(ModelSelectContext);
  
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (onClick) onClick(e);
    if (onValueChange) onValueChange(value);
    setIsOpen(false);
  };
  
  return (
    <div
      ref={ref}
      onClick={handleClick}
      className={cn(
        'relative flex cursor-pointer select-none items-center text-sm outline-none',
        'hover:bg-accent hover:text-accent-foreground',
        'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      style={{
        padding: '8px 12px',
        borderRadius: '6px',
        ...style,
      }}
      data-value={value}
      {...props}
    >
      {children}
    </div>
  );
});
PromptInputModelSelectItem.displayName = 'PromptInputModelSelectItem';

export {
  PromptInput,
  PromptInputButton,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
};