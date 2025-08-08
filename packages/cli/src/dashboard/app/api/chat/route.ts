import { streamText, convertToCoreMessages } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ClaudeAuth } from '@vibe-kit/auth/node';
import { MCPClientManager } from '@vibe-kit/mcp-client';
import { MCPToAISDKAdapter } from '@vibe-kit/ai-chat';
import fs from 'fs/promises';
import { readFileSync } from 'fs';
import path from 'path';
import os from 'os';
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
  // Silent fail - will use OAuth
}

// Simple session storage
const sessions = new Map<string, any[]>();

// Initialize MCP components
let mcpManager: MCPClientManager | null = null;
let mcpAdapter: MCPToAISDKAdapter | null = null;

async function initializeMCP() {
  if (!mcpManager) {
    try {
      mcpManager = new MCPClientManager();
      await mcpManager.initialize();
      mcpAdapter = new MCPToAISDKAdapter(mcpManager);
    } catch (e) {
      console.log('MCP initialization failed:', e);
    }
  }
  return mcpAdapter;
}

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
        console.log('Using OAuth authentication');
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
    console.log('OAuth not available:', e.message);
  }
  
  // Fall back to API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    console.log('Using API key authentication');
    return createAnthropic({
      apiKey: apiKey,
    });
  }
  
  throw new Error('No authentication method available. Please set ANTHROPIC_API_KEY or authenticate with OAuth.');
}

export async function POST(req: Request) {
  try {
    console.log('Chat API: Processing request...');
    
    // Parse request
    const body = await req.json();
    console.log('Chat API: Body parsed:', JSON.stringify(body, null, 2));
    const { messages, sessionId: providedSessionId, model, showMCPTools } = body;
    
    if (!messages || messages.length === 0) {
      return new Response('Messages are required', { status: 400 });
    }

    // Use provided sessionId or generate one
    const sessionId = providedSessionId || crypto.randomUUID();
    
    // Get or create session messages
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }
    
    // Get Claude client with OAuth or API key
    console.log('Chat API: Getting Claude client...');
    const anthropic = await getClaudeClient();
    const modelId = model || 'claude-3-5-sonnet-20241022';
    console.log('Chat API: Using model:', modelId);
    
    // Initialize MCP tools if requested
    let tools = undefined;
    if (showMCPTools !== false) {
      try {
        const adapter = await initializeMCP();
        if (adapter) {
          tools = await adapter.getTools();
          console.log('MCP tools loaded:', Object.keys(tools || {}).length);
        }
      } catch (e) {
        console.log('MCP tools not available:', e);
      }
    }
    
    // Stream the response
    console.log('Chat API: Starting stream with messages:', messages);
    const result = await streamText({
      model: anthropic(modelId),
      messages: convertToCoreMessages(messages),
      tools,
      temperature: 0.7,
      maxTokens: 4096,
      onFinish: async ({ text, toolCalls, toolResults }) => {
        // Save messages to session for persistence
        const sessionMessages = sessions.get(sessionId) || [];
        
        // Add the last user message
        const lastUserMessage = messages[messages.length - 1];
        sessionMessages.push({
          id: crypto.randomUUID(),
          role: 'user',
          content: lastUserMessage.content,
        });
        
        // Add the assistant response with tool information if present
        sessionMessages.push({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: text,
          toolInvocations: toolCalls,
          toolResults: toolResults,
        });
        
        sessions.set(sessionId, sessionMessages);
      },
    });

    // Return the streaming response
    return result.toDataStreamResponse();
  } catch (error: any) {
    console.error('Chat API error:', error);
    console.error('Error stack:', error?.stack);
    
    // For AI SDK, we need to return the error in the stream format
    const errorMessage = error?.message || 'Internal server error';
    
    // Return as streaming error format
    return new Response(
      `3:"${errorMessage.replace(/"/g, '\\"')}"`,
      { 
        status: 200, // AI SDK expects 200 with error in stream
        headers: { 
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Content-Type-Options': 'nosniff',
        }
      }
    );
  }
}