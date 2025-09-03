import { NextResponse } from 'next/server';
import { AuthManager } from '../utils/auth';

export async function handleStatusRequest() {
  try {
    const authManager = AuthManager.getInstance();
    const authStatus = authManager.getAuthStatus();
    
    return NextResponse.json(authStatus);
  } catch (error) {
    console.error('Error checking auth status:', error);
    return NextResponse.json(
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
  }
}