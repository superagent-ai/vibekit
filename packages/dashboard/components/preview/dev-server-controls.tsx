"use client";

import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Square, Loader2 } from 'lucide-react';
import { DevServerStatus } from '@/lib/preview/types';

interface DevServerControlsProps {
  status: DevServerStatus;
  isLoading: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
}

export function DevServerControls({
  status,
  isLoading,
  onStart,
  onStop,
  disabled = false,
}: DevServerControlsProps) {
  const isTransitioning = status === 'starting' || status === 'stopping';
  const canStart = status === 'stopped' || status === 'error' || !status;
  const canStop = status === 'running';

  return (
    <div className="flex items-center gap-1">
      {canStart && (
        <Button
          variant="default"
          size="sm"
          onClick={onStart}
          disabled={disabled || isLoading || isTransitioning}
          className="bg-green-600 hover:bg-green-700"
        >
          {isTransitioning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
      )}

      {canStop && (
        <Button
          variant="destructive"
          size="sm"
          onClick={onStop}
          disabled={disabled || isLoading || isTransitioning}
        >
          {isTransitioning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}