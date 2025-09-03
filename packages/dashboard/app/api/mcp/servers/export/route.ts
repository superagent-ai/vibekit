import { NextResponse } from 'next/server';
import { getManager } from '@/app/api/mcp/utils';

export async function GET() {
  try {
    const mgr = await getManager();
    const config = await mgr.exportConfig();
    
    return new NextResponse(config, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="mcp-servers-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Failed to export config:', error);
    return NextResponse.json(
      { error: 'Failed to export config' },
      { status: 500 }
    );
  }
}