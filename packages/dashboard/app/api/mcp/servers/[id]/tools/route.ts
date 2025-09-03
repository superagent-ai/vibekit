import { NextRequest, NextResponse } from 'next/server';
import { getManager, resolveParams } from '@/app/api/mcp/utils';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await resolveParams(context.params);
    const mgr = await getManager();
    
    if (!mgr.isConnected(id)) {
      return NextResponse.json(
        { error: 'Server is not connected' },
        { status: 400 }
      );
    }
    
    const tools = await mgr.getTools(id);
    
    return NextResponse.json({ tools });
  } catch (error) {
    console.error('Failed to get tools:', error);
    return NextResponse.json(
      { error: 'Failed to get tools' },
      { status: 500 }
    );
  }
}