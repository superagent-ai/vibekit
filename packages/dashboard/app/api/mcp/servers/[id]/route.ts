import { NextRequest, NextResponse } from 'next/server';
import { getManager, resolveParams } from '@/app/api/mcp/utils';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await resolveParams(context.params);
    const mgr = await getManager();
    const server = mgr.getServer(id);
    
    if (!server) {
      return NextResponse.json(
        { error: 'Server not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json({ 
      server: {
        ...server,
        status: mgr.isConnected(id) ? 'active' : server.status,
      }
    });
  } catch (error) {
    console.error('Failed to get server:', error);
    return NextResponse.json(
      { error: 'Failed to get server' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await resolveParams(context.params);
    const data = await request.json();
    const mgr = await getManager();
    
    const server = await mgr.updateServer(id, {
      name: data.name,
      description: data.description,
      config: data.config,
    });
    
    return NextResponse.json({ server });
  } catch (error) {
    console.error('Failed to update server:', error);
    return NextResponse.json(
      { error: 'Failed to update server' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await resolveParams(context.params);
    const mgr = await getManager();
    await mgr.removeServer(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete server:', error);
    return NextResponse.json(
      { error: 'Failed to delete server' },
      { status: 500 }
    );
  }
}