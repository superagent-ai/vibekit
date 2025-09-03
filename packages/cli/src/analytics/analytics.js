import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { collectSystemInfo } from './system-info.js';

class Analytics {
  constructor(agentName, logger, fileChangeCallback = null, executionMode = 'local', projectContext = null) {
    this.agentName = agentName;
    this.logger = logger;
    this.sessionId = Date.now().toString();
    this.startTime = Date.now();
    this.fileChangeCallback = fileChangeCallback;
    this.projectContext = projectContext;
    
    // Analytics data
    this.metrics = {
      sessionId: this.sessionId,
      agentName: this.agentName,
      startTime: this.startTime,
      endTime: null,
      duration: null,
      status: 'active', // active, terminated
      executionMode: executionMode, // sandbox, local
      
      // Project context
      projectId: projectContext?.id || null,
      projectName: projectContext?.name || null,
      projectRoot: projectContext?.projectRoot || null,
      
      // Input/Output metrics
      inputBytes: 0,
      outputBytes: 0,
      
      // Command & process metrics
      commands: [],
      exitCode: null,
      
      // File system metrics
      filesChanged: [],
      filesCreated: [],
      filesDeleted: [],
      
      // Error tracking
      errors: [],
      warnings: [],
      
      // System information
      systemInfo: null,
    };
    
    // Stream buffers for analysis
    this.inputBuffer = '';
    this.outputBuffer = '';
    
    this.analyticsDir = path.join(os.homedir(), '.vibekit', 'analytics');
    this.projectAnalyticsDir = projectContext 
      ? path.join(this.analyticsDir, 'projects', projectContext.id)
      : null;
    this.periodicInterval = null;
    this.initializeAnalytics();
  }

  async initializeAnalytics() {
    await fs.ensureDir(this.analyticsDir);
    
    // Create project-specific analytics directory if needed
    if (this.projectAnalyticsDir) {
      await fs.ensureDir(this.projectAnalyticsDir);
    }
    
    // Collect system info at session start
    try {
      this.metrics.systemInfo = await collectSystemInfo();
    } catch (error) {
      this.logger.log('warn', 'Failed to collect system info', { error: error.message });
      this.metrics.systemInfo = null;
    }
  }

  captureInput(data) {
    const input = data.toString();
    this.metrics.inputBytes += Buffer.byteLength(input, 'utf8');
    this.inputBuffer += input;
  }

  captureOutput(data) {
    const output = data.toString();
    this.metrics.outputBytes += Buffer.byteLength(output, 'utf8');
    this.outputBuffer += output;
    
    // Parse for specific patterns
    this.parseOutputForMetrics(output);
  }

  parseOutputForMetrics(output) {
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

  captureCommand(command, args) {
    this.metrics.commands.push({
      command,
      args: args || [],
      timestamp: Date.now()
    });
    
    // Also capture command args as input for token estimation
    if (args && args.length > 0) {
      const argsText = args.join(' ');
      this.captureInput(argsText);
    }
  }

  captureFileChanges(changes) {
    if (Array.isArray(changes)) {
      this.metrics.filesChanged = [...new Set([...this.metrics.filesChanged, ...changes])];
    }
  }

  captureFileOperations(created = [], deleted = []) {
    this.metrics.filesCreated = [...new Set([...this.metrics.filesCreated, ...created])];
    this.metrics.filesDeleted = [...new Set([...this.metrics.filesDeleted, ...deleted])];
  }

  startPeriodicLogging(intervalMs = 20000) {
    if (this.periodicInterval) {
      return;
    }
    
    this.periodicInterval = setInterval(async () => {
      await this.updateSession();
    }, intervalMs);
  }

  stopPeriodicLogging() {
    if (this.periodicInterval) {
      clearInterval(this.periodicInterval);
      this.periodicInterval = null;
    }
  }

  async updateSession() {
    const currentTime = Date.now();
    const currentDuration = currentTime - this.startTime;
    
    // Check for file changes if callback is provided
    if (this.fileChangeCallback) {
      try {
        const fileChanges = await this.fileChangeCallback();
        if (fileChanges) {
          this.captureFileChanges(fileChanges.changes);
          this.captureFileOperations(fileChanges.created, fileChanges.deleted);
        }
      } catch (error) {
        this.logger.log('warn', 'Failed to check file changes during periodic update', { error: error.message });
      }
    }
    
    // Update git status to reflect current state
    if (this.metrics.systemInfo) {
      try {
        const { collectSystemInfo } = await import('./system-info.js');
        const updatedSystemInfo = await collectSystemInfo();
        // Only update git-related fields to avoid overwriting other system info
        this.metrics.systemInfo.gitStatus = updatedSystemInfo.gitStatus;
        this.metrics.systemInfo.gitBranch = updatedSystemInfo.gitBranch;
      } catch (error) {
        this.logger.log('warn', 'Failed to update git status during periodic update', { error: error.message });
      }
    }
    
    const sessionUpdate = {
      ...this.metrics,
      currentTime,
      duration: currentDuration,
      endTime: null,
      exitCode: null
    };
    
    this.refineTokenCounts();
    
    return this.saveSessionUpdate(sessionUpdate);
  }

  async saveSessionUpdate(sessionData) {
    const date = new Date().toISOString().split('T')[0];
    const globalFile = path.join(this.analyticsDir, `${this.agentName}-${date}.json`);
    
    try {
      // Always save to global analytics
      await this.saveToFile(globalFile, sessionData);
      
      // Also save to project-specific analytics if we have a project
      if (this.projectAnalyticsDir) {
        const projectFile = path.join(this.projectAnalyticsDir, `${this.agentName}-${date}.json`);
        await this.saveToFile(projectFile, sessionData);
      }
      
      // Log session update
      await this.logger.log('debug', 'Session analytics updated', {
        sessionId: sessionData.sessionId,
        duration: sessionData.duration,
        inputBytes: sessionData.inputBytes,
        outputBytes: sessionData.outputBytes,
        filesChanged: sessionData.filesChanged.length,
        projectId: sessionData.projectId,
        projectName: sessionData.projectName
      });
      
      return sessionData;
    } catch (error) {
      return null;
    }
  }

  async finalize(exitCode, duration) {
    this.stopPeriodicLogging();
    
    this.metrics.endTime = Date.now();
    this.metrics.duration = duration || (this.metrics.endTime - this.metrics.startTime);
    this.metrics.exitCode = exitCode;
    this.metrics.status = 'terminated';
    
    // Update git status one final time before saving
    if (this.metrics.systemInfo) {
      try {
        const { collectSystemInfo } = await import('./system-info.js');
        const updatedSystemInfo = await collectSystemInfo();
        this.metrics.systemInfo.gitStatus = updatedSystemInfo.gitStatus;
        this.metrics.systemInfo.gitBranch = updatedSystemInfo.gitBranch;
      } catch (error) {
        this.logger.log('warn', 'Failed to update git status during session finalization', { error: error.message });
      }
    }
    
    // Final token count refinement from buffers
    this.refineTokenCounts();
    
    return this.saveAnalytics();
  }

  // Synchronous version for emergency finalization (e.g., on process exit)
  finalizeSync(exitCode, duration) {
    this.stopPeriodicLogging();
    
    this.metrics.endTime = Date.now();
    this.metrics.duration = duration || (this.metrics.endTime - this.metrics.startTime);
    this.metrics.exitCode = exitCode;
    this.metrics.status = 'terminated';
    
    // Final token count refinement from buffers
    this.refineTokenCounts();
    
    return this.saveAnalyticsSync();
  }

  refineTokenCounts() {
    // More sophisticated analytics could be added here
    // For now, use the basic metrics we collect
  }

  async saveToFile(filePath, data) {
    try {
      let existingData = [];
      if (await fs.pathExists(filePath)) {
        const content = await fs.readFile(filePath, 'utf8');
        existingData = JSON.parse(content);
      }
      
      // Find existing session and update it, or add new one
      const existingIndex = existingData.findIndex(s => s.sessionId === data.sessionId);
      if (existingIndex >= 0) {
        existingData[existingIndex] = data;
      } else {
        existingData.push(data);
      }
      
      await fs.writeFile(filePath, JSON.stringify(existingData, null, 2));
      return true;
    } catch (error) {
      console.error(`Failed to save analytics to ${filePath}:`, error.message);
      return false;
    }
  }

  saveToFileSync(filePath, data) {
    try {
      let existingData = [];
      if (fs.pathExistsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        existingData = JSON.parse(content);
      }
      
      // Find existing session and update it, or add new one
      const existingIndex = existingData.findIndex(s => s.sessionId === data.sessionId);
      if (existingIndex >= 0) {
        existingData[existingIndex] = data;
      } else {
        existingData.push(data);
      }
      
      fs.writeFileSync(filePath, JSON.stringify(existingData, null, 2));
      return true;
    } catch (error) {
      console.error(`Failed to save analytics to ${filePath}:`, error.message);
      return false;
    }
  }

  async saveAnalytics() {
    const date = new Date().toISOString().split('T')[0];
    const globalFile = path.join(this.analyticsDir, `${this.agentName}-${date}.json`);
    
    try {
      // Always save to global analytics
      await this.saveToFile(globalFile, this.metrics);
      
      // Also save to project-specific analytics if we have a project
      if (this.projectAnalyticsDir) {
        const projectFile = path.join(this.projectAnalyticsDir, `${this.agentName}-${date}.json`);
        await this.saveToFile(projectFile, this.metrics);
      }
      
      // Log analytics summary
      await this.logger.log('info', 'Analytics captured', {
        sessionId: this.metrics.sessionId,
        duration: this.metrics.duration,
        inputBytes: this.metrics.inputBytes,
        outputBytes: this.metrics.outputBytes,
        filesChanged: this.metrics.filesChanged.length,
        errors: this.metrics.errors.length,
        warnings: this.metrics.warnings.length,
        exitCode: this.metrics.exitCode,
        projectId: this.metrics.projectId,
        projectName: this.metrics.projectName,
        machineId: this.metrics.systemInfo?.machineId,
        nodeVersion: this.metrics.systemInfo?.nodeVersion,
        projectLanguage: this.metrics.systemInfo?.projectLanguage
      });
      
      return this.metrics;
    } catch (error) {
      return null;
    }
  }

  // Synchronous version for emergency saves (e.g., on process exit)
  saveAnalyticsSync() {
    const date = new Date().toISOString().split('T')[0];
    const globalFile = path.join(this.analyticsDir, `${this.agentName}-${date}.json`);
    
    try {
      // Always save to global analytics
      this.saveToFileSync(globalFile, this.metrics);
      
      // Also save to project-specific analytics if we have a project
      if (this.projectAnalyticsDir) {
        const projectFile = path.join(this.projectAnalyticsDir, `${this.agentName}-${date}.json`);
        this.saveToFileSync(projectFile, this.metrics);
      }
      
      return this.metrics;
    } catch (error) {
      return null;
    }
  }

  // Static method to read analytics
  static async getAnalytics(agentName = null, days = 7) {
    const analyticsDir = path.join(os.homedir(), '.vibekit', 'analytics');
    
    if (!await fs.pathExists(analyticsDir)) {
      return [];
    }
    
    const files = await fs.readdir(analyticsDir);
    const targetFiles = agentName 
      ? files.filter(f => f.startsWith(`${agentName}-`))
      : files.filter(f => f.endsWith('.json'));
    
    // Filter by date range
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    const allAnalytics = [];
    
    for (const file of targetFiles) {
      try {
        const filePath = path.join(analyticsDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        const data = JSON.parse(content);
        
        const filteredData = data.filter(session => {
          const sessionDate = new Date(session.startTime);
          return sessionDate >= cutoffDate;
        });
        
        allAnalytics.push(...filteredData);
      } catch (error) {
      }
    }
    
    return allAnalytics.sort((a, b) => b.startTime - a.startTime);
  }

  // Static method to get active sessions count
  static getActiveSessions(analytics) {
    return analytics.filter(session => session.status === 'active').length;
  }

  // Static method to generate analytics summary
  static generateSummary(analytics) {
    if (analytics.length === 0) {
      return {
        totalSessions: 0,
        activeSessions: 0,
        totalDuration: 0,
        averageDuration: 0,
        successRate: 0,
        topErrors: [],
        agentBreakdown: {},
        platformBreakdown: {},
        nodeVersionBreakdown: {},
        projectLanguageBreakdown: {},
        terminalBreakdown: {}
      };
    }

    const summary = {
      totalSessions: analytics.length,
      activeSessions: analytics.filter(a => a.status === 'active').length,
      totalDuration: analytics.reduce((sum, a) => sum + (a.duration || 0), 0),
      successfulSessions: analytics.filter(a => a.exitCode === 0).length,
      totalFilesChanged: analytics.reduce((sum, a) => sum + (a.filesChanged?.length || 0), 0),
      totalErrors: analytics.reduce((sum, a) => sum + (a.errors?.length || 0), 0),
      totalWarnings: analytics.reduce((sum, a) => sum + (a.warnings?.length || 0), 0),
    };

    summary.averageDuration = summary.totalDuration / summary.totalSessions;
    summary.successRate = (summary.successfulSessions / summary.totalSessions) * 100;

    // Top errors
    const errorCounts = {};
    analytics.forEach(a => {
      a.errors?.forEach(error => {
        errorCounts[error] = (errorCounts[error] || 0) + 1;
      });
    });
    summary.topErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([error, count]) => ({ error, count }));

    // Agent breakdown
    const agentBreakdown = {};
    analytics.forEach(a => {
      if (!agentBreakdown[a.agentName]) {
        agentBreakdown[a.agentName] = {
          sessions: 0,
          duration: 0,
          successRate: 0
        };
      }
      const agent = agentBreakdown[a.agentName];
      agent.sessions++;
      agent.duration += a.duration || 0;
      if (a.exitCode === 0) agent.successfulSessions = (agent.successfulSessions || 0) + 1;
    });

    Object.keys(agentBreakdown).forEach(agentName => {
      const agent = agentBreakdown[agentName];
      agent.successRate = ((agent.successfulSessions || 0) / agent.sessions) * 100;
      agent.averageDuration = agent.duration / agent.sessions;
    });

    summary.agentBreakdown = agentBreakdown;

    // System environment breakdowns
    const createBreakdown = (field) => {
      const breakdown = {};
      analytics.forEach(a => {
        const value = a.systemInfo?.[field];
        if (value) {
          breakdown[value] = (breakdown[value] || 0) + 1;
        }
      });
      return breakdown;
    };

    summary.machineBreakdown = createBreakdown('machineId');
    summary.hostnameBreakdown = createBreakdown('hostname');
    summary.platformBreakdown = createBreakdown('platform');
    summary.nodeVersionBreakdown = createBreakdown('nodeVersion');
    summary.projectLanguageBreakdown = createBreakdown('projectLanguage');
    summary.terminalBreakdown = createBreakdown('terminal');

    return summary;
  }
}

export default Analytics;