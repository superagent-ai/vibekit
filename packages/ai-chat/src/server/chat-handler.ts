import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { AuthManager } from '../utils/auth';
import type { NextRequest } from 'next/server';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: Array<{ type: string; text?: string }>;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  data?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    showMCPTools?: boolean;
    webSearch?: boolean;
  };
}

/**
 * Handles chat requests and streams AI responses
 * @param req - Next.js request object
 * @returns Streaming response or error response
 */
export async function handleChatRequest(req: NextRequest): Promise<Response> {
  try {
    // Parse and validate request
    const body = await req.json() as ChatRequestBody;
    const { messages, data } = body;
    
    if (!messages || messages.length === 0) {
      return new Response('Messages are required', { status: 400 });
    }

    // Get model from data or use default
    const model = data?.model || 'claude-sonnet-4-20250514';
    
    // Get auth manager instance
    const authManager = AuthManager.getInstance();
    const apiKey = authManager.getApiKey();
    
    if (!apiKey) {
      const errorMessage = authManager.getErrorMessage();
      console.error('Chat API: Auth error:', errorMessage);
      return new Response(
        JSON.stringify({ 
          error: errorMessage || 'API key not configured'
        }),
        { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    // Create Anthropic client
    const anthropic = createAnthropic({
      apiKey,
    });
    
    // Convert messages to the format expected by the AI SDK
    const formattedMessages = messages.map((msg: ChatMessage) => {
      // For assistant messages with parts array, extract the text content
      if (msg.role === 'assistant' && Array.isArray(msg.parts)) {
        const textContent = msg.parts
          .filter((part: any) => part.type === 'text')
          .map((part: any) => part.text || '')
          .join('');
        return {
          role: 'assistant' as const,
          content: textContent || ''
        };
      }
      
      // For user messages, ensure content is a string
      if (msg.role === 'user') {
        return {
          role: 'user' as const,
          content: typeof msg.content === 'string' ? msg.content : ''
        };
      }
      
      // System messages
      if (msg.role === 'system') {
        return {
          role: 'system' as const,
          content: msg.content || ''
        };
      }
      
      // Default to assistant
      return {
        role: 'assistant' as const,
        content: msg.content || ''
      };
    });
    
    // Stream the response
    try {
      const result = streamText({
        model: anthropic(model),
        messages: formattedMessages,
        temperature: data?.temperature || 0.7,
        maxOutputTokens: data?.maxTokens || 4096,
      });

      // Return the streaming response
      const response = result.toUIMessageStreamResponse();
      return response;
    } catch (innerError: any) {
      console.error('Chat API: Streaming error:', innerError);
      console.error('Chat API: Error stack:', innerError?.stack);
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