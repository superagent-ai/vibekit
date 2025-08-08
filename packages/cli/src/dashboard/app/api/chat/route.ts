import { streamText, convertToCoreMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from root .env
// Dashboard runs from packages/cli/src/dashboard, so go up 4 levels to root
const rootPath = path.resolve(process.cwd(), '../../../../.env');
dotenv.config({ path: rootPath });

// Force reload by reading the file directly
try {
  const envContent = readFileSync(rootPath, 'utf-8');
  const envVars = dotenv.parse(envContent);
  if (envVars.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY) {
    process.env.ANTHROPIC_API_KEY = envVars.ANTHROPIC_API_KEY;
  }
} catch (e) {
  // Silent fail - will use env var
}

export async function POST(req: Request) {
  try {
    console.log('Chat API: Processing request...');
    
    // Parse request
    const body = await req.json();
    console.log('Chat API: Body parsed:', JSON.stringify(body, null, 2));
    const { messages, data } = body;
    
    if (!messages || messages.length === 0) {
      return new Response('Messages are required', { status: 400 });
    }

    // Get model from data or use default
    const model = data?.model || 'claude-3-5-sonnet-20241022';
    console.log('Chat API: Using model:', model);
    
    // Check for API key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('No ANTHROPIC_API_KEY found');
      return new Response(
        JSON.stringify({ 
          error: 'API key not configured. Please set ANTHROPIC_API_KEY environment variable.' 
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Create Anthropic client
    const anthropic = createAnthropic({
      apiKey: apiKey,
    });
    
    // Stream the response
    console.log('Chat API: Starting stream with messages:', messages);
    const result = await streamText({
      model: anthropic(model),
      messages: convertToCoreMessages(messages),
      temperature: 0.7,
      maxTokens: 4096,
    });

    // Return the streaming response
    return result.toDataStreamResponse();
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