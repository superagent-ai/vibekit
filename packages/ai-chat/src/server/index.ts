import { handleChatRequest } from './chat-handler';
import { handleStatusRequest } from './status-handler';
import type { NextRequest } from 'next/server';

// Export handlers for Next.js API routes
export async function POST(request: NextRequest) {
  console.log('[SERVER DEBUG] POST request received at /api/chat');
  
  // Get query parameters
  const { searchParams } = new URL(request.url);
  const queryShowMCPTools = searchParams.get('showMCPTools') === 'true';
  const queryModel = searchParams.get('model');
  const queryWebSearch = searchParams.get('webSearch') === 'true';
  
  console.log('[SERVER DEBUG] URL Analysis:', {
    fullUrl: request.url,
    pathname: new URL(request.url).pathname,
    search: new URL(request.url).search,
    searchParams: Array.from(searchParams.entries())
  });
  
  console.log('[SERVER DEBUG] Query params:', {
    showMCPTools: queryShowMCPTools,
    model: queryModel,
    webSearch: queryWebSearch
  });
  
  // Check if request wants MCP tools
  try {
    const body = await request.clone().json();
    console.log('[SERVER DEBUG] Full request body keys:', Object.keys(body));
    console.log('[SERVER DEBUG] Request summary:', {
      hasMessages: !!body.messages,
      messageCount: body.messages?.length,
      showMCPTools: queryShowMCPTools || body.showMCPTools || body.data?.showMCPTools,
      webSearch: queryWebSearch || body.webSearch || body.data?.webSearch,
      model: queryModel || body.model || body.data?.model,
    });
    
    // Check query params first, then body for showMCPTools
    const showMCPTools = queryShowMCPTools || body.showMCPTools || body.data?.showMCPTools;
    
    if (showMCPTools) {
      console.log('[SERVER DEBUG] MCP tools requested, using MCP handler');
      // Dynamically import MCP handler to avoid requiring MCP client when not needed
      const { handleChatRequestWithMCP } = await import('./chat-handler-with-mcp');
      return handleChatRequestWithMCP(request);
    } else {
      console.log('[SERVER DEBUG] No MCP tools requested, using standard handler');
    }
  } catch (e) {
    console.log('[SERVER DEBUG] Error parsing body, falling back to standard handler:', e);
    // If we can't parse the body, fall back to standard handler
  }
  
  return handleChatRequest(request);
}

export async function GET() {
  return handleStatusRequest();
}

// Named exports for flexibility
export { handleChatRequest, handleStatusRequest };
export { handleChatRequestWithMCP } from './chat-handler-with-mcp';
export { AuthManager } from '../utils/auth';

// Export middleware utilities
export {
  corsMiddleware,
  securityHeaders,
  handleOptions,
  withMiddleware
} from './middleware';