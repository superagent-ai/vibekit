import { NextRequest, NextResponse } from 'next/server';
import { getManager, resolveParams } from '@/app/api/mcp/utils';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id } = await resolveParams(context.params);
    
    console.log('Connecting to MCP server:', id);
    const mgr = await getManager();
    
    // Get server details for logging
    const server = mgr.getServer(id);
    if (!server) {
      console.error('Server not found:', id);
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }
    
    console.log('Server details:', {
      name: server.name,
      transport: server.transport,
      config: server.config,
    });
    
    await mgr.connect(id);
    
    // Get updated server with counts
    const updatedServer = mgr.getServer(id);
    
    return NextResponse.json({ 
      success: true,
      server: updatedServer 
    });
  } catch (error) {
    console.error('Failed to connect to server:', error);
    console.error('Error stack:', (error as Error).stack);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}