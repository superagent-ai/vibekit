import { streamText, convertToCoreMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ClaudeAuth } from '@vibe-kit/auth/node';
import { MCPClientManager } from '@vibe-kit/mcp-client';
import { ChatStorage, MCPToAISDKAdapter } from '@vibe-kit/ai-chat';
import { z } from 'zod';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// Load environment variables
dotenv.config();

// Initialize components
const storage = new ChatStorage();
const serverManager = new MCPClientManager();
const mcpAdapter = new MCPToAISDKAdapter(serverManager);

// Helper to get Claude client
async function getClaudeClient() {
  let authMethod: 'oauth' | 'apikey' | null = null;
  
  // Check for OAuth token first
  const tokenPath = path.join(os.homedir(), '.vibekit', 'claude-oauth-token.json');
  try {
    await fs.access(tokenPath);
    const isAuthenticated = await ClaudeAuth.isAuthenticated();
    if (isAuthenticated) {
      authMethod = 'oauth';
      const token = await ClaudeAuth.getValidToken();
      if (token) {
        return createAnthropic({
          apiKey: token,
          headers: {
            'anthropic-beta': 'oauth-2025-04-20',
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    }
  } catch {
    // Fall through to API key
  }
  
  // Use API key if available
  if (process.env.ANTHROPIC_API_KEY) {
    return createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  
  throw new Error('No authentication method available. Please set ANTHROPIC_API_KEY or authenticate with OAuth.');
}

// Request validation schema
const ChatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string().min(1).max(10000),
  })).min(1).max(100),
});

// Rate limiting
const requestCounts = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const limit = { count: 10, windowMs: 60000 }; // 10 requests per minute
  
  const record = requestCounts.get(clientId) || { count: 0, resetTime: now + limit.windowMs };
  
  if (now > record.resetTime) {
    record.count = 0;
    record.resetTime = now + limit.windowMs;
  }
  
  if (record.count >= limit.count) {
    return false;
  }
  
  record.count++;
  requestCounts.set(clientId, record);
  return true;
}

export async function POST(req: Request) {
  const startTime = Date.now();
  
  try {
    // Rate limiting
    const clientId = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(clientId)) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
        { 
          status: 429,
          headers: { 
            'Content-Type': 'application/json',
            'Retry-After': '60',
          }
        }
      );
    }
    
    // Parse and validate request
    const body = await req.json();
    const validation = ChatRequestSchema.safeParse(body);
    
    if (!validation.success) {
      return new Response(
        JSON.stringify({ 
          error: 'Invalid request',
          details: validation.error.errors 
        }),
        { 
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
    
    const { messages, sessionId } = validation.data;
    
    if (!sessionId) {
      return new Response('Session ID is required', { status: 400 });
    }

    if (!messages || messages.length === 0) {
      return new Response('Messages are required', { status: 400 });
    }

    // Initialize storage
    await storage.initialize();
    
    // Load or create session
    let session = await storage.loadSession(sessionId);
    if (!session) {
      let projectId: string | undefined;
      try {
        // Try to get current project if available
        const { getCurrentProject } = await import('@vibe-kit/projects');
        const project = await getCurrentProject();
        projectId = project?.id;
      } catch {
        // Projects package not available, continue without project ID
      }
      
      session = await storage.createSession({
        title: `Chat ${new Date().toLocaleDateString()}`,
        projectId,
      });
    }

    // Get the last user message
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'user') {
      return new Response('Last message must be from user', { status: 400 });
    }

    // Add user message to storage
    await storage.appendMessage(sessionId, {
      role: 'user',
      content: lastMessage.content,
      timestamp: new Date().toISOString(),
    });

    // Get Claude client
    const client = await getClaudeClient();
    const modelId = 'claude-3-5-sonnet-20241022';

    // Get MCP tools
    const tools = await mcpAdapter.getTools();

    // Convert messages to core format
    const coreMessages = convertToCoreMessages(
      session.messages.map(msg => ({
        role: msg.role as any,
        content: msg.content,
      }))
    );

    // Add the new user message
    coreMessages.push({
      role: 'user',
      content: lastMessage.content,
    });

    // Stream the response
    const result = await streamText({
      model: client(modelId),
      messages: coreMessages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      temperature: 0.7,
      maxTokens: 4096,
      onFinish: async ({ text, toolCalls, toolResults }) => {
        // Save assistant message to storage
        await storage.appendMessage(sessionId, {
          role: 'assistant',
          content: text || '',
          timestamp: new Date().toISOString(),
          toolCalls: toolCalls as any,
          toolResults: toolResults as any,
        });
      },
    });

    // Return the streaming response
    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}