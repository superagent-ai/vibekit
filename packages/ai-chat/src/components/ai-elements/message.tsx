'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';
import { Avatar } from '../ui/avatar';
export { AvatarFallback } from '../ui/avatar';

export const Message = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    role?: 'user' | 'assistant' | 'system';
  }
>(({ className, role = 'assistant', children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'flex gap-3 rounded-lg p-4 mb-4',
      role === 'user' && 'flex-row-reverse bg-primary/10 dark:bg-primary/20 ml-auto max-w-[80%]',
      role === 'assistant' && 'bg-muted dark:bg-muted mr-auto max-w-[80%]',
      className
    )}
    {...props}
  >
    {children}
  </div>
));
Message.displayName = 'Message';

export const MessageAvatar = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Avatar>
>(({ className, ...props }, ref) => (
  <Avatar ref={ref} className={cn('h-8 w-8', className)} {...props} />
));
MessageAvatar.displayName = 'MessageAvatar';

export const MessageContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex-1 space-y-2', className)}
    {...props}
  >
    {children}
  </div>
));
MessageContent.displayName = 'MessageContent';