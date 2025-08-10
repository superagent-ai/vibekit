import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import os from 'os';

// Note: Claude Code Max OAuth tokens are for Claude.ai web interface only
// They cannot be used with the Anthropic API SDK
// We need to use standard Anthropic API keys for API access

let authMethod = 'none';
let apiKey: string | undefined;
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

// Load API key from environment or .env files
function loadApiKey() {
  // Try multiple paths in case we're running from different locations
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../../../.env'),
    path.resolve(process.cwd(), '../../../../.env'),
  ];

  // First check if API key is already in environment
  if (process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_API_KEY;
    authMethod = 'API Key (env)';
    return;
  }

  // Try to load from .env files if not already set
  for (const envPath of possiblePaths) {
    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars = dotenv.parse(envContent);
      if (envVars.ANTHROPIC_API_KEY) {
        // Use the API key directly from the parsed env vars
        apiKey = envVars.ANTHROPIC_API_KEY;
        authMethod = 'API Key';
        break;
      }
    } catch (e) {
      // Try next path
    }
  }
}

// Call the function to load API key
loadApiKey();

export async function POST(req: Request) {
  try {
    // Parse request
    const body = await req.json();
    const { messages, data } = body;
    
    if (!messages || messages.length === 0) {
      return new Response('Messages are required', { status: 400 });
    }

    // Get model from data or use default
    const model = data?.model || 'claude-sonnet-4-20250514';
    
    // Check for API key (use the one loaded at module level)
    const currentApiKey = apiKey;
    if (!currentApiKey) {
      console.error('No ANTHROPIC_API_KEY found in any location');
      return new Response(
        JSON.stringify({ 
          error: 'API key not configured. Please set ANTHROPIC_API_KEY in your .env file.' 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Create Anthropic client
    const anthropic = createAnthropic({
      apiKey: currentApiKey,
    });
    
    // Stream the response
    
    // Convert messages to the format expected by the AI SDK
    const formattedMessages = messages.map((msg: any) => {
      // For assistant messages with parts array, extract the text content
      if (msg.role === 'assistant' && Array.isArray(msg.parts)) {
        const textContent = msg.parts
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text || '')
          .join('');
        return {
          role: 'assistant',
          content: textContent || ''
        };
      }
      
      // For user messages, ensure content is a string
      if (msg.role === 'user') {
        return {
          role: 'user',
          content: typeof msg.content === 'string' ? msg.content : ''
        };
      }
      
      // Default case
      return {
        role: msg.role,
        content: msg.content || ''
      };
    });
    
    
    try {
      const result = streamText({
        model: anthropic(model),
        messages: formattedMessages,
        temperature: 0.7,
        maxTokens: 4096,
      });

      
      // Return the streaming response
      const response = result.toUIMessageStreamResponse();
      return response;
    } catch (innerError: any) {
      console.error('Chat API: Inner error:', innerError);
      console.error('Chat API: Inner error stack:', innerError?.stack);
      throw innerError;
    }
  } catch (error: any) {
    console.error('Chat API error:', error);
    console.error('Error stack:', error?.stack);
    
    // Return error as JSON for better debugging
    return new Response(
      JSON.stringify({ 
        error: error?.message || 'Internal server error',
        details: error?.stack
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}