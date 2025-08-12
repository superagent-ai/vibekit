import { NextRequest, NextResponse } from 'next/server';
import { getAnalyticsData, generateSummary } from '@/lib/analytics';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    const agentName = searchParams.get('agent') || undefined;

    const analytics = await getAnalyticsData(days, agentName);
    const summary = generateSummary(analytics);
    
    return NextResponse.json(summary);
  } catch (error) {
    console.error('Failed to generate analytics summary:', error);
    return NextResponse.json(
      { error: 'Failed to generate analytics summary' },
      { status: 500 }
    );
  }
}