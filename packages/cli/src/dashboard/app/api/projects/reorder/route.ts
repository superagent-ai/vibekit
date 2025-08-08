import { NextRequest, NextResponse } from 'next/server';
import { readProjectsConfig, writeProjectsConfig } from '@/lib/projects';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projects: projectUpdates } = body;

    if (!projectUpdates || !Array.isArray(projectUpdates)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Read current projects config
    const config = await readProjectsConfig();

    // Update ranks for each project
    for (const update of projectUpdates) {
      if (config.projects[update.id]) {
        config.projects[update.id].rank = update.rank;
      }
    }

    // Write updated config back to disk
    await writeProjectsConfig(config);

    return NextResponse.json({ 
      success: true,
      message: 'Project order updated successfully'
    });
  } catch (error) {
    console.error('Failed to reorder projects:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to reorder projects' },
      { status: 500 }
    );
  }
}