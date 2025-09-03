import { NextRequest, NextResponse } from 'next/server';
import { getManager, resolveParams } from '@/app/api/mcp/utils';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; name: string }> }
) {
  try {
    const { id, name } = await resolveParams(context.params);
    const { params: toolParams } = await request.json();
    const mgr = await getManager();
    
    if (!mgr.isConnected(id)) {
      return NextResponse.json(
        { error: 'Server is not connected' },
        { status: 400 }
      );
    }
    
    const result = await mgr.executeTool(id, name, toolParams);
    
    return NextResponse.json({ result });
  } catch (error) {
    console.error('Failed to execute tool:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}