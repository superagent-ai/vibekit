import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { ClaudeAuth } from '@vibe-kit/auth/node';
import SandboxUtils from '../../src/sandbox/sandbox-utils.js';

// Mock dependencies
vi.mock('@vibe-kit/auth/node');

describe('SandboxUtils OAuth Methods', () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock console methods to avoid noise in test output
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createOAuthCredentials', () => {
    test('should create OAuth credentials with settings for valid token', async () => {
      const mockToken = 'sk-ant-test-token';
      const mockTokenData = {
        access_token: mockToken,
        account: {
          uuid: 'test-uuid',
          email_address: 'test@example.com'
        },
        organization: {
          uuid: 'org-uuid',
          name: 'Test Org'
        }
      };

      vi.mocked(ClaudeAuth.getValidToken).mockResolvedValue(mockToken);
      vi.mocked(ClaudeAuth.getRawToken).mockResolvedValue(mockTokenData);

      const result = await SandboxUtils.createOAuthCredentials();

      expect(result).toEqual({
        type: 'oauth-with-settings',
        oauthToken: mockToken,
        settings: expect.objectContaining({
          hasCompletedOnboarding: true,
          projects: {
            "/workspace": expect.objectContaining({
              hasTrustDialogAccepted: true
            })
          }
        }),
        tokenData: mockTokenData
      });
    });

    test('should return null when token is invalid', async () => {
      vi.mocked(ClaudeAuth.getValidToken).mockResolvedValue(null);
      vi.mocked(ClaudeAuth.getRawToken).mockResolvedValue(null);

      const result = await SandboxUtils.createOAuthCredentials();

      expect(result).toBeNull();
    });

    test('should return null when ClaudeAuth throws error', async () => {
      vi.mocked(ClaudeAuth.getValidToken).mockRejectedValue(new Error('Auth failed'));

      const result = await SandboxUtils.createOAuthCredentials();

      expect(result).toBeNull();
    });
  });

  describe('generateClaudeSettings', () => {
    test('should generate proper settings structure', () => {
      const mockTokenData = {
        access_token: 'test-token',
        account: {
          uuid: 'test-uuid',
          email_address: 'test@example.com'
        },
        organization: {
          uuid: 'org-uuid',
          name: 'Test Org'
        }
      };

      const settings = SandboxUtils.generateClaudeSettings(mockTokenData);

      expect(settings).toEqual({
        hasCompletedOnboarding: true,
        numStartups: 2,
        installMethod: 'vibekit-oauth',
        autoUpdates: true,
        userID: expect.any(String),
        tipsHistory: {
          'new-user-warmup': 1
        },
        firstStartTime: expect.any(String),
        projects: {
          "/workspace": {
            allowedTools: [],
            history: [],
            mcpContextUris: [],
            mcpServers: {},
            enabledMcpjsonServers: [],
            disabledMcpjsonServers: [],
            hasTrustDialogAccepted: true,
            hasTrustDialogHooksAccepted: false,
            projectOnboardingSeenCount: 1,
            hasClaudeMdExternalIncludesApproved: false,
            hasClaudeMdExternalIncludesWarningShown: false
          }
        },
        oauthAccount: {
          uuid: 'test-uuid',
          email_address: 'test@example.com'
        },
        organization: {
          uuid: 'org-uuid',
          name: 'Test Org'
        }
      });
    });

    test('should handle minimal token data', () => {
      const mockTokenData = {
        access_token: 'test-token'
      };

      const settings = SandboxUtils.generateClaudeSettings(mockTokenData);

      expect(settings.hasCompletedOnboarding).toBe(true);
      expect(settings.userID).toBeDefined();
      expect(settings.projects["/workspace"].hasTrustDialogAccepted).toBe(true);
      expect(settings.oauthAccount).toBeUndefined();
      expect(settings.organization).toBeUndefined();
    });
  });

  describe('generateUserIdFromToken', () => {
    test('should generate user ID from account UUID', () => {
      const mockTokenData = {
        account: {
          uuid: 'test-uuid'
        }
      };

      const userId = SandboxUtils.generateUserIdFromToken(mockTokenData);

      // Should generate a consistent hash from the UUID
      expect(userId).toHaveLength(64); // SHA256 hash length
      expect(userId).toMatch(/^[a-f0-9]+$/); // Hex string
      
      // Should be deterministic - same input produces same output
      const userId2 = SandboxUtils.generateUserIdFromToken(mockTokenData);
      expect(userId).toBe(userId2);
    });

    test('should generate user ID from access token when no account UUID', () => {
      const mockTokenData = {
        access_token: 'test-access-token-for-fallback-generation'
      };

      const userId = SandboxUtils.generateUserIdFromToken(mockTokenData);

      // Should generate a consistent hash from the access token
      expect(userId).toHaveLength(64); // SHA256 hash length
      expect(userId).toMatch(/^[a-f0-9]+$/); // Hex string
      
      // Should be deterministic - same input produces same output
      const userId2 = SandboxUtils.generateUserIdFromToken(mockTokenData);
      expect(userId).toBe(userId2);
    });

    test('should prefer account UUID over access token', () => {
      const mockTokenData = {
        access_token: 'test-access-token',
        account: {
          uuid: 'test-uuid'
        }
      };

      const userId1 = SandboxUtils.generateUserIdFromToken(mockTokenData);
      
      // Remove account UUID to test fallback
      const mockTokenDataWithoutAccount = {
        access_token: 'test-access-token'
      };
      
      const userId2 = SandboxUtils.generateUserIdFromToken(mockTokenDataWithoutAccount);
      
      // Should be different since one uses UUID and other uses access token
      expect(userId1).not.toBe(userId2);
    });
  });
});