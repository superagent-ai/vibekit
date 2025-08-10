import { NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import os from 'os';

export async function GET() {
  try {
    let authMethod = 'none';
    let hasApiKey = false;
    let claudeCodeMaxUser: string | undefined;
    
    // Check if user has Claude Code Max (for informational purposes only)
    const oauthTokenPath = path.join(os.homedir(), '.vibekit', 'claude-oauth-token.json');
    if (existsSync(oauthTokenPath)) {
      try {
        const tokenContent = readFileSync(oauthTokenPath, 'utf-8');
        const oauthToken = JSON.parse(tokenContent);
        if (oauthToken.access_token) {
          claudeCodeMaxUser = oauthToken.account?.email_address;
        }
      } catch (e) {
        // Ignore error
      }
    }
    
    // Check for API key in environment
    if (process.env.ANTHROPIC_API_KEY) {
      hasApiKey = true;
      authMethod = 'API Key (env)';
    } else {
      // Check in .env files
      const possiblePaths = [
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../.env'),
        path.resolve(process.cwd(), '../../.env'),
        path.resolve(process.cwd(), '../../../.env'),
        path.resolve(process.cwd(), '../../../../.env'),
      ];
      
      for (const envPath of possiblePaths) {
        try {
          const envContent = readFileSync(envPath, 'utf-8');
          const envVars = dotenv.parse(envContent);
          if (envVars.ANTHROPIC_API_KEY) {
            hasApiKey = true;
            authMethod = 'API Key';
            break;
          }
        } catch (e) {
          // Try next path
        }
      }
    }
    
    return NextResponse.json({
      authMethod,
      hasApiKey,
      isConfigured: hasApiKey,
      claudeCodeMaxUser,
      needsApiKey: !hasApiKey,
    });
  } catch (error) {
    console.error('Error checking auth status:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check auth status',
        authMethod: 'none',
        hasApiKey: false,
        isConfigured: false,
        needsApiKey: true,
      },
      { status: 500 }
    );
  }
}