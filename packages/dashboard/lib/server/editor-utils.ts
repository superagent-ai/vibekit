/**
 * Server-side editor utilities for opening projects in preferred code editors
 * 
 * This file contains all Node.js-specific functionality for editor detection and launching.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { existsSync, accessSync, constants } from 'fs';
import os from 'os';
import { SUPPORTED_EDITORS, EditorSettings, EditorConfig } from '../editor-utils';

const execAsync = promisify(exec);

/**
 * Get editors available for the current platform
 */
export function getAvailableEditors(): EditorConfig[] {
  const platform = os.platform() as keyof EditorConfig['commands'];
  
  return SUPPORTED_EDITORS.filter(editor => {
    // If platform restricted, check if current platform is allowed
    if (editor.platformRestricted) {
      return editor.platformRestricted.includes(platform);
    }
    
    // Otherwise, check if editor has commands for this platform
    return editor.commands[platform] || editor.id === 'custom';
  });
}

/**
 * Expand environment variables in paths (Windows)
 */
function expandEnvVars(path: string): string {
  if (os.platform() === 'win32') {
    return path.replace(/%([^%]+)%/g, (match, varName) => {
      return process.env[varName] || match;
    });
  }
  return path;
}

/**
 * Check if a command exists in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    const platform = os.platform();
    const cmd = platform === 'win32' ? 'where' : 'which';
    await execAsync(`${cmd} ${command}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file path exists and is executable
 */
function pathExists(filePath: string): boolean {
  try {
    const expandedPath = expandEnvVars(filePath);
    accessSync(expandedPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect if an editor is installed on the system
 */
export async function detectEditor(editorId: string): Promise<string | null> {
  if (editorId === 'custom' || editorId === 'system') {
    return editorId;
  }

  const editor = SUPPORTED_EDITORS.find(e => e.id === editorId);
  if (!editor) return null;

  const platform = os.platform() as keyof EditorConfig['commands'];
  const commands = editor.commands[platform] || [];
  const detectPaths = editor.detectPaths?.[platform] || [];

  // First, try commands in PATH
  for (const command of commands) {
    if (await commandExists(command)) {
      return command;
    }
  }

  // Then, try known installation paths
  for (const pathTemplate of detectPaths) {
    // Handle wildcard paths (like JetBrains IDEs with version numbers)
    if (pathTemplate.includes('*')) {
      // This is a simplified wildcard handling - in production you'd want more robust globbing
      continue;
    }
    
    if (pathExists(pathTemplate)) {
      return expandEnvVars(pathTemplate);
    }
  }

  return null;
}

/**
 * Auto-detect the best available editor
 */
export async function autoDetectEditor(): Promise<string | null> {
  const availableEditors = getAvailableEditors();
  
  // Prioritize popular editors
  const priorityOrder = ['vscode', 'cursor', 'sublime', 'webstorm', 'vim', 'nvim'];
  
  // First try priority editors
  for (const editorId of priorityOrder) {
    const detectedCommand = await detectEditor(editorId);
    if (detectedCommand) {
      return editorId;
    }
  }
  
  // Then try remaining editors
  for (const editor of availableEditors) {
    if (!priorityOrder.includes(editor.id) && editor.id !== 'system' && editor.id !== 'custom') {
      const detectedCommand = await detectEditor(editor.id);
      if (detectedCommand) {
        return editor.id;
      }
    }
  }
  
  return null;
}

/**
 * Generate command to open a project path in the specified editor
 */
export async function generateEditorCommand(
  editorId: string,
  projectPath: string,
  settings: EditorSettings
): Promise<{ command: string; args: string[] } | null> {
  if (editorId === 'custom') {
    if (!settings.customCommand.trim()) {
      throw new Error('Custom command is not configured');
    }
    
    const parts = settings.customCommand.trim().split(' ');
    const command = parts[0];
    const args = [...parts.slice(1), projectPath];
    
    return { command, args };
  }

  if (editorId === 'system') {
    const platform = os.platform();
    
    if (platform === 'darwin') {
      return { command: 'open', args: [projectPath] };
    } else if (platform === 'win32') {
      return { command: 'explorer', args: [projectPath] };
    } else {
      return { command: 'xdg-open', args: [projectPath] };
    }
  }

  // Detect the actual command for the editor
  const detectedCommand = await detectEditor(editorId);
  if (!detectedCommand) {
    // Try auto-detect if enabled
    if (settings.autoDetect) {
      const autoDetected = await autoDetectEditor();
      if (autoDetected) {
        return generateEditorCommand(autoDetected, projectPath, settings);
      }
    }
    
    throw new Error(`Editor '${editorId}' is not installed or not found in PATH`);
  }

  const editor = SUPPORTED_EDITORS.find(e => e.id === editorId)!;
  const args = [projectPath];

  // Add new window flag for supported editors
  if (settings.openInNewWindow) {
    if (['vscode', 'cursor'].includes(editorId)) {
      args.unshift('--new-window');
    } else if (['sublime'].includes(editorId)) {
      args.unshift('--new-window');
    }
  }

  return { command: detectedCommand, args };
}

/**
 * Convert WSL path to Windows path if needed
 */
async function convertWSLPath(projectPath: string): Promise<string> {
  if (os.platform() === 'win32' && projectPath.startsWith('/')) {
    try {
      const { stdout } = await execAsync(`wsl wslpath -w "${projectPath}"`);
      return stdout.trim();
    } catch {
      // If wslpath fails, return original path
      return projectPath;
    }
  }
  return projectPath;
}

/**
 * Open a project path in the configured editor
 */
export async function openInEditor(
  projectPath: string,
  settings: EditorSettings
): Promise<{ success: boolean; message: string; command?: string }> {
  try {
    // Validate project path exists
    if (!existsSync(projectPath)) {
      return {
        success: false,
        message: `Project path does not exist: ${projectPath}`
      };
    }

    // Convert WSL paths if needed
    const convertedPath = await convertWSLPath(projectPath);

    // Generate command
    const commandInfo = await generateEditorCommand(settings.defaultEditor, convertedPath, settings);
    
    if (!commandInfo) {
      return {
        success: false,
        message: `Unable to generate command for editor: ${settings.defaultEditor}`
      };
    }

    const { command, args } = commandInfo;

    // Execute the command
    const editor = SUPPORTED_EDITORS.find(e => e.id === settings.defaultEditor);
    
    if (editor?.requiresShell) {
      // For terminal editors like vim, use shell execution
      const fullCommand = `${command} ${args.map(arg => `"${arg}"`).join(' ')}`;
      await execAsync(fullCommand);
    } else {
      // For GUI editors, spawn the process
      const { spawn } = require('child_process');
      const child = spawn(command, args, {
        detached: true,
        stdio: 'ignore'
      });
      
      child.unref();
    }

    const editorName = editor?.name || settings.defaultEditor;
    const fullCommand = `${command} ${args.join(' ')}`;

    return {
      success: true,
      message: `Successfully opened project in ${editorName}`,
      command: fullCommand
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return {
      success: false,
      message: `Failed to open editor: ${errorMessage}`
    };
  }
}

/**
 * Test editor configuration
 */
export async function testEditorConfiguration(
  settings: EditorSettings
): Promise<{ success: boolean; message: string; detectedCommand?: string }> {
  try {
    if (settings.defaultEditor === 'custom') {
      if (!settings.customCommand.trim()) {
        return {
          success: false,
          message: 'Custom command is not configured'
        };
      }
      
      const command = settings.customCommand.trim().split(' ')[0];
      const exists = await commandExists(command);
      
      return {
        success: exists,
        message: exists 
          ? `Custom command '${command}' is available`
          : `Custom command '${command}' not found in PATH`,
        detectedCommand: exists ? settings.customCommand : undefined
      };
    }

    if (settings.defaultEditor === 'system') {
      return {
        success: true,
        message: 'System default file handler will be used',
        detectedCommand: 'system'
      };
    }

    const detectedCommand = await detectEditor(settings.defaultEditor);
    
    if (detectedCommand) {
      const editor = SUPPORTED_EDITORS.find(e => e.id === settings.defaultEditor);
      return {
        success: true,
        message: `${editor?.name || settings.defaultEditor} is installed and available`,
        detectedCommand
      };
    }

    // Try auto-detect if enabled
    if (settings.autoDetect) {
      const autoDetected = await autoDetectEditor();
      if (autoDetected) {
        const editor = SUPPORTED_EDITORS.find(e => e.id === autoDetected);
        return {
          success: true,
          message: `${editor?.name || autoDetected} was auto-detected as fallback`,
          detectedCommand: await detectEditor(autoDetected) || undefined
        };
      }
    }

    const editor = SUPPORTED_EDITORS.find(e => e.id === settings.defaultEditor);
    return {
      success: false,
      message: `${editor?.name || settings.defaultEditor} is not installed or not found in PATH`
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return {
      success: false,
      message: `Failed to test editor configuration: ${errorMessage}`
    };
  }
}