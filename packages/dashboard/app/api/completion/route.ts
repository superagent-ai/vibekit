import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ClaudeAuth } from '@vibe-kit/auth/node';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

// Load environment variables from root .env
const rootPath = path.resolve(process.cwd(), '../../../.env');
dotenv.config({ path: rootPath });

// Helper to get Claude client with OAuth or API key
async function getClaudeClient() {
  // First try OAuth token
  const tokenPath = path.join(os.homedir(), '.vibekit', 'claude-oauth-token.json');
  try {
    await fs.access(tokenPath);
    const isAuthenticated = await ClaudeAuth.isAuthenticated();
    if (isAuthenticated) {
      const token = await ClaudeAuth.getValidToken();
      if (token) {
        console.log('Using OAuth authentication for completion');
        return createAnthropic({
          apiKey: token,
          headers: {
            'anthropic-beta': 'oauth-2025-04-20',
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    }
  } catch (e) {
    console.log('OAuth not available for completion:', e instanceof Error ? e.message : String(e));
  }
  
  // Fall back to API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    console.log('Using API key authentication for completion');
    return createAnthropic({
      apiKey: apiKey,
    });
  }
  
  throw new Error('No authentication method available. Please set ANTHROPIC_API_KEY or authenticate with OAuth.');
}

export async function POST(req: Request) {
  try {
    // Parse request
    const { prompt, model } = await req.json();
    
    if (!prompt) {
      return new Response('Prompt is required', { status: 400 });
    }

    // Get Claude client
    const anthropic = await getClaudeClient();
    const modelId = model || 'claude-3-5-sonnet-20241022';
    
    // Stream the completion
    const result = await streamText({
      model: anthropic(modelId),
      prompt,
      temperature: 0.7,
      maxRetries: 3,
    });

    // Return the streaming response
    return result.toTextStreamResponse();
  } catch (error) {
    console.error('Completion API error:', error);
    
    // Return error as JSON
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}