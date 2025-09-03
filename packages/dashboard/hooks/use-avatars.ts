import { useEffect } from 'react';
import { preloadAvatars } from '../lib/avatar-utils';

/**
 * Hook to preload avatars for better performance
 * @param handles - Array of X/Twitter handles to preload
 */
export function usePreloadAvatars(handles: (string | undefined)[]) {
  useEffect(() => {
    // Preload avatars to browser cache for instant display
    preloadAvatars(handles);
  }, [handles]);
}

/**
 * Hook to handle avatar error fallback
 * Returns props to spread on img element
 */
export function useAvatarFallback() {
  return {
    onError: (e: React.SyntheticEvent<HTMLImageElement>) => {
      // Simple fallback to default avatar
      e.currentTarget.src = '/default-avatar.svg';
    }
  };
}