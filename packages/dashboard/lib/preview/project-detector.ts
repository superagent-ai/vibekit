import { promises as fs } from 'fs';
import path from 'path';
import { ProjectType, ProjectDetectionResult } from './types';
import { PortUtils } from './port-utils';

/**
 * Simplified project analyzer that detects dev commands and ports
 */
export class ProjectDetector {
  /**
   * Detect project type and dev server configuration
   */
  static async detectProject(projectRoot: string): Promise<ProjectDetectionResult> {
    try {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const hasPackageJson = await this.fileExists(packageJsonPath);
      
      if (hasPackageJson) {
        const nodeResult = await this.detectNodeProject(projectRoot, packageJsonPath);
        
        // If no web framework detected but has index.html, treat as static
        const hasIndexHtml = await this.fileExists(path.join(projectRoot, 'index.html'));
        if (!nodeResult.framework && hasIndexHtml) {
          return await this.detectStaticProject();
        }
        
        return nodeResult;
      }

      // Check for static HTML projects
      const hasIndexHtml = await this.fileExists(path.join(projectRoot, 'index.html'));
      if (hasIndexHtml) {
        return await this.detectStaticProject();
      }

      // Check for Python projects
      const pythonFiles = await this.findFiles(projectRoot, ['.py']);
      if (pythonFiles.length > 0) {
        return await this.detectPythonProject(projectRoot);
      }

      // Check for other HTML files
      const htmlFiles = await this.findFiles(projectRoot, ['.html']);
      if (htmlFiles.length > 0) {
        return await this.detectStaticProject();
      }

      // Unknown project type - find a random port
      let port: number;
      try {
        port = await PortUtils.getRandomAvailablePort();
      } catch (error) {
        port = 3000; // Last resort fallback
      }

      return {
        type: 'unknown',
        packageManager: 'npm',
        hasLockFile: false,
        devCommand: 'echo "No dev command found"',
        port,
      };
    } catch (error) {
      console.error('Error detecting project:', error);
      
      // Even in error case, try to get an available port
      let port: number;
      try {
        port = await PortUtils.getRandomAvailablePort();
      } catch (portError) {
        port = 3000; // Last resort fallback
      }
      
      return {
        type: 'unknown',
        packageManager: 'npm',
        hasLockFile: false,
        devCommand: 'echo "Project detection failed"',
        port,
      };
    }
  }

  /**
   * Detect Node.js-based projects
   */
  private static async detectNodeProject(
    projectRoot: string, 
    packageJsonPath: string
  ): Promise<ProjectDetectionResult> {
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };
    
    // Detect package manager and lock file
    const packageManager = await this.detectPackageManager(projectRoot);
    const hasLockFile = await this.hasLockFile(projectRoot, packageManager);
    
    // Detect framework and project type
    const framework = this.detectFramework(dependencies);
    const type = this.determineProjectType(framework, dependencies);
    
    // Determine dev command and port
    const devCommand = this.extractDevCommand(packageJson.scripts || {}, packageManager, framework);
    const port = await this.findAvailablePort(packageJson, framework);

    return {
      type,
      framework,
      packageManager,
      hasLockFile,
      devCommand,
      port,
      scripts: packageJson.scripts || {},
    };
  }

  /**
   * Detect Python projects (simplified)
   */
  private static async detectPythonProject(projectRoot: string): Promise<ProjectDetectionResult> {
    const hasRequirementsTxt = await this.fileExists(path.join(projectRoot, 'requirements.txt'));
    const hasPyprojectToml = await this.fileExists(path.join(projectRoot, 'pyproject.toml'));
    const hasAppPy = await this.fileExists(path.join(projectRoot, 'app.py'));
    const hasMainPy = await this.fileExists(path.join(projectRoot, 'main.py'));
    
    let framework: any = undefined;
    let devCommand = 'python main.py';
    let preferredPort = 8000;

    // Check for Flask
    if (hasAppPy) {
      try {
        const appContent = await fs.readFile(path.join(projectRoot, 'app.py'), 'utf8');
        if (appContent.includes('from flask') || appContent.includes('import flask')) {
          framework = { name: 'Flask' };
          devCommand = 'python app.py';
          preferredPort = 5000;
        }
      } catch (error) {
        // Ignore read errors
      }
    }

    // Check for FastAPI
    if (hasMainPy) {
      try {
        const mainContent = await fs.readFile(path.join(projectRoot, 'main.py'), 'utf8');
        if (mainContent.includes('fastapi') || mainContent.includes('FastAPI')) {
          framework = { name: 'FastAPI' };
          preferredPort = 8000;
        }
      } catch (error) {
        // Ignore read errors
      }
    }

    // Use preferred port initially - will be dynamically allocated during server start
    let port = preferredPort;

    // Update dev command to use the found port
    if (framework?.name === 'FastAPI') {
      devCommand = `uvicorn main:app --reload --host 0.0.0.0 --port ${port}`;
    } else if (framework?.name === 'Flask') {
      devCommand = `python app.py`;
      // Flask usually reads port from environment or code
    }

    return {
      type: 'python',
      framework,
      packageManager: 'npm', // Not applicable for Python, but required by type
      hasLockFile: hasRequirementsTxt || hasPyprojectToml,
      devCommand,
      port,
    };
  }

  /**
   * Detect static HTML projects
   */
  private static async detectStaticProject(): Promise<ProjectDetectionResult> {
    // Use a fixed port initially - will be dynamically allocated during server start
    const port = 8080;

    return {
      type: 'static',
      packageManager: 'npm',
      hasLockFile: false,
      devCommand: `npx serve . -l ${port} -s`, // Single page app mode
      port,
      framework: { name: 'Static HTML' },
    };
  }

  /**
   * Check if a framework is a web framework that should override static detection
   */
  private static isWebFramework(framework: any): boolean {
    if (!framework || !framework.name) return false;
    
    const webFrameworks = [
      'Next.js',
      'React (Vite)', 
      'Create React App',
      'Vue.js',
      'Nuxt.js',
      'SvelteKit',
      'Svelte'
    ];
    
    return webFrameworks.includes(framework.name);
  }

  /**
   * Detect framework from dependencies
   */
  private static detectFramework(dependencies: Record<string, string>) {
    // Next.js
    if (dependencies['next']) {
      return {
        name: 'Next.js',
        version: dependencies['next'],
      };
    }

    // React (Vite)
    if (dependencies['vite'] && (dependencies['react'] || dependencies['@vitejs/plugin-react'])) {
      return {
        name: 'React (Vite)',
        version: dependencies['react'],
      };
    }

    // Create React App
    if (dependencies['react-scripts']) {
      return {
        name: 'Create React App',
        version: dependencies['react'],
      };
    }

    // Vue.js
    if (dependencies['vue'] || dependencies['@vue/cli-service']) {
      return {
        name: 'Vue.js',
        version: dependencies['vue'],
      };
    }

    // Nuxt.js
    if (dependencies['nuxt']) {
      return {
        name: 'Nuxt.js',
        version: dependencies['nuxt'],
      };
    }

    // Express.js
    if (dependencies['express']) {
      return {
        name: 'Express.js',
        version: dependencies['express'],
      };
    }

    // Svelte
    if (dependencies['svelte'] || dependencies['@sveltejs/kit']) {
      return {
        name: dependencies['@sveltejs/kit'] ? 'SvelteKit' : 'Svelte',
        version: dependencies['svelte'],
      };
    }

    return undefined;
  }

  /**
   * Determine project type from framework
   */
  private static determineProjectType(
    framework: any, 
    dependencies: Record<string, string>
  ): ProjectType {
    if (!framework) {
      if (dependencies['express'] || dependencies['fastify'] || dependencies['koa']) {
        return 'node';
      }
      return 'unknown';
    }

    switch (framework.name) {
      case 'Next.js':
        return 'nextjs';
      case 'React (Vite)':
      case 'Create React App':
        return 'react';
      case 'Vue.js':
      case 'Nuxt.js':
        return 'vue';
      case 'Express.js':
        return 'node';
      default:
        return 'node';
    }
  }

  /**
   * Extract dev command from package.json scripts
   */
  private static extractDevCommand(
    scripts: Record<string, string>, 
    packageManager: string, 
    framework: any
  ): string {
    const pm = packageManager === 'npm' ? 'npm run' : packageManager;

    // Look for dev script first
    if (scripts['dev']) {
      return `${pm} dev`;
    }

    // Look for alternatives
    if (scripts['start:dev']) {
      return `${pm} start:dev`;
    }

    if (scripts['develop']) {
      return `${pm} develop`;
    }

    // Framework-specific fallbacks
    if (framework?.name === 'Next.js') {
      return `${pm} dev`;
    }

    if (scripts['start']) {
      return `${pm} start`;
    }

    // Default fallback
    return `${pm} start`;
  }

  /**
   * Find an available port for the project
   */
  private static async findAvailablePort(packageJson: any, framework: any): Promise<number> {
    // Check if user has specified a preferred port in package.json
    let preferredPort: number | undefined;
    
    if (packageJson.config?.port) {
      const configuredPort = parseInt(packageJson.config.port, 10);
      if (PortUtils.isValidPort(configuredPort)) {
        preferredPort = configuredPort;
      }
    }

    // If no preferred port, use framework defaults
    if (!preferredPort) {
      const frameworkPorts = PortUtils.getFrameworkDefaultPorts(framework?.name);
      preferredPort = frameworkPorts[0];
    }

    try {
      // Try to find an available port starting from the preferred port
      return await Promise.race([
        PortUtils.findAvailablePort(preferredPort),
        new Promise<number>((_, reject) => 
          setTimeout(() => reject(new Error('Port detection timeout')), 5000)
        )
      ]);
    } catch (error) {
      console.warn(`Failed to find port starting from ${preferredPort}, using fallback:`, error);
      // If all else fails, return the preferred port (let the dev server handle conflicts)
      return preferredPort;
    }
  }

  /**
   * Detect package manager from lock files
   */
  private static async detectPackageManager(projectRoot: string): Promise<'npm' | 'yarn' | 'pnpm' | 'bun'> {
    if (await this.fileExists(path.join(projectRoot, 'bun.lockb'))) {
      return 'bun';
    }
    if (await this.fileExists(path.join(projectRoot, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (await this.fileExists(path.join(projectRoot, 'yarn.lock'))) {
      return 'yarn';
    }
    return 'npm';
  }

  /**
   * Check if project has a lock file
   */
  private static async hasLockFile(projectRoot: string, packageManager: string): Promise<boolean> {
    const lockFiles = {
      npm: 'package-lock.json',
      yarn: 'yarn.lock',
      pnpm: 'pnpm-lock.yaml',
      bun: 'bun.lockb',
    };
    
    const lockFile = lockFiles[packageManager as keyof typeof lockFiles];
    return await this.fileExists(path.join(projectRoot, lockFile));
  }

  /**
   * Check if file exists
   */
  private static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find files with specific extensions
   */
  private static async findFiles(dir: string, extensions: string[]): Promise<string[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      
      for (const entry of entries) {
        if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(path.join(dir, entry.name));
          }
        }
      }
      
      return files;
    } catch {
      return [];
    }
  }
}