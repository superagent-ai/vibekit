import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  ClaudeWebAuth, 
  MemoryTokenStorage, 
  LocalStorageTokenStorage,
  type TokenStorage,
  type OAuthToken 
} from '../packages/auth/src/browser.js';

describe('ClaudeWebAuth - CLI-like OAuth Flow', () => {
  let storage: TokenStorage;
  let auth: ClaudeWebAuth;
  
  beforeEach(() => {
    storage = new MemoryTokenStorage('test-session');
    auth = new ClaudeWebAuth(storage);
    global.fetch = vi.fn();
  });
  
  describe('Complete OAuth Flow (like CLI)', () => {
    it('should complete authentication flow with manual code input', async () => {
      // Step 1: Generate authorization URL (like CLI)
      const { url, state, codeVerifier } = await ClaudeWebAuth.createAuthorizationUrl();
      
      // Verify URL is correct for manual code copying
      expect(url).toContain('https://claude.ai/oauth/authorize');
      expect(url).toContain('code=true'); // Important: enables manual code copying
      expect(url).toContain(`state=${state}`);
      
      // Step 2: User opens URL in browser (we can't test this part)
      // In real usage: window.open(url, '_blank');
      
      // Step 3: User copies and pastes authentication code
      const userPastedCode = `test-auth-code#${state}`; // Format: code#state
      
      // Mock successful token exchange
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token-from-claude',
          token_type: 'Bearer',
          expires_in: 86400, // 24 hours
          refresh_token: 'refresh-token-from-claude',
          scope: 'org:create_api_key user:profile user:inference'
        })
      });
      
      // Step 4: Complete authentication
      const token = await auth.authenticate(userPastedCode, codeVerifier, state);
      
      // Verify results
      expect(token.access_token).toBe('access-token-from-claude');
      expect(token.refresh_token).toBe('refresh-token-from-claude');
      expect(token.created_at).toBeDefined();
      
      // Verify token was saved
      const savedToken = await auth.getToken();
      expect(savedToken?.access_token).toBe('access-token-from-claude');
    });
    
    it('should reject invalid code format', async () => {
      const { state, codeVerifier } = await ClaudeWebAuth.createAuthorizationUrl();
      
      // User pastes wrong format (missing #state)
      const invalidCode = 'just-a-code-without-state';
      
      await expect(
        auth.authenticate(invalidCode, codeVerifier, state)
      ).rejects.toThrow('Invalid authentication code format. Expected: code#state');
    });
    
    it('should reject state mismatch', async () => {
      const { state, codeVerifier } = await ClaudeWebAuth.createAuthorizationUrl();
      
      // User somehow gets a code with wrong state
      const codeWithWrongState = 'test-code#wrong-state';
      
      await expect(
        auth.authenticate(codeWithWrongState, codeVerifier, state)
      ).rejects.toThrow('State mismatch. Authentication failed.');
    });
  });
  
  describe('Token Management (after authentication)', () => {
    const mockToken: OAuthToken = {
      access_token: 'current-access-token',
      refresh_token: 'refresh-token',
      token_type: 'Bearer',
      expires_in: 3600,
      created_at: Date.now() - 7200 * 1000 // Expired 2 hours ago
    };
    
    it('should auto-refresh expired token', async () => {
      // Setup: User already authenticated
      await storage.set(mockToken);
      
      // Mock refresh token exchange
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-refreshed-token',
          expires_in: 86400
        })
      });
      
      // Get valid token (should trigger refresh)
      const validToken = await auth.getValidToken();
      
      expect(validToken).toBe('new-refreshed-token');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://console.anthropic.com/v1/oauth/token',
        expect.objectContaining({
          body: expect.stringContaining('"grant_type":"refresh_token"')
        })
      );
    });
    
    it('should check authentication status', async () => {
      // Not authenticated
      expect(await auth.isAuthenticated()).toBe(false);
      
      // After authentication
      await storage.set({
        access_token: 'valid-token',
        token_type: 'Bearer',
        created_at: Date.now()
      });
      
      expect(await auth.isAuthenticated()).toBe(true);
    });
    
    it('should verify token with Claude API', async () => {
      await storage.set({
        access_token: 'valid-token',
        token_type: 'Bearer',
        created_at: Date.now()
      });
      
      // Mock successful API call
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ content: [{ text: 'OK' }] })
      });
      
      const isValid = await auth.verify();
      expect(isValid).toBe(true);
      
      // Verify correct headers were sent
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer valid-token',
            'X-API-Key': '',
            'anthropic-beta': 'oauth-2025-04-20'
          })
        })
      );
    });
    
    it('should logout and clear token', async () => {
      await storage.set(mockToken);
      await auth.logout();
      
      expect(await auth.getToken()).toBeNull();
      expect(await auth.isAuthenticated()).toBe(false);
    });
  });
  
  describe('Storage Options', () => {
    it('should work with different storage implementations', async () => {
      // Test with in-memory storage
      const memStorage = new MemoryTokenStorage('session-123');
      const memAuth = new ClaudeWebAuth(memStorage);
      
      const token: OAuthToken = {
        access_token: 'test-token',
        token_type: 'Bearer',
        created_at: Date.now()
      };
      
      await memStorage.set(token);
      const retrieved = await memStorage.get();
      expect(retrieved?.access_token).toBe('test-token');
    });
    
    it('should handle localStorage in browser environment', async () => {
      // Mock browser environment
      (global as any).window = {
        localStorage: {
          getItem: vi.fn(),
          setItem: vi.fn(),
          removeItem: vi.fn()
        }
      };
      
      const storage = new LocalStorageTokenStorage('test-key');
      const token: OAuthToken = {
        access_token: 'browser-token',
        token_type: 'Bearer',
        created_at: Date.now()
      };
      
      await storage.set(token);
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'test-key',
        JSON.stringify(token)
      );
      
      // Cleanup
      delete (global as any).window;
    });
  });
  
  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      const { state, codeVerifier } = await ClaudeWebAuth.createAuthorizationUrl();
      
      // Mock API error
      (global.fetch as any).mockResolvedValueOnce({
        ok: false,
        text: async () => 'Invalid authorization code'
      });
      
      await expect(
        auth.authenticate(`code#${state}`, codeVerifier, state)
      ).rejects.toThrow('Failed to exchange code for token: Invalid authorization code');
    });
    
    it('should handle network errors', async () => {
      await storage.set({
        access_token: 'token',
        token_type: 'Bearer',
        created_at: Date.now()
      });
      
      // Mock network error
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));
      
      const isValid = await auth.verify();
      expect(isValid).toBe(false);
    });
  });
});