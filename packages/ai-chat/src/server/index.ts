import { handleChatRequest } from './chat-handler';
import { handleStatusRequest } from './status-handler';
import type { NextRequest } from 'next/server';

// Export handlers for Next.js API routes
export async function POST(request: NextRequest) {
  // Check if request wants MCP tools
  try {
    const body = await request.clone().json();
    if (body.data?.showMCPTools) {
      // Dynamically import MCP handler to avoid requiring MCP client when not needed
      const { handleChatRequestWithMCP } = await import('./chat-handler-with-mcp');
      return handleChatRequestWithMCP(request);
    }
  } catch (e) {
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