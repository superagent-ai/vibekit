import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@vibe-kit/logger';
import { DevServerManager } from '@/lib/preview/dev-server-manager';

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
    const devServerManager = DevServerManager.getInstance();
    
    const instance = await devServerManager.getServerInstance(projectId);
    const status = await devServerManager.getServerStatus(projectId);
    
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
    const devServerManager = DevServerManager.getInstance();
    
    await devServerManager.stopDevServer(projectId);
    
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