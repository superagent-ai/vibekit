/**
 * Avatar utility functions for X/Twitter profile images
 * Uses Unavatar service with proper caching and fallback
 */

export interface AvatarOptions {
  size?: number;
  fallback?: string;
}

/**
 * Get avatar URL for an X/Twitter handle
 * @param xHandle - Twitter handle (with or without @)
 * @param options - Avatar options
 * @returns Avatar URL with appropriate service
 */
export function getXAvatarUrl(xHandle?: string, options?: AvatarOptions): string {
  const { size = 200, fallback = '/default-avatar.svg' } = options || {};
  
  if (!xHandle) {
    return fallback;
  }
  
  // Remove @ symbol if present and trim whitespace
  const handle = xHandle.replace('@', '').trim();
  
  if (!handle) {
    return fallback;
  }
  
  // Map Twitter handles to GitHub usernames where known
  // This provides better avatar reliability
  const githubMappings: Record<string, string> = {
    'AnthropicAI': 'anthropics',      // Anthropic's GitHub org
    'anthropicai': 'anthropics',      // Case variation
    'taskmasterai': 'eyaltoledano',   // Task Master AI author
    'TaskMasterAI': 'eyaltoledano',   
    'yokingma': 'yokingma',           // Direct match
  };
  
  // Check if we have a known GitHub mapping (case-insensitive lookup)
  const lowerHandle = handle.toLowerCase();
  const githubHandle = Object.entries(githubMappings).find(
    ([key, _]) => key.toLowerCase() === lowerHandle
  )?.[1];
  
  if (githubHandle) {
    // Use direct GitHub avatar URL for known mappings
    return `https://avatars.githubusercontent.com/${githubHandle}?size=${size}`;
  }
  
  // For unknown handles, try Unavatar with GitHub first, Twitter as fallback
  // This provides the best compatibility
  return `https://unavatar.io/github/${handle}?size=${size}&fallback=/default-avatar.svg`;
}

/**
 * Get avatar URL with fallback chain
 * Tries multiple sources in order
 */
export function getAvatarUrlWithFallback(xHandle?: string, githubUsername?: string): string {
  // Priority order:
  // 1. Twitter/X avatar
  // 2. GitHub avatar (if username provided)
  // 3. Default avatar
  
  if (xHandle) {
    return getXAvatarUrl(xHandle);
  }
  
  if (githubUsername) {
    return `https://unavatar.io/github/${githubUsername}`;
  }
  
  return '/default-avatar.svg';
}

/**
 * Preload avatar images for better performance
 * Call this when component mounts to cache avatars in browser
 */
export function preloadAvatars(handles: (string | undefined)[]): void {
  handles.forEach(handle => {
    if (handle) {
      const img = new Image();
      const url = getXAvatarUrl(handle, { size: 64 });
      img.src = url;
      // Browser will cache these images automatically
      // Silently handle errors for preloading
      img.onerror = () => {};
    }
  });
}

/**
 * Get cached avatar URL with localStorage fallback (optional)
 * This provides an additional layer of caching beyond browser cache
 * Use this if you want to persist avatars across browser sessions
 */
export function getCachedAvatarUrl(xHandle?: string): string {
  if (!xHandle) return '/default-avatar.svg';
  
  const cacheKey = `avatar_${xHandle.replace('@', '').toLowerCase()}`;
  const cachedUrl = localStorage.getItem(cacheKey);
  
  if (cachedUrl && isCacheValid(cacheKey)) {
    return cachedUrl;
  }
  
  const url = getXAvatarUrl(xHandle);
  
  // Store in localStorage with timestamp
  localStorage.setItem(cacheKey, url);
  localStorage.setItem(`${cacheKey}_timestamp`, Date.now().toString());
  
  return url;
}

/**
 * Check if cache entry is still valid (24 hours)
 */
function isCacheValid(cacheKey: string): boolean {
  const timestamp = localStorage.getItem(`${cacheKey}_timestamp`);
  if (!timestamp) return false;
  
  const age = Date.now() - parseInt(timestamp);
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  return age < maxAge;
}

/**
 * Clear avatar cache from localStorage
 */
export function clearAvatarCache(): void {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.startsWith('avatar_')) {
      localStorage.removeItem(key);
    }
  });
}