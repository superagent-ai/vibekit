import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface SystemInfo {
  machineId: string;
  hostname: string;
  platform: string;
  arch: string;
  release: string;
  totalMemory: number;
  cpuCores: number;
  nodeVersion: string;
  shell?: string;
  terminal?: string;
  gitVersion?: string;
  projectName?: string;
  projectLanguage?: string;
  projectType?: string;
  gitBranch?: string;
  gitStatus?: string;
  projectFileCount?: number;
}

interface AnalyticsMetrics {
  sessionId: string;
  agentName: string;
  projectId?: string;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  status: 'active' | 'terminated';
  // Remove executionMode as it's not in the CLI schema
  inputBytes: number;
  outputBytes: number;
  commands: Array<{
    command: string;
    args: string[];
    timestamp: number;
  }>;
  exitCode: number | null;
  filesChanged: string[];
  filesCreated: string[];
  filesDeleted: string[];
  errors: string[];
  warnings: string[];
  systemInfo: SystemInfo | null;
}

export class AgentAnalytics {
  private metrics: AnalyticsMetrics;
  private analyticsDir: string;
  private outputBuffer: string = '';
  private projectRoot?: string;
  
  constructor(
    agentName: string,
    projectRoot?: string,
    projectId?: string
  ) {
    const sessionId = Date.now().toString();
    
    this.metrics = {
      sessionId,
      agentName,
      projectId,
      startTime: Date.now(),
      endTime: null,
      duration: null,
      status: 'active',
      inputBytes: 0,
      outputBytes: 0,
      commands: [],
      exitCode: null,
      filesChanged: [],
      filesCreated: [],
      filesDeleted: [],
      errors: [],
      warnings: [],
      systemInfo: null
    };
    
    this.projectRoot = projectRoot;
    // Always use base analytics directory, no subdirectories
    this.analyticsDir = path.join(os.homedir(), '.vibekit', 'analytics');
  }
  
  async initialize(): Promise<void> {
    // Ensure analytics directory exists
    await fs.mkdir(this.analyticsDir, { recursive: true });
    
    // Collect system info
    try {
      this.metrics.systemInfo = await this.collectSystemInfo();
    } catch (error) {
      console.warn('Failed to collect system info:', error);
    }
    
    // Add initial command
    this.metrics.commands.push({
      command: this.metrics.agentName,
      args: [],
      timestamp: Date.now()
    });
  }
  
  private async collectSystemInfo(): Promise<SystemInfo> {
    const hostname = os.hostname();
    const platform = os.platform();
    const arch = os.arch();
    const cpus = os.cpus();
    
    // Generate machine ID
    const machineString = `${hostname}-${platform}-${arch}-${cpus.length}-${os.totalmem()}`;
    const machineId = crypto.createHash('sha256').update(machineString).digest('hex').substring(0, 16);
    
    const systemInfo: SystemInfo = {
      machineId,
      hostname,
      platform,
      arch,
      release: os.release(),
      totalMemory: os.totalmem(),
      cpuCores: cpus.length,
      nodeVersion: process.version,
      shell: process.env.SHELL,
      terminal: process.env.TERM_PROGRAM
    };
    
    // Get git version
    try {
      const { stdout } = await execAsync('git --version');
      systemInfo.gitVersion = stdout.trim();
    } catch {
      // Git not available
    }
    
    // Project-specific info if projectRoot is provided
    if (this.projectRoot) {
      // Get project name and type
      try {
        const packageJsonPath = path.join(this.projectRoot, 'package.json');
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        systemInfo.projectName = packageJson.name;
        systemInfo.projectType = 'npm';
        systemInfo.projectLanguage = 'JavaScript/Node.js';
      } catch {
        // Try other project files
        try {
          const cargoPath = path.join(this.projectRoot, 'Cargo.toml');
          await fs.access(cargoPath);
          systemInfo.projectType = 'cargo';
          systemInfo.projectLanguage = 'Rust';
        } catch {
          try {
            const pyprojectPath = path.join(this.projectRoot, 'pyproject.toml');
            await fs.access(pyprojectPath);
            systemInfo.projectType = 'python';
            systemInfo.projectLanguage = 'Python';
          } catch {
            // No recognized project type
          }
        }
      }
      
      // Get git branch
      try {
        const { stdout } = await execAsync('git branch --show-current', { cwd: this.projectRoot });
        systemInfo.gitBranch = stdout.trim();
      } catch {
        // Not a git repo or git not available
      }
      
      // Get git status
      try {
        const { stdout } = await execAsync('git status --porcelain', { cwd: this.projectRoot });
        systemInfo.gitStatus = stdout.trim() ? 'dirty' : 'clean';
      } catch {
        // Not a git repo or git not available
      }
      
      // Count project files
      try {
        const { stdout } = await execAsync(
          'find . -type f -name "*.js" -o -name "*.ts" -o -name "*.jsx" -o -name "*.tsx" -o -name "*.json" -o -name "*.md" | wc -l',
          { cwd: this.projectRoot }
        );
        systemInfo.projectFileCount = parseInt(stdout.trim(), 10);
      } catch {
        // Can't count files
      }
    }
    
    return systemInfo;
  }
  
  capturePrompt(prompt: string): void {
    this.metrics.inputBytes += Buffer.byteLength(prompt, 'utf8');
  }
  
  captureOutput(output: string): void {
    this.metrics.outputBytes += Buffer.byteLength(output, 'utf8');
    this.outputBuffer += output;
    
    // Parse for errors and warnings
    this.parseOutputForMetrics(output);
  }
  
  private parseOutputForMetrics(output: string): void {
    // Look for error patterns
    const errorPatterns = [
      /Error:/i,
      /Exception:/i,
      /Failed:/i,
      /❌/,
    ];
    
    errorPatterns.forEach(pattern => {
      if (pattern.test(output)) {
        const lines = output.split('\n');
        const errorLine = lines.find(line => pattern.test(line));
        if (errorLine && !this.metrics.errors.includes(errorLine.trim())) {
          this.metrics.errors.push(errorLine.trim());
        }
      }
    });
    
    // Look for warning patterns
    const warningPatterns = [
      /Warning:/i,
      /⚠/,
      /WARN/i,
    ];
    
    warningPatterns.forEach(pattern => {
      if (pattern.test(output)) {
        const lines = output.split('\n');
        const warningLine = lines.find(line => pattern.test(line));
        if (warningLine && !this.metrics.warnings.includes(warningLine.trim())) {
          this.metrics.warnings.push(warningLine.trim());
        }
      }
    });
  }
  
  captureUpdate(update: string): void {
    // Treat updates as output
    this.captureOutput(update);
  }
  
  getStartTime(): number {
    return this.metrics.startTime;
  }
  
  async finalize(exitCode: number, duration?: number): Promise<AnalyticsMetrics> {
    this.metrics.endTime = Date.now();
    this.metrics.duration = duration || (this.metrics.endTime - this.metrics.startTime);
    this.metrics.exitCode = exitCode;
    this.metrics.status = 'terminated';
    
    await this.saveAnalytics();
    return this.metrics;
  }
  
  private async saveAnalytics(): Promise<void> {
    const date = new Date().toISOString().split('T')[0];
    const analyticsFile = path.join(this.analyticsDir, `${this.metrics.agentName}-${date}.json`);
    
    try {
      let existingData: AnalyticsMetrics[] = [];
      
      // Try to read existing file
      try {
        const content = await fs.readFile(analyticsFile, 'utf8');
        existingData = JSON.parse(content);
      } catch {
        // File doesn't exist yet, which is fine
      }
      
      // Find existing session and update it, or add new one
      const existingIndex = existingData.findIndex(s => s.sessionId === this.metrics.sessionId);
      if (existingIndex >= 0) {
        existingData[existingIndex] = this.metrics;
      } else {
        existingData.push(this.metrics);
      }
      
      // Write updated data
      await fs.writeFile(analyticsFile, JSON.stringify(existingData, null, 2));
      
      console.log('Analytics saved:', {
        sessionId: this.metrics.sessionId,
        file: analyticsFile,
        duration: this.metrics.duration,
        exitCode: this.metrics.exitCode
      });
    } catch (error) {
      console.error('Failed to save analytics:', error);
    }
  }
  
  // Static method to check if analytics are enabled
  static async isEnabled(): Promise<boolean> {
    try {
      const settingsPath = path.join(os.homedir(), '.vibekit', 'settings.json');
      const settingsContent = await fs.readFile(settingsPath, 'utf8');
      const settings = JSON.parse(settingsContent);
      return settings?.analytics?.enabled ?? true; // Default to enabled
    } catch {
      return true; // Default to enabled if settings can't be read
    }
  }
}