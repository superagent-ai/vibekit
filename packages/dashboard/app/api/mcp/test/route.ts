import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Try to import the module fresh
    const mcp = await import('@vibe-kit/mcp-client');
    
    return NextResponse.json({
      success: true,
      version: mcp.MCP_CLIENT_VERSION,
      timestamp: Date.now(),
      env: {
        MCP_CONFIG_PATH: process.env.MCP_CONFIG_PATH || 'not set',
        NODE_ENV: process.env.NODE_ENV,
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
      stack: (error as Error).stack,
    }, { status: 500 });
  }
}