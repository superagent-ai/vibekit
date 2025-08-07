import { createAnthropic } from '@ai-sdk/anthropic';
import { ClaudeAuth } from '@vibe-kit/auth/node';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';
import { BaseProvider, AuthStatus } from './base';

export class ClaudeProvider extends BaseProvider {
  private authMethod: 'oauth' | 'apikey' | null = null;
  private initialized = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Load .env file
    dotenv.config();

    // Check for OAuth token first
    const tokenPath = path.join(os.homedir(), '.vibekit', 'claude-oauth-token.json');
    try {
      await fs.access(tokenPath);
      // Try to validate OAuth authentication
      const isAuthenticated = await ClaudeAuth.isAuthenticated();
      if (isAuthenticated) {
        this.authMethod = 'oauth';
        console.log('Using Claude OAuth authentication');
      } else if (process.env.ANTHROPIC_API_KEY) {
        // OAuth token exists but is expired, fall back to API key if available
        this.authMethod = 'apikey';
        console.log('OAuth token expired, using Anthropic API key authentication');
      } else {
        throw new Error('OAuth token expired. Please run "vibekit auth claude" to re-authenticate');
      }
    } catch {
      // Check for API key
      if (process.env.ANTHROPIC_API_KEY) {
        this.authMethod = 'apikey';
        console.log('Using Anthropic API key authentication');
      } else {
        throw new Error(
          'No authentication method available. Please run "vibekit auth claude" or set ANTHROPIC_API_KEY in your .env file'
        );
      }
    }

    this.initialized = true;
  }

  async getClient() {
    if (!this.initialized) {
      await this.initialize();
    }

    if (this.authMethod === 'oauth') {
      const token = await ClaudeAuth.getValidToken();
      if (!token) {
        // Try fallback to API key if available
        if (process.env.ANTHROPIC_API_KEY) {
          this.authMethod = 'apikey';
          console.log('OAuth token invalid, falling back to API key');
          return createAnthropic({
            apiKey: process.env.ANTHROPIC_API_KEY,
          });
        }
        throw new Error('OAuth token expired or invalid. Please re-authenticate');
      }
      
      // Use OAuth token with anthropic
      // Note: The anthropic SDK might need custom headers for OAuth
      return createAnthropic({
        apiKey: token, // OAuth tokens can be used as API keys in some cases
        headers: {
          'anthropic-beta': 'oauth-2025-04-20',
          'Authorization': `Bearer ${token}`,
        },
      });
    } else if (this.authMethod === 'apikey') {
      return createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }

    throw new Error('No authentication method initialized');
  }

  getAuthStatus(): AuthStatus {
    return {
      method: this.authMethod,
      authenticated: this.authMethod !== null,
      isAuthenticated: this.authMethod !== null, // For backward compatibility
    };
  }

  async getModelId(): Promise<string> {
    // Default to Claude 3.5 Sonnet
    return 'claude-3-5-sonnet-20241022';
  }
}