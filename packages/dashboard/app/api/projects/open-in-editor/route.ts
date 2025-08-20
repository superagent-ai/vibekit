import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { openInEditor, testEditorConfiguration } from '@/lib/server/editor-utils';
import { EditorSettings } from '@/lib/editor-utils';
import { ErrorResponse } from '@/lib/error-handler';

const settingsPath = path.join(os.homedir(), '.vibekit', 'settings.json');

// Default editor settings
const defaultEditorSettings: EditorSettings = {
  defaultEditor: 'vscode',
  customCommand: '',
  autoDetect: true,
  openInNewWindow: false
};

/**
 * Load editor settings from user configuration
 */
async function loadEditorSettings(): Promise<EditorSettings> {
  try {
    await fs.access(settingsPath);
    const content = await fs.readFile(settingsPath, 'utf8');
    const settings = JSON.parse(content);
    
    return {
      ...defaultEditorSettings,
      ...settings.editor
    };
  } catch {
    return defaultEditorSettings;
  }
}

/**
 * Get project details by ID from the projects system
 */
async function getProjectById(projectId: string): Promise<{ projectRoot: string } | null> {
  try {
    // Import the projects system to get project details directly
    const { getProject } = await import('@vibe-kit/projects');
    const project = await getProject(projectId);
    
    if (project) {
      return { projectRoot: project.projectRoot };
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get project by ID:', error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { projectId, projectPath } = body;

    // Validate input - need either projectId or projectPath
    if (!projectId && !projectPath) {
      return ErrorResponse.create(new Error('Either projectId or projectPath is required'), 
        request.headers.get('x-request-id') || undefined);
    }

    // Determine project path
    let targetPath: string;
    
    if (projectPath) {
      targetPath = projectPath;
    } else {
      // Fetch project details by ID
      const project = await getProjectById(projectId);
      if (!project) {
        return ErrorResponse.create(new Error(`Project not found: ${projectId}`), 
          request.headers.get('x-request-id') || undefined);
      }
      targetPath = project.projectRoot;
    }

    // Load editor settings
    const editorSettings = await loadEditorSettings();

    // Attempt to open in editor
    const result = await openInEditor(targetPath, editorSettings);

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
        command: result.command,
        projectPath: targetPath,
        editor: editorSettings.defaultEditor
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.message,
        projectPath: targetPath,
        editor: editorSettings.defaultEditor
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Failed to open project in editor:', error);
    
    return ErrorResponse.create(error as Error, 
      request.headers.get('x-request-id') || undefined);
  }
}

/**
 * Test editor configuration endpoint
 */
export async function GET(request: NextRequest) {
  try {
    // Load editor settings
    const editorSettings = await loadEditorSettings();

    // Test the configuration
    const result = await testEditorConfiguration(editorSettings);

    return NextResponse.json({
      success: result.success,
      message: result.message,
      detectedCommand: result.detectedCommand,
      editor: editorSettings.defaultEditor,
      settings: editorSettings
    });

  } catch (error) {
    console.error('Failed to test editor configuration:', error);
    
    return ErrorResponse.create(error as Error, 
      request.headers.get('x-request-id') || undefined);
  }
}