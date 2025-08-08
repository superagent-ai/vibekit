import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables from root .env
// Use absolute path to the root .env file
const rootPath = '/Users/danziger/code/vibekit/.env';

// Try multiple paths in case we're running from different locations
const possiblePaths = [
  rootPath,
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../../../.env'),
  path.resolve(__dirname, '../../../../.env'),
];

let apiKey = process.env.ANTHROPIC_API_KEY;

// Try to load from .env files if not already set
if (!apiKey) {
  for (const envPath of possiblePaths) {
    try {
      const envContent = readFileSync(envPath, 'utf-8');
      const envVars = dotenv.parse(envContent);
      if (envVars.ANTHROPIC_API_KEY) {
        process.env.ANTHROPIC_API_KEY = envVars.ANTHROPIC_API_KEY;
        apiKey = envVars.ANTHROPIC_API_KEY;
        console.log('Loaded API key from:', envPath);
        break;
      }
    } catch (e) {
      // Try next path
    }
  }
}

export async function POST(req: Request) {
  try {
    console.log('Chat API: Processing request...');
    console.log('Current working directory:', process.cwd());
    console.log('API Key loaded:', apiKey ? 'Yes (length: ' + apiKey.length + ')' : 'No');
    
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
    
    // Check for API key (use the one loaded at module level)
    const currentApiKey = process.env.ANTHROPIC_API_KEY || apiKey;
    if (!currentApiKey) {
      console.error('No ANTHROPIC_API_KEY found in any location');
      console.error('Tried paths:', possiblePaths);
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
    console.log('Chat API: Starting stream with messages:', messages);
    console.log('Chat API: Creating Anthropic model with:', model);
    
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
    
    console.log('Chat API: Formatted messages:', formattedMessages);
    
    try {
      const result = streamText({
        model: anthropic(model),
        messages: formattedMessages,
        temperature: 0.7,
        maxTokens: 4096,
        onFinish: ({ text, usage }) => {
          console.log('Chat API: Stream finished');
          console.log('Chat API: Response text:', text);
          console.log('Chat API: Token usage:', usage);
        },
      });

      console.log('Chat API: streamText result created');
      
      // Return the streaming response
      console.log('Chat API: Calling toUIMessageStreamResponse()');
      const response = result.toUIMessageStreamResponse();
      console.log('Chat API: Response created successfully');
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