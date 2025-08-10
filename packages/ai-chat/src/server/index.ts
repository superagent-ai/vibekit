import { handleChatRequest } from './chat-handler';
import { handleStatusRequest } from './status-handler';
import type { NextRequest } from 'next/server';

// Export handlers for Next.js API routes
export async function POST(request: NextRequest) {
  return handleChatRequest(request);
}

export async function GET() {
  return handleStatusRequest();
}

// Named exports for flexibility
export { handleChatRequest, handleStatusRequest };