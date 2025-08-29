import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { handleStatusRequest } from '../../src/server/status-handler';
import { AuthManager } from '../../src/utils/auth';

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, init) => ({ data, init }))
  }
}));

// Mock AuthManager
vi.mock('../../src/utils/auth');

describe('handleStatusRequest', () => {
  let mockAuthManager: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAuthManager = {
      getAuthStatus: vi.fn()
    };
    
    (AuthManager.getInstance as any).mockReturnValue(mockAuthManager);
  });

  it('should return auth status successfully', async () => {
    const mockAuthStatus = {
      authMethod: 'api-key',
      hasApiKey: true,
      hasOAuthToken: false,
      isConfigured: true,
      needsApiKey: false
    };
    
    mockAuthManager.getAuthStatus.mockReturnValue(mockAuthStatus);

    const result = await handleStatusRequest();

    expect(AuthManager.getInstance).toHaveBeenCalled();
    expect(mockAuthManager.getAuthStatus).toHaveBeenCalled();
    expect(NextResponse.json).toHaveBeenCalledWith(mockAuthStatus);
    expect(result.data).toEqual(mockAuthStatus);
  });

  it('should handle auth status with OAuth token', async () => {
    const mockAuthStatus = {
      authMethod: 'oauth',
      hasApiKey: false,
      hasOAuthToken: true,
      isConfigured: true,
      needsApiKey: false
    };
    
    mockAuthManager.getAuthStatus.mockReturnValue(mockAuthStatus);

    const result = await handleStatusRequest();

    expect(result.data).toEqual(mockAuthStatus);
  });

  it('should handle unconfigured auth status', async () => {
    const mockAuthStatus = {
      authMethod: 'none',
      hasApiKey: false,
      hasOAuthToken: false,
      isConfigured: false,
      needsApiKey: true
    };
    
    mockAuthManager.getAuthStatus.mockReturnValue(mockAuthStatus);

    await handleStatusRequest();

    expect(NextResponse.json).toHaveBeenCalledWith(mockAuthStatus);
  });

  it('should handle errors from AuthManager', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Auth manager error');
    mockAuthManager.getAuthStatus.mockImplementation(() => {
      throw error;
    });

    const result = await handleStatusRequest();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking auth status:', error);
    expect(NextResponse.json).toHaveBeenCalledWith(
      {
        error: 'Failed to check auth status',
        authMethod: 'none',
        hasApiKey: false,
        hasOAuthToken: false,
        isConfigured: false,
        needsApiKey: true,
      },
      { status: 500 }
    );
    expect(result.init?.status).toBe(500);

    consoleErrorSpy.mockRestore();
  });

  it('should handle AuthManager getInstance throwing error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('getInstance error');
    (AuthManager.getInstance as any).mockImplementation(() => {
      throw error;
    });

    const result = await handleStatusRequest();

    expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking auth status:', error);
    expect(result.init?.status).toBe(500);

    consoleErrorSpy.mockRestore();
  });
});