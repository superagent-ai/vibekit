import { promises as fs } from 'fs';
import path from 'path';
import { ProjectType, ProjectDetectionResult } from '../types/index.js';

/**
 * Simple synchronous project detector that doesn't hang the dashboard
 */
export class SimpleProjectDetector {
  /**
   * Detect project type with minimal async operations
   */
  static async detectProject(projectRoot: string): Promise<ProjectDetectionResult> {
    try {
      // Check for index.html first (static projects)
      const hasIndexHtml = await this.fileExists(path.join(projectRoot, 'index.html'));
      if (hasIndexHtml) {
        return this.createStaticResult();
      }

      // Check for package.json
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const hasPackageJson = await this.fileExists(packageJsonPath);
      
      if (hasPackageJson) {
        try {
          const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
          return this.analyzeNodeProject(packageJson);
        } catch (error) {
          console.warn('Failed to parse package.json, defaulting to static:', error);
          return this.createStaticResult();
        }
      }

      // Check for Python files
      const hasPythonFiles = await this.hasFilesWithExtension(projectRoot, '.py');
      if (hasPythonFiles) {
        return this.createPythonResult();
      }

      // Default to static if any HTML files found
      const hasHtmlFiles = await this.hasFilesWithExtension(projectRoot, '.html');
      if (hasHtmlFiles) {
        return this.createStaticResult();
      }

      // Unknown project type
      return this.createUnknownResult();
    } catch (error) {
      console.error('Project detection error:', error);
      return this.createStaticResult(); // Safe fallback
    }
  }

  private static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private static async hasFilesWithExtension(dir: string, ext: string): Promise<boolean> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries.some(entry => entry.isFile() && entry.name.endsWith(ext));
    } catch {
      return false;
    }
  }

  private static analyzeNodeProject(packageJson: any): ProjectDetectionResult {
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    const scripts = packageJson.scripts || {};

    // Detect framework
    let framework: any = undefined;
    let devCommand = 'npm start';
    let port = 3000;

    if (dependencies['next']) {
      framework = { name: 'Next.js' };
      devCommand = 'npm run dev';
      port = 3000;
    } else if (dependencies['react'] && dependencies['vite']) {
      framework = { name: 'React (Vite)' };
      devCommand = 'npm run dev';
      port = 5173;
    } else if (dependencies['react-scripts']) {
      framework = { name: 'Create React App' };
      devCommand = 'npm start';
      port = 3000;
    } else if (dependencies['vue']) {
      framework = { name: 'Vue.js' };
      devCommand = 'npm run serve';
      port = 8080;
    } else if (dependencies['express']) {
      framework = { name: 'Express.js' };
      devCommand = 'npm start';
      port = 3000;
    }

    // Override with actual scripts if available
    if (scripts['dev']) {
      devCommand = 'npm run dev';
    } else if (scripts['start:dev']) {
      devCommand = 'npm run start:dev';
    } else if (scripts['serve']) {
      devCommand = 'npm run serve';
    } else if (scripts['start']) {
      devCommand = 'npm start';
    }

    return {
      type: framework ? this.getProjectTypeFromFramework(framework.name) : 'node',
      framework,
      packageManager: 'npm',
      hasLockFile: true,
      devCommand,
      port,
      scripts,
    };
  }

  private static getProjectTypeFromFramework(frameworkName: string): ProjectType {
    switch (frameworkName) {
      case 'Next.js':
        return 'nextjs';
      case 'React (Vite)':
      case 'Create React App':
        return 'react';
      case 'Vue.js':
        return 'vue';
      case 'Express.js':
        return 'node';
      default:
        return 'node';
    }
  }

  private static createStaticResult(): ProjectDetectionResult {
    return {
      type: 'static',
      framework: { name: 'Static HTML' },
      packageManager: 'npm',
      hasLockFile: false,
      devCommand: `node ${path.join(__dirname, '..', 'server', 'StaticServer.js')} . 8080 127.0.0.1`,
      port: 8080,
    };
  }

  private static createPythonResult(): ProjectDetectionResult {
    return {
      type: 'python',
      framework: { name: 'Python Server' },
      packageManager: 'npm',
      hasLockFile: false,
      devCommand: 'python3 -m http.server 8000 --bind 127.0.0.1',
      port: 8000,
    };
  }

  private static createUnknownResult(): ProjectDetectionResult {
    return {
      type: 'unknown',
      framework: undefined,
      packageManager: 'npm',
      hasLockFile: false,
      devCommand: 'echo "No suitable dev command found"',
      port: 3000,
    };
  }
}