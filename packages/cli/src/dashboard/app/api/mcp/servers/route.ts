import { NextRequest, NextResponse } from 'next/server';
import { getManager } from '@/app/api/mcp/utils';

export async function GET() {
  try {
    const mgr = await getManager();
    const servers = mgr.getAllServers();
    
    return NextResponse.json({ 
      servers: servers.map(server => ({
        ...server,
        status: mgr.isConnected(server.id) ? 'active' : server.status,
      }))
    });
  } catch (error) {
    console.error('Failed to get servers:', error);
    return NextResponse.json(
      { error: 'Failed to get servers' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const mgr = await getManager();
    
    const server = await mgr.addServer({
      name: data.name,
      description: data.description,
      transport: data.transport,
      config: data.config,
    });
    
    return NextResponse.json({ server });
  } catch (error) {
    console.error('Failed to add server:', error);
    return NextResponse.json(
      { error: 'Failed to add server' },
      { status: 500 }
    );
  }
}