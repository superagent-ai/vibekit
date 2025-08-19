import { NextRequest, NextResponse } from 'next/server';
import { VibeKit } from '@vibe-kit/sdk';
import { createLocalProvider } from '@vibe-kit/dagger';
import { homedir } from 'os';
import { join } from 'path';
import { AgentAnalytics } from '@/lib/agent-analytics';
import { SessionLogger } from '@/lib/session-logger';
import { SessionIdGenerator } from '@/lib/session-id-generator';
import { ExecutionHistoryManager } from '@/lib/execution-history-manager';
// Import other providers as needed
// import { createE2BProvider } from '@vibe-kit/e2b';
// import { createDaytonaProvider } from '@vibe-kit/daytona';
// import { createCloudflareProvider } from '@vibe-kit/cloudflare';
// import { createNorthflankProvider } from '@vibe-kit/northflank';

interface ExecuteSubtaskRequest {
  parentTask: {
    id: number;
    title: string;
  };
  subtask: {
    id: number;
    title: string;
    description: string;
    details?: string;
    testStrategy?: string;
  };
  agent: string;
  sandbox: string;
  branch: string;
  projectRoot: string;
  sessionId?: string;
}

async function checkDockerStatus() {
  const { exec } = require('child_process');
  const { promisify } = require('util');
  const execAsync = promisify(exec);
  
  try {
    // Quick Docker check
    await execAsync('docker ps -q', { timeout: 5000 });
    return { success: true };
  } catch (error: any) {
    if (error.message?.includes('Cannot connect to the Docker daemon')) {
      return { 
        success: false, 
        error: 'Docker is not running',
        userMessage: 'Docker Desktop is not running. Please start Docker Desktop and try again.',
        details: 'The Dagger sandbox requires Docker to be running on your system.'
      };
    } else if (error.message?.includes('command not found')) {
      return { 
        success: false, 
        error: 'Docker not installed',
        userMessage: 'Docker is not installed. Please install Docker Desktop from docker.com',
        details: 'Visit https://www.docker.com/products/docker-desktop to download and install Docker.'
      };
    } else if (error.message?.includes('permission denied')) {
      return { 
        success: false, 
        error: 'Docker permission denied',
        userMessage: 'Docker requires elevated permissions. Please ensure your user has access to Docker.',
        details: 'You may need to add your user to the docker group or restart Docker Desktop.'
      };
    }
    return { 
      success: false, 
      error: 'Docker check failed',
      userMessage: 'Unable to connect to Docker. Please ensure Docker Desktop is installed and running.',
      details: error.message
    };
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let vibeKit: VibeKit | null = null;
  let analytics: AgentAnalytics | null = null;
  let sessionLogger: SessionLogger | null = null;
  let executionId: string | null = null;
  
  try {
    const { id } = await params;
    const body: ExecuteSubtaskRequest = await request.json();
    const { parentTask, subtask, agent, sandbox, branch, projectRoot, sessionId: providedSessionId } = body;
    
    // Check Docker status if using Dagger sandbox
    if (sandbox === 'dagger') {
      const dockerCheck = await checkDockerStatus();
      if (!dockerCheck.success) {
        console.error('Docker check failed:', dockerCheck);
        return NextResponse.json(
          { 
            success: false,
            error: dockerCheck.userMessage,
            details: dockerCheck.details,
            errorType: 'docker_not_running'
          },
          { status: 503 }
        );
      }
    }
    
    console.log('Executing subtask:', {
      projectId: id,
      taskId: parentTask.id,
      taskTitle: parentTask.title,
      subtaskId: subtask.id,
      subtaskTitle: subtask.title,
      agent,
      sandbox,
      branch,
      projectRoot
    });
    
    // Use provided session ID or generate new one
    const sessionId = providedSessionId || SessionIdGenerator.generateWithPrefix('exec');
    console.log('Using session ID for execution:', sessionId, providedSessionId ? '(provided)' : '(generated)');
    
    // Initialize session logger for real-time logging
    sessionLogger = new SessionLogger(sessionId, agent, {
      projectId: id,
      projectRoot,
      taskId: parentTask.id.toString(),
      subtaskId: subtask.id.toString()
    });
    await sessionLogger.initialize();
    console.log('Session logger initialized:', sessionId);
    
    
    // Log initial sandbox configuration
    await sessionLogger.captureInfo(`Initializing ${agent} agent with ${sandbox} sandbox`, { 
      agent, 
      sandbox,
      branch,
      projectRoot 
    });
    
    // Check if analytics are enabled and initialize if so
    const analyticsEnabled = await AgentAnalytics.isEnabled();
    if (analyticsEnabled) {
      analytics = new AgentAnalytics(agent, projectRoot, id);
      await analytics.initialize();
      console.log('Analytics initialized for session');
    }
    
    // Fetch settings to get Docker Hub username
    let dockerHubUser = process.env.DOCKER_HUB_USER;
    try {
      const settingsPath = join(homedir(), '.vibekit', 'settings.json');
      const fs = require('fs').promises;
      const settingsContent = await fs.readFile(settingsPath, 'utf-8');
      const settings = JSON.parse(settingsContent);
      if (settings?.agents?.dockerHubUser) {
        dockerHubUser = settings.agents.dockerHubUser;
      }
    } catch (error) {
      console.log('Could not read settings, using environment variable or default');
    }
    
    // Create sandbox provider based on selection
    let sandboxProvider;
    switch (sandbox) {
      case 'dagger':
        sandboxProvider = createLocalProvider({
          preferRegistryImages: true,
          dockerHubUser: dockerHubUser || undefined,
          pushImages: false,
        });
        break;
      
      // Add other providers as they're implemented
      // case 'e2b':
      //   sandboxProvider = createE2BProvider({
      //     apiKey: process.env.E2B_API_KEY,
      //     template: agent,
      //   });
      //   break;
      
      default:
        throw new Error(`Unsupported sandbox provider: ${sandbox}`);
    }
    
    // Configure agent settings
    const agentConfig: any = {
      type: agent,
    };
    
    // Set provider and API key based on agent type
    switch (agent) {
      case 'claude':
        agentConfig.provider = 'anthropic';
        agentConfig.apiKey = process.env.ANTHROPIC_API_KEY;
        agentConfig.model = 'claude-sonnet-4-20250514';
        break;
      case 'gemini':
        agentConfig.provider = 'google';
        agentConfig.apiKey = process.env.GEMINI_API_KEY;
        break;
      case 'grok':
        agentConfig.provider = 'xai';
        agentConfig.apiKey = process.env.GROK_API_KEY;
        break;
      case 'codex':
        agentConfig.provider = 'openai';
        agentConfig.apiKey = process.env.OPENAI_API_KEY;
        break;
      case 'opencode':
        agentConfig.provider = 'opencode';
        agentConfig.apiKey = process.env.OPENCODE_API_KEY;
        break;
      default:
        throw new Error(`Unsupported agent: ${agent}`);
    }
    
    // Configure VibeKit
    vibeKit = new VibeKit()
      .withAgent(agentConfig)
      .withSandbox(sandboxProvider)
      .withWorkingDirectory(projectRoot);
    
    // Add secrets/environment variables if needed
    const secrets: Record<string, string> = {};
    // Check for GitHub token (support both GITHUB_TOKEN and GITHUB_API_KEY)
    const githubToken = process.env.GITHUB_TOKEN || process.env.GITHUB_API_KEY;
    if (githubToken) {
      secrets.GITHUB_TOKEN = githubToken;
    }
    // Add any other environment variables that might be needed in the sandbox
    if (Object.keys(secrets).length > 0) {
      vibeKit.withSecrets(secrets);
    }
    
    // Configure GitHub integration if token is available
    if (githubToken) {
      // Try to detect the Git repository from the project
      let repoUrl: string | undefined;
      let isGitRepo = false;
      
      try {
        // Try to get the Git remote URL
        const { execSync } = await import('child_process');
        
        // First check if it's a git repository
        try {
          execSync(`cd ${projectRoot} && git rev-parse --git-dir`, { encoding: 'utf8' });
          isGitRepo = true;
        } catch {
          isGitRepo = false;
        }
        
        if (isGitRepo) {
          const remoteUrl = execSync(`cd ${projectRoot} && git config --get remote.origin.url`, { encoding: 'utf8' }).trim();
          
          // Extract owner/repo from various Git URL formats
          // Supports: https://github.com/owner/repo.git, git@github.com:owner/repo.git, etc.
          const patterns = [
            /github\.com[:/]([^/]+\/[^/.]+?)(?:\.git)?$/,  // Standard formats
            /github\.com[:/]([^/]+\/[^/]+?)$/,              // Without .git
            /git@github\.com:([^/]+\/[^/.]+?)(?:\.git)?$/   // SSH format
          ];
          
          for (const pattern of patterns) {
            const match = remoteUrl.match(pattern);
            if (match) {
              repoUrl = match[1];
              break;
            }
          }
          
          if (repoUrl) {
            console.log('Detected GitHub repository:', repoUrl);
            
            // Configure GitHub integration
            vibeKit.withGithub({
              token: githubToken,
              repository: repoUrl
            });
            
            // Log the repository detection and configuration
            if (sessionLogger) {
              await sessionLogger.captureInfo(`GitHub integration configured`, { 
                repository: repoUrl,
                branch: branch,
                hasToken: true
              });
            }
          } else {
            console.log('Git repository detected but not a GitHub repository');
            if (sessionLogger) {
              await sessionLogger.captureInfo(`Non-GitHub repository detected`, { 
                remoteUrl: remoteUrl.substring(0, 50)
              });
            }
          }
        } else {
          console.log('Project is not a Git repository');
          if (sessionLogger) {
            await sessionLogger.captureInfo(`Project is not a Git repository`, { 
              projectRoot 
            });
          }
        }
      } catch (error) {
        console.log('Error detecting Git repository:', error);
        if (sessionLogger) {
          await sessionLogger.captureInfo(`Could not detect Git repository configuration`, { 
            error: String(error).substring(0, 100)
          });
        }
      }
    } else {
      console.log('GitHub token not configured');
      if (sessionLogger) {
        await sessionLogger.captureInfo(`GitHub token not configured - GitHub features disabled`, {});
      }
    }
    
    // Build the prompt from subtask information
    const promptParts: string[] = [];
    
    promptParts.push(`Task: ${subtask.title}`);
    
    if (subtask.description) {
      promptParts.push(`\nDescription: ${subtask.description}`);
    }
    
    if (subtask.details) {
      promptParts.push(`\nDetails:\n${subtask.details}`);
    }
    
    if (subtask.testStrategy) {
      promptParts.push(`\nTest Strategy:\n${subtask.testStrategy}`);
    }
    
    promptParts.push(`\nBase Branch: ${branch}`);
    promptParts.push(`\nPlease implement this task following the description, details, and test strategy provided.`);
    
    const prompt = promptParts.join('\n');
    
    console.log('Executing with prompt:', prompt);
    
    // Initialize ExecutionHistoryManager and record execution start
    await ExecutionHistoryManager.initialize();
    executionId = await ExecutionHistoryManager.recordExecutionStart({
      sessionId,
      projectId: id,
      projectRoot,
      taskId: parentTask.id.toString(),
      subtaskId: subtask.id.toString(),
      agent,
      sandbox,
      prompt
    });
    console.log('Execution recorded:', executionId);
    
    // Capture prompt in analytics if enabled
    if (analytics) {
      analytics.capturePrompt(prompt);
    }
    
    // Set up event listeners for real-time updates
    const updates: string[] = [];
    const stdout: string[] = [];
    const stderr: string[] = [];
    
    vibeKit.on('update', async (update) => {
      updates.push(update);
      console.log('VibeKit Update:', update);
      
      // Try to parse for specific events
      try {
        const parsed = JSON.parse(update);
        if (parsed.type === 'start' && parsed.sandbox_id) {
          console.log(`🏗️ Sandbox Launch Started: ${parsed.sandbox_id}`);
        } else if (parsed.type === 'container_created') {
          console.log(`🐳 Container Created: ${parsed.container_id || 'unknown'}`);
        } else if (parsed.type === 'image_pull') {
          console.log(`🖼️ Image Pull: ${parsed.image || 'unknown'}`);
        } else if (parsed.type === 'repository_clone') {
          console.log(`📥 Repository Clone: ${parsed.repository || 'unknown'}`);
        }
      } catch (parseError) {
        // Not JSON, check for Git operations in plain text
        if (update.includes('Cloning into') || update.includes('git clone')) {
          console.log(`📥 Git operation detected: ${update.substring(0, 100)}`);
        }
      }
      
      if (analytics) {
        analytics.captureUpdate(update);
      }
      if (sessionLogger) {
        await sessionLogger.captureUpdate(update);
      }
    });
    
    vibeKit.on('stdout', async (data) => {
      stdout.push(data);
      console.log('Sandbox STDOUT:', data);
      
      // Detect Git operations in stdout
      if (data.includes('Cloning into') || data.includes('Initialized empty Git repository')) {
        console.log('📥 Git repository operation detected');
      } else if (data.includes('Switched to') || data.includes('Your branch is')) {
        console.log('🔀 Git branch operation detected');
      } else if (data.includes('[') && data.includes(']') && data.includes('commit')) {
        console.log('💾 Git commit detected');
      }
      
      if (analytics) {
        analytics.captureOutput(data);
      }
      if (sessionLogger) {
        await sessionLogger.captureStdout(data);
      }
    });
    
    vibeKit.on('stderr', async (data) => {
      stderr.push(data);
      console.log('Sandbox STDERR:', data);
      if (analytics) {
        analytics.captureOutput(data);
      }
      if (sessionLogger) {
        await sessionLogger.captureStderr(data);
      }
    });
    
    vibeKit.on('error', async (error) => {
      console.error('VibeKit Error:', error);
      if (analytics) {
        analytics.captureOutput(`Error: ${error}`);
      }
      if (sessionLogger) {
        await sessionLogger.captureError(`${error}`);
      }
    });
    
    // Execute code generation
    console.log('Starting code generation with SDK...');
    await sessionLogger.captureInfo(`Launching sandbox and cloning repository...`, { 
      mode: 'code',
      promptLength: prompt.length 
    });
    
    const startTime = Date.now();
    const result = await vibeKit.generateCode({
      prompt,
      mode: 'code',
      branch: branch  // Pass the branch parameter for GitHub operations
    });
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`Execution completed in ${elapsedTime} seconds`);
    console.log('Result:', {
      sandboxId: result?.sandboxId,
      exitCode: result?.exitCode,
      success: result?.exitCode === 0
    });
    
    // Update execution record with completion
    if (executionId) {
      await ExecutionHistoryManager.updateExecution(executionId, {
        status: result?.exitCode === 0 ? 'completed' : 'failed',
        endTime: Date.now(),
        exitCode: result?.exitCode,
        success: result?.exitCode === 0,
        stdoutLines: result?.stdout ? result.stdout.split('\n').length : stdout.length,
        stderrLines: result?.stderr ? result.stderr.split('\n').length : stderr.length,
        updateCount: updates.length
      });
      console.log('Execution record updated:', executionId);
    }
    
    // Create pull request if code generation was successful and GitHub is configured
    let pullRequestResult = null;
    if (result?.exitCode === 0 && githubToken && vibeKit) {
      try {
        console.log('Creating pull request...');
        if (sessionLogger) {
          await sessionLogger.captureInfo('Creating GitHub pull request...', {});
        }
        
        // Configure label options for the PR
        const labelOptions = {
          name: `vibekit-${agent}`,
          color: '0e8a16',
          description: `Code generated by ${agent} agent via VibeKit`
        };
        
        // Create pull request with task/subtask context in the branch name
        const branchPrefix = `vibekit-task-${parentTask.id}-subtask-${subtask.id}`;
        pullRequestResult = await vibeKit.createPullRequest(labelOptions, branchPrefix);
        
        console.log('Pull request created:', pullRequestResult);
        if (sessionLogger) {
          await sessionLogger.captureInfo(`Pull request #${pullRequestResult?.number} created successfully: ${pullRequestResult?.html_url}`, {
            prUrl: pullRequestResult?.html_url,
            prNumber: pullRequestResult?.number,
            linkText: `View PR #${pullRequestResult?.number}`,
            linkUrl: pullRequestResult?.html_url,
            openInNewTab: true
          });
        }
        
        // Update execution record with PR information
        if (executionId && pullRequestResult) {
          await ExecutionHistoryManager.updateExecution(executionId, {
            pullRequestUrl: pullRequestResult.html_url,
            pullRequestNumber: pullRequestResult.number
          });
        }
      } catch (prError: any) {
        console.error('Failed to create pull request:', prError);
        if (sessionLogger) {
          await sessionLogger.captureError(`Failed to create pull request: ${prError.message}`);
        }
        // Don't fail the entire execution if PR creation fails
        // The code changes are still made successfully
      }
    }
    
    // Finalize session logger
    if (sessionLogger) {
      await sessionLogger.finalize(result?.exitCode || 0);
      console.log('Session logger finalized');
    }
    
    // Finalize analytics if enabled
    let analyticsData = null;
    if (analytics) {
      analyticsData = await analytics.finalize(result?.exitCode || 0, (Date.now() - startTime));
      console.log('Analytics finalized:', {
        sessionId: analyticsData.sessionId,
        duration: analyticsData.duration,
        exitCode: analyticsData.exitCode
      });
    }
    
    // Clean up
    try {
      await vibeKit.kill();
      console.log('Sandbox terminated successfully');
    } catch (cleanupError) {
      console.warn('Cleanup warning:', cleanupError);
    }
    
    return NextResponse.json({
      success: result?.exitCode === 0,
      sandboxId: result?.sandboxId,
      exitCode: result?.exitCode,
      executionTime: elapsedTime,
      stdout: result?.stdout || stdout.join('\n'),
      stderr: result?.stderr || stderr.join('\n'),
      updates: updates,
      sessionId: sessionId,  // Return the session ID for log retrieval
      analyticsSessionId: analyticsData?.sessionId,
      pullRequest: pullRequestResult ? {
        url: pullRequestResult.html_url,
        number: pullRequestResult.number,
        created: true
      } : null,
      message: result?.exitCode === 0 
        ? pullRequestResult 
          ? `Subtask executed successfully and pull request #${pullRequestResult.number} created`
          : 'Subtask executed successfully' 
        : 'Subtask execution failed'
    });
    
  } catch (error: any) {
    console.error('Failed to execute subtask:', error);
    
    // Update execution record with error
    if (executionId) {
      try {
        await ExecutionHistoryManager.updateExecution(executionId, {
          status: 'failed',
          endTime: Date.now(),
          exitCode: -1,
          success: false,
          error: error.message
        });
      } catch (updateError) {
        console.warn('Failed to update execution record with error:', updateError);
      }
    }
    
    // Finalize session logger with error
    if (sessionLogger) {
      try {
        await sessionLogger.captureError(`Execution failed: ${error.message}`);
        await sessionLogger.finalize(-1);
      } catch (logError) {
        console.warn('Failed to finalize session logger:', logError);
      }
    }
    
    // Finalize analytics with error if enabled
    if (analytics) {
      try {
        await analytics.finalize(-1, Date.now() - analytics.getStartTime());
      } catch (analyticsError) {
        console.warn('Failed to finalize analytics:', analyticsError);
      }
    }
    
    // Clean up on error
    if (vibeKit) {
      try {
        await vibeKit.kill();
      } catch (cleanupError) {
        console.warn('Cleanup error:', cleanupError);
      }
    }
    
    // Parse error message for specific issues
    let errorType = 'unknown';
    let userMessage = error.message || 'Failed to execute subtask';
    let details = error.stack;
    
    if (error.message?.includes('Cannot read properties of undefined (reading \'port\')') ||
        error.message?.includes('Docker daemon') ||
        error.message?.includes('docker.sock')) {
      errorType = 'docker_not_running';
      userMessage = 'Docker is not running. Please start Docker Desktop and try again.';
      details = 'The sandbox environment requires Docker to be running. Make sure Docker Desktop is installed and running.';
    } else if (error.message?.includes('API key') || 
               error.message?.includes('authentication') ||
               error.message?.includes('unauthorized')) {
      errorType = 'auth_error';
      userMessage = 'Authentication failed. Please check your API keys in settings.';
      details = `Make sure your ${error.message.includes('ANTHROPIC') ? 'Anthropic' : 
                 error.message.includes('OPENAI') ? 'OpenAI' : 
                 error.message.includes('GEMINI') ? 'Google' : 
                 error.message.includes('GROK') ? 'Grok' : 'AI provider'} API key is configured correctly.`;
    } else if (error.message?.includes('rate limit') || 
               error.message?.includes('too many requests')) {
      errorType = 'rate_limit';
      userMessage = 'Rate limit exceeded. Please wait a moment and try again.';
      details = 'You have made too many requests. Please wait a few minutes before trying again.';
    } else if (error.message?.includes('network') || 
               error.message?.includes('ECONNREFUSED') ||
               error.message?.includes('ETIMEDOUT')) {
      errorType = 'network_error';
      userMessage = 'Network error. Please check your internet connection.';
      details = 'Unable to connect to the required services. Check your internet connection and firewall settings.';
    } else if (error.message?.includes('sandbox') || 
               error.message?.includes('container')) {
      errorType = 'sandbox_error';
      userMessage = 'Sandbox environment error. Please try again or use a different sandbox provider.';
      details = error.message;
    }
    
    return NextResponse.json(
      { 
        success: false,
        error: userMessage,
        details: details,
        errorType: errorType,
        originalError: error.message
      },
      { status: errorType === 'docker_not_running' ? 503 : 
                errorType === 'auth_error' ? 401 :
                errorType === 'rate_limit' ? 429 :
                errorType === 'network_error' ? 502 : 500 }
    );
  }
}