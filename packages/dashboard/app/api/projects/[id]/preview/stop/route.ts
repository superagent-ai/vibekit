import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@vibe-kit/logger';
import { PreviewService } from '@vibe-kit/preview';

const logger = createLogger('PreviewStopAPI');

/**
 * POST /api/projects/[id]/preview/stop
 * Stop a dev server for a project
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  try {
    const previewService = new PreviewService();
    
    logger.info('Stopping dev server', { projectId });
    
    await previewService.stopServer(projectId);
    
    logger.info('Dev server stopped successfully', { projectId });
    
    return NextResponse.json({
      success: true,
      message: 'Dev server stopped successfully',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('Failed to stop dev server', { 
      projectId,
      error: errorMessage
    });
    
    return NextResponse.json(
      { success: false, error: `Failed to stop dev server: ${errorMessage}` },
      { status: 500 }
    );
  }
}