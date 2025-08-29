'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquareOff } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Chat page error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-4">
      <div className="flex flex-col items-center gap-4 max-w-md text-center">
        <div className="rounded-full bg-destructive/10 p-3">
          <MessageSquareOff className="h-6 w-6 text-destructive" />
        </div>
        
        <h2 className="text-xl font-semibold">Chat Error</h2>
        
        <p className="text-sm text-muted-foreground">
          Unable to load the chat interface. Please check your connection and try again.
        </p>
        
        <div className="flex gap-2">
          <Button
            onClick={() => reset()}
            variant="default"
            size="sm"
          >
            Reload Chat
          </Button>
          
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
            size="sm"
          >
            Go to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}