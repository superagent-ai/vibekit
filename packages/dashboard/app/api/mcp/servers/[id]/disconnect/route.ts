import { NextRequest, NextResponse } from 'next/server';
import { getManager, resolveParams } from '@/app/api/mcp/utils';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await resolveParams(context.params);
    const mgr = await getManager();
    await mgr.disconnect(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect from server:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}