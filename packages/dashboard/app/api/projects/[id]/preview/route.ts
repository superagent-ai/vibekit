import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@vibe-kit/logger';
import { PreviewService } from '@vibe-kit/preview';

const logger = createLogger('PreviewAPI');

/**
 * GET /api/projects/[id]/preview
 * Get current dev server status for a project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  try {
    const previewService = new PreviewService();
    
    const status = await previewService.getServerStatus(projectId);
    const instance = status; // getServerStatus returns the full instance
    
    logger.debug('Retrieved dev server status', { projectId, status, hasInstance: !!instance });
    
    return NextResponse.json({
      success: true,
      instance,
      status,
    });
  } catch (error) {
    logger.error('Failed to get dev server status', { 
      projectId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return NextResponse.json(
      { success: false, error: 'Failed to get dev server status' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/projects/[id]/preview
 * Stop dev server for a project
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  try {
    const previewService = new PreviewService();
    
    await previewService.stopServer(projectId);
    
    logger.info('Dev server stopped', { projectId });
    
    return NextResponse.json({
      success: true,
      message: 'Dev server stopped successfully',
    });
  } catch (error) {
    logger.error('Failed to stop dev server', { 
      projectId,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    
    return NextResponse.json(
      { success: false, error: 'Failed to stop dev server' },
      { status: 500 }
    );
  }
}