import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@vibe-kit/logger';
import { PreviewService } from '@vibe-kit/preview';

const logger = createLogger('PreviewActivityAPI');

/**
 * POST /api/projects/[id]/preview/activity
 * Update server activity to prevent idle cleanup
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  try {
    const previewService = new PreviewService();
    
    // Update server activity
    await previewService.updateActivity(projectId);
    
    return NextResponse.json({
      success: true,
      message: 'Server activity updated',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('Failed to update server activity', { 
      projectId,
      error: errorMessage
    });
    
    return NextResponse.json(
      { success: false, error: `Failed to update server activity: ${errorMessage}` },
      { status: 500 }
    );
  }
}