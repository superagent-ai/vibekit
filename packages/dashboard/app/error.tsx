'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-6 max-w-md text-center p-6">
        <div className="rounded-full bg-destructive/10 p-4">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Oops! Something went wrong</h1>
          <p className="text-muted-foreground">
            We encountered an unexpected error. Please try refreshing the page or contact support if the problem persists.
          </p>
        </div>
        
        <div className="flex gap-3">
          <Button
            onClick={() => reset()}
            size="default"
          >
            Try again
          </Button>
          
          <Button
            onClick={() => window.location.href = '/'}
            variant="outline"
          >
            Go to Dashboard
          </Button>
        </div>
        
        {process.env.NODE_ENV === 'development' && (
          <details className="w-full text-left">
            <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
              Error details (development only)
            </summary>
            <div className="mt-2 space-y-2">
              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                {error.message}
              </pre>
              {error.stack && (
                <pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-40 overflow-y-auto">
                  {error.stack}
                </pre>
              )}
              {error.digest && (
                <p className="text-xs text-muted-foreground">
                  Error ID: {error.digest}
                </p>
              )}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}