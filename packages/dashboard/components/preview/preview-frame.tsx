"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PreviewFrameProps {
  url: string;
  title?: string;
  onLoad?: () => void;
  onError?: (error: string) => void;
  className?: string;
}

export function PreviewFrame({ 
  url, 
  title = 'Preview', 
  onLoad, 
  onError,
  className = ''
}: PreviewFrameProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [key, setKey] = useState(0); // For forcing iframe refresh

  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setErrorMessage('');
  }, [url]);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
    onLoad?.();
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    setErrorMessage('Failed to load preview');
    onError?.('Failed to load preview');
  };

  const handleRefresh = () => {
    setKey(prev => prev + 1);
    setIsLoading(true);
    setHasError(false);
  };

  // Add security attributes for iframe
  const sandboxAttributes = [
    'allow-same-origin',
    'allow-scripts',
    'allow-forms',
    'allow-popups',
    'allow-modals',
    'allow-downloads'
  ].join(' ');

  return (
    <div className={`relative w-full h-full min-h-[400px] ${className}`}>
      {isLoading && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
            <p className="text-sm text-muted-foreground">Loading preview...</p>
          </div>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-background">
          <div className="text-center p-8">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
            <h3 className="text-lg font-semibold mb-2">Preview Error</h3>
            <p className="text-muted-foreground mb-4">
              {errorMessage || 'Unable to load the preview'}
            </p>
            <Button onClick={handleRefresh} variant="outline">
              <RotateCcw className="mr-2 h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      )}

      <iframe
        key={key}
        ref={iframeRef}
        src={url}
        title={title}
        className="w-full h-full border-0"
        sandbox={sandboxAttributes}
        loading="lazy"
        onLoad={handleLoad}
        onError={handleError}
        style={{
          display: hasError ? 'none' : 'block',
          opacity: isLoading ? 0 : 1,
          transition: 'opacity 0.2s ease-in-out'
        }}
      />
    </div>
  );
}