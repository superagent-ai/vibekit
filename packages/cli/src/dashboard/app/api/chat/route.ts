import { streamText, convertToCoreMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

// Simple session storage
const sessions = new Map<string, any[]>();

export async function POST(req: Request) {
  try {
    // Parse request
    const body = await req.json();
    const { messages, sessionId: providedSessionId } = body;
    
    if (!messages || messages.length === 0) {
      return new Response('Messages are required', { status: 400 });
    }

    // Use provided sessionId or generate one
    const sessionId = providedSessionId || crypto.randomUUID();
    
    // Get or create session messages
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }
    
    // Check for API key in environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY not found in environment');
      return new Response(
        JSON.stringify({ error: 'API key not configured' }),
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
    const result = await streamText({
      model: anthropic('claude-3-5-sonnet-20241022'),
      messages: convertToCoreMessages(messages),
      temperature: 0.7,
      maxTokens: 4096,
      onFinish: async ({ text }) => {
        // Save messages to session for persistence
        const sessionMessages = sessions.get(sessionId) || [];
        
        // Add the last user message
        const lastUserMessage = messages[messages.length - 1];
        sessionMessages.push({
          id: crypto.randomUUID(),
          role: 'user',
          content: lastUserMessage.content,
        });
        
        // Add the assistant response
        sessionMessages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
        });
        
        sessions.set(sessionId, sessionMessages);
      },
    });

    // Return the streaming response
    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    
    // Return error as JSON for debugging
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error',
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}