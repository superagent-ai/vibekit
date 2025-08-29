import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuthStatus } from '../src/hooks/use-auth';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('useAuthStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('successful authentication fetch', () => {
    it('should fetch and return auth status successfully', async () => {
      const mockAuthStatus = {
        authMethod: 'API Key (env)',
        hasApiKey: true,
        hasOAuthToken: false,
        isConfigured: true,
        needsApiKey: false,
        claudeCodeMaxUser: undefined,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAuthStatus),
      });

      const { result } = renderHook(() => useAuthStatus());

      // Initially loading should be true
      expect(result.current.loading).toBe(true);
      expect(result.current.authStatus).toBeNull();
      expect(result.current.error).toBeNull();

      // Wait for the fetch to complete
      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.authStatus).toEqual(mockAuthStatus);
      expect(result.current.error).toBeNull();
      expect(mockFetch).toHaveBeenCalledWith('/api/chat/status');
    });

    it('should handle OAuth authentication status', async () => {
      const mockAuthStatus = {
        authMethod: 'OAuth Token (env)',
        hasApiKey: false,
        hasOAuthToken: true,
        isConfigured: true,
        needsApiKey: false,
        claudeCodeMaxUser: 'user@example.com',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAuthStatus),
      });

      const { result } = renderHook(() => useAuthStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.authStatus).toEqual(mockAuthStatus);
      expect(result.current.authStatus?.claudeCodeMaxUser).toBe('user@example.com');
    });

    it('should handle no authentication configured', async () => {
      const mockAuthStatus = {
        authMethod: 'none',
        hasApiKey: false,
        hasOAuthToken: false,
        isConfigured: false,
        needsApiKey: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAuthStatus),
      });

      const { result } = renderHook(() => useAuthStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.authStatus).toEqual(mockAuthStatus);
      expect(result.current.authStatus?.needsApiKey).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const networkError = new Error('Network error');
      mockFetch.mockRejectedValueOnce(networkError);

      const { result } = renderHook(() => useAuthStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.authStatus).toEqual({
        authMethod: 'none',
        hasApiKey: false,
        hasOAuthToken: false,
        isConfigured: false,
        needsApiKey: true,
      });
      
      consoleSpy.mockRestore();
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useAuthStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Failed to fetch auth status');
      expect(result.current.authStatus).toEqual({
        authMethod: 'none',
        hasApiKey: false,
        hasOAuthToken: false,
        isConfigured: false,
        needsApiKey: true,
      });
    });

    it('should handle JSON parsing errors', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const { result } = renderHook(() => useAuthStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Invalid JSON');
      expect(result.current.authStatus).toEqual({
        authMethod: 'none',
        hasApiKey: false,
        hasOAuthToken: false,
        isConfigured: false,
        needsApiKey: true,
      });
      
      consoleSpy.mockRestore();
    });

    it('should handle non-Error exceptions', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockFetch.mockRejectedValueOnce('String error');

      const { result } = renderHook(() => useAuthStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Unknown error');
      expect(result.current.authStatus).toEqual({
        authMethod: 'none',
        hasApiKey: false,
        hasOAuthToken: false,
        isConfigured: false,
        needsApiKey: true,
      });
      
      consoleSpy.mockRestore();
    });
  });

  describe('refetch functionality', () => {
    it('should refetch auth status when refetch is called', async () => {
      const initialAuthStatus = {
        authMethod: 'none',
        hasApiKey: false,
        hasOAuthToken: false,
        isConfigured: false,
        needsApiKey: true,
      };

      const updatedAuthStatus = {
        authMethod: 'API Key (env)',
        hasApiKey: true,
        hasOAuthToken: false,
        isConfigured: true,
        needsApiKey: false,
      };

      // First call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(initialAuthStatus),
      });

      const { result } = renderHook(() => useAuthStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.authStatus).toEqual(initialAuthStatus);

      // Second call after refetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedAuthStatus),
      });

      // Call refetch and wait for completion
      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.authStatus).toEqual(updatedAuthStatus);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should clear previous errors when refetching', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // First call fails
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAuthStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Network error');

      // Second call succeeds
      const successAuthStatus = {
        authMethod: 'API Key (env)',
        hasApiKey: true,
        hasOAuthToken: false,
        isConfigured: true,
        needsApiKey: false,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(successAuthStatus),
      });

      // Call refetch and wait for completion
      await act(async () => {
        await result.current.refetch();
      });

      expect(result.current.error).toBeNull();
      expect(result.current.authStatus).toEqual(successAuthStatus);
      
      consoleSpy.mockRestore();
    });
  });

  describe('hook lifecycle', () => {
    it('should call fetch on mount', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          authMethod: 'none',
          hasApiKey: false,
          hasOAuthToken: false,
          isConfigured: false,
          needsApiKey: true,
        }),
      });

      renderHook(() => useAuthStatus());

      expect(mockFetch).toHaveBeenCalledWith('/api/chat/status');
    });

    it('should not fetch again on re-render without dependency changes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          authMethod: 'none',
          hasApiKey: false,
          hasOAuthToken: false,
          isConfigured: false,
          needsApiKey: true,
        }),
      });

      const { rerender } = renderHook(() => useAuthStatus());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(1);
      });

      // Re-render the hook
      rerender();

      // Should not fetch again
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('loading states', () => {
    it('should manage loading state correctly during successful fetch', async () => {
      let resolvePromise: (value: any) => void;
      const fetchPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(fetchPromise);

      const { result } = renderHook(() => useAuthStatus());

      // Should start loading
      expect(result.current.loading).toBe(true);
      expect(result.current.authStatus).toBeNull();
      expect(result.current.error).toBeNull();

      // Resolve the promise
      resolvePromise!({
        ok: true,
        json: () => Promise.resolve({
          authMethod: 'API Key (env)',
          hasApiKey: true,
          hasOAuthToken: false,
          isConfigured: true,
          needsApiKey: false,
        }),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.authStatus).toBeTruthy();
      expect(result.current.error).toBeNull();
    });

    it('should manage loading state correctly during failed fetch', async () => {
      // Mock console.error to suppress expected error logging
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      let rejectPromise: (reason: any) => void;
      const fetchPromise = new Promise((_, reject) => {
        rejectPromise = reject;
      });

      mockFetch.mockReturnValueOnce(fetchPromise);

      const { result } = renderHook(() => useAuthStatus());

      // Should start loading
      expect(result.current.loading).toBe(true);

      // Reject the promise
      rejectPromise!(new Error('Fetch failed'));

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBe('Fetch failed');
      
      consoleSpy.mockRestore();
    });
  });
});