import os from 'os';
import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import crypto from 'crypto';

/**
 * Collects system information for analytics
 * @returns {Promise<Object>} System information object
 */
export async function collectSystemInfo() {
  const systemInfo = {
    // Essential System Info
    machineId: getMachineId(),
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    totalMemory: os.totalmem(),
    cpuCores: os.cpus().length,
    
    // Development Environment
    nodeVersion: process.version,
    shell: process.env.SHELL,
    terminal: process.env.TERM_PROGRAM,
    gitVersion: await getGitVersion(),
    
    // Project Context
    projectName: await getProjectName(),
    projectLanguage: await detectProjectLanguage(),
    projectType: await detectProjectType(),
    gitBranch: await getGitBranch(),
    gitStatus: await getGitStatus(),
    projectFileCount: await getProjectFileCount(),
  };

  return systemInfo;
}

/**
 * Generate a consistent machine identifier based on hostname and hardware
 */
function getMachineId() {
  try {
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    
    // Create a consistent identifier from machine characteristics
    const machineString = `${hostname}-${platform}-${arch}-${cpus.length}-${totalMem}`;
    
    // Hash it to create a shorter, consistent identifier
    const hash = crypto.createHash('sha256').update(machineString).digest('hex');
    return hash.substring(0, 16); // First 16 characters for readability
  } catch (error) {
    // Fallback to hostname + random if anything fails
    const hostname = os.hostname() || 'unknown';
    return `${hostname}-${Date.now().toString(36)}`;
  }
}

/**
 * Get project name from various sources
 */
async function getProjectName() {
  const cwd = process.cwd();
  
  try {
    // Try package.json first
    const packageJsonPath = path.join(cwd, 'package.json');
    if (await fs.pathExists(packageJsonPath)) {
      const packageJson = await fs.readJson(packageJsonPath);
      if (packageJson.name) {
        return packageJson.name;
      }
    }
    
    // Try Cargo.toml
    const cargoTomlPath = path.join(cwd, 'Cargo.toml');
    if (await fs.pathExists(cargoTomlPath)) {
      const cargoContent = await fs.readFile(cargoTomlPath, 'utf8');
      const nameMatch = cargoContent.match(/^name\s*=\s*["']([^"']+)["']/m);
      if (nameMatch) {
        return nameMatch[1];
      }
    }
    
    // Try composer.json
    const composerJsonPath = path.join(cwd, 'composer.json');
    if (await fs.pathExists(composerJsonPath)) {
      const composerJson = await fs.readJson(composerJsonPath);
      if (composerJson.name) {
        return composerJson.name;
      }
    }
    
    // Try pyproject.toml
    const pyprojectPath = path.join(cwd, 'pyproject.toml');
    if (await fs.pathExists(pyprojectPath)) {
      const pyprojectContent = await fs.readFile(pyprojectPath, 'utf8');
      const nameMatch = pyprojectContent.match(/^name\s*=\s*["']([^"']+)["']/m);
      if (nameMatch) {
        return nameMatch[1];
      }
    }
    
    // Try git repository name (only if in a git repo)
    if (isGitRepository()) {
      try {
        const remoteUrl = execSync('git config --get remote.origin.url', { 
          encoding: 'utf8', 
          timeout: 5000,
          cwd: process.cwd()
        }).trim();
        
        // Extract repo name from various git URL formats
        const urlMatch = remoteUrl.match(/\/([^/]+?)(\.git)?$/);
        if (urlMatch && urlMatch[1]) {
          return urlMatch[1];
        }
      } catch (error) {
        // Git command failed, continue to fallback
      }
    }
    
    // Fallback to directory name
    return path.basename(cwd);
    
  } catch (error) {
    // Final fallback
    return path.basename(cwd) || 'unknown';
  }
}

/**
 * Get Git version if available
 */
async function getGitVersion() {
  try {
    const version = execSync('git --version', { encoding: 'utf8', timeout: 5000 });
    return version.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Detect project language from common files
 */
async function detectProjectLanguage() {
  const cwd = process.cwd();
  
  const languageIndicators = [
    { file: 'package.json', language: 'JavaScript/Node.js' },
    { file: 'Cargo.toml', language: 'Rust' },
    { file: 'pyproject.toml', language: 'Python' },
    { file: 'requirements.txt', language: 'Python' },
    { file: 'pom.xml', language: 'Java' },
    { file: 'build.gradle', language: 'Java/Kotlin' },
    { file: 'go.mod', language: 'Go' },
    { file: 'composer.json', language: 'PHP' },
    { file: 'Gemfile', language: 'Ruby' },
    { file: 'mix.exs', language: 'Elixir' },
    { file: 'pubspec.yaml', language: 'Dart/Flutter' },
    { file: 'Program.cs', language: 'C#' },
    { file: 'CMakeLists.txt', language: 'C/C++' },
  ];

  for (const indicator of languageIndicators) {
    if (await fs.pathExists(path.join(cwd, indicator.file))) {
      return indicator.language;
    }
  }

  // Check for common file extensions if no config files found
  try {
    const files = await fs.readdir(cwd);
    const extensions = files.map(f => path.extname(f).toLowerCase()).filter(Boolean);
    const extCount = {};
    
    extensions.forEach(ext => {
      extCount[ext] = (extCount[ext] || 0) + 1;
    });
    
    const topExt = Object.entries(extCount).sort(([,a], [,b]) => b - a)[0];
    if (topExt) {
      const extLangMap = {
        '.js': 'JavaScript',
        '.ts': 'TypeScript',
        '.py': 'Python',
        '.rs': 'Rust',
        '.go': 'Go',
        '.java': 'Java',
        '.php': 'PHP',
        '.rb': 'Ruby',
        '.cpp': 'C++',
        '.c': 'C',
        '.cs': 'C#',
        '.swift': 'Swift',
        '.kt': 'Kotlin',
        '.dart': 'Dart',
      };
      return extLangMap[topExt[0]] || null;
    }
  } catch (error) {
    // Ignore errors when reading directory
  }

  return null;
}

/**
 * Detect project type from build tools/package managers
 */
async function detectProjectType() {
  const cwd = process.cwd();
  
  const typeIndicators = [
    { file: 'package.json', type: 'npm' },
    { file: 'yarn.lock', type: 'yarn' },
    { file: 'pnpm-lock.yaml', type: 'pnpm' },
    { file: 'Cargo.toml', type: 'cargo' },
    { file: 'pom.xml', type: 'maven' },
    { file: 'build.gradle', type: 'gradle' },
    { file: 'go.mod', type: 'go-modules' },
    { file: 'composer.json', type: 'composer' },
    { file: 'Gemfile', type: 'bundler' },
    { file: 'mix.exs', type: 'mix' },
    { file: 'requirements.txt', type: 'pip' },
    { file: 'pyproject.toml', type: 'poetry' },
    { file: 'Pipfile', type: 'pipenv' },
  ];

  for (const indicator of typeIndicators) {
    if (await fs.pathExists(path.join(cwd, indicator.file))) {
      return indicator.type;
    }
  }

  return null;
}

/**
 * Check if current directory is a git repository
 */
function isGitRepository() {
  try {
    execSync('git rev-parse --git-dir', { 
      encoding: 'utf8', 
      timeout: 5000,
      cwd: process.cwd(),
      stdio: 'ignore'
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Get current git branch
 */
async function getGitBranch() {
  if (!isGitRepository()) {
    return null;
  }
  
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { 
      encoding: 'utf8', 
      timeout: 5000,
      cwd: process.cwd()
    });
    return branch.trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get git working tree status
 */
async function getGitStatus() {
  if (!isGitRepository()) {
    return null;
  }
  
  try {
    const status = execSync('git status --porcelain', { 
      encoding: 'utf8', 
      timeout: 5000,
      cwd: process.cwd()
    });
    return status.trim() === '' ? 'clean' : 'dirty';
  } catch (error) {
    return null;
  }
}

/**
 * Get approximate project file count (excluding common ignore patterns)
 */
async function getProjectFileCount() {
  try {
    const cwd = process.cwd();
    
    // Common patterns to ignore
    const ignorePatterns = [
      'node_modules',
      '.git',
      'target',
      'dist',
      'build',
      '.next',
      '.nuxt',
      '__pycache__',
      '.venv',
      'venv',
      '.DS_Store',
    ];

    async function countFiles(dir, depth = 0) {
      if (depth > 3) return 0; // Limit depth to avoid deep traversal
      
      let count = 0;
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (ignorePatterns.some(pattern => entry.name.includes(pattern))) {
            continue;
          }
          
          if (entry.isFile()) {
            count++;
          } else if (entry.isDirectory()) {
            count += await countFiles(path.join(dir, entry.name), depth + 1);
          }
        }
      } catch (error) {
        // Ignore permission errors or other issues
      }
      
      return count;
    }

    return await countFiles(cwd);
  } catch (error) {
    return null;
  }
}