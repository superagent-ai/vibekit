import { useState, useEffect } from 'react';
import type { AuthStatus } from '../utils/auth';

export function useAuthStatus() {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAuthStatus();
  }, []);

  const fetchAuthStatus = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/chat/status');
      if (!response.ok) {
        throw new Error('Failed to fetch auth status');
      }
      const data = await response.json();
      setAuthStatus(data);
    } catch (err) {
      console.error('Failed to fetch auth status:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setAuthStatus({
        authMethod: 'none',
        hasApiKey: false,
        hasOAuthToken: false,
        isConfigured: false,
        needsApiKey: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return {
    authStatus,
    loading,
    error,
    refetch: fetchAuthStatus,
  };
}