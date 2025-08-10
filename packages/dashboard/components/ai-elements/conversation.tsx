'use client';

import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Conversation = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex flex-col h-full', className)}
    {...props}
  >
    {children}
  </div>
));
Conversation.displayName = 'Conversation';

export const ConversationContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <ScrollArea ref={ref} className={cn('flex-1 p-4', className)}>
    <div className="space-y-4 max-w-3xl mx-auto">
      {children}
    </div>
  </ScrollArea>
));
ConversationContent.displayName = 'ConversationContent';

export const ConversationScrollButton = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Button>
>(({ className, ...props }, ref) => (
  <Button
    ref={ref}
    size="icon"
    variant="outline"
    className={cn(
      'absolute bottom-4 right-4 rounded-full shadow-lg',
      className
    )}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </Button>
));
ConversationScrollButton.displayName = 'ConversationScrollButton';