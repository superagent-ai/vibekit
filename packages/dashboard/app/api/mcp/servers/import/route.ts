import { NextRequest, NextResponse } from 'next/server';
import { getManager } from '@/app/api/mcp/utils';

export async function POST(request: NextRequest) {
  try {
    const jsonData = await request.text();
    const mgr = await getManager();
    
    await mgr.importConfig(jsonData);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to import config:', error);
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}