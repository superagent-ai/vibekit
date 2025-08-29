import { NextRequest, NextResponse } from 'next/server';
import { createLogger } from '@vibe-kit/logger';
import { PreviewService } from '@vibe-kit/preview';

const logger = createLogger('PreviewStartAPI');

/**
 * POST /api/projects/[id]/preview/start
 * Start a dev server for a project
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  try {
    const body = await request.json();
    const { projectRoot, customPort } = body;
    
    if (!projectRoot) {
      return NextResponse.json(
        { success: false, error: 'Project root is required' },
        { status: 400 }
      );
    }
    
    // Validate custom port if provided
    if (customPort !== undefined) {
      if (!Number.isInteger(customPort) || customPort <= 0 || customPort > 65535) {
        return NextResponse.json(
          { success: false, error: 'Custom port must be a valid integer between 1 and 65535' },
          { status: 400 }
        );
      }
    }
    
    const previewService = new PreviewService();
    
    logger.info('Starting dev server', { projectId, projectRoot, customPort });
    
    // Start the dev server with optional custom port
    const instance = await previewService.startServer(projectId, projectRoot, customPort);
    
    logger.info('Dev server started successfully', { 
      projectId,
      instanceId: instance.id,
      previewUrl: instance.previewUrl 
    });
    
    return NextResponse.json({
      success: true,
      instance,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    logger.error('Failed to start dev server', { 
      projectId,
      error: errorMessage
    });
    
    return NextResponse.json(
      { success: false, error: `Failed to start dev server: ${errorMessage}` },
      { status: 500 }
    );
  }
}