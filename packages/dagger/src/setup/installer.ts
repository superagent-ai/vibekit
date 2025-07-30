/**
 * Local Provider Setup and Installation
 * 
 * Handles setup and pre-building of agent images for the local provider.
 * This includes validating dependencies, installing tools, and caching
 * Docker images for faster startup times.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { prebuildAgentImages, type AgentType } from '../dagger/vibekit-dagger';

const execAsync = promisify(exec);

export interface SetupOptions {
  skipPreBuild?: boolean;
  selectedAgents?: AgentType[];
  verbose?: boolean;
}

export interface SetupResult {
  success: boolean;
  message: string;
  preBuildResults?: Array<{ agentType: AgentType; success: boolean; error?: string }>;
  warnings?: string[];
}

/**
 * Validate system dependencies for local provider
 */
export async function validateDependencies(): Promise<{ valid: boolean; issues: string[] }> {
  const issues: string[] = [];

  try {
    // Check Docker
    await execAsync('docker --version');
    try {
      await execAsync('docker info');
    } catch (error) {
      issues.push('Docker is installed but not running. Please start Docker.');
    }
  } catch (error) {
    issues.push('Docker is not installed. Please install Docker from https://docs.docker.com/get-docker/');
  }

  try {
    // Check Dagger CLI
    await execAsync('dagger version');
  } catch (error) {
    issues.push('Dagger CLI is not installed. Please install from https://docs.dagger.io/install/');
  }

  try {
    // Check Node.js version (for MCP server functionality)
    const { stdout } = await execAsync('node --version');
    const version = stdout.trim();
    const majorVersion = parseInt(version.substring(1).split('.')[0]);
    if (majorVersion < 18) {
      issues.push(`Node.js ${version} detected. Node.js 18+ is recommended for optimal performance.`);
    }
  } catch (error) {
    issues.push('Node.js is not available. This may affect MCP server functionality.');
  }

  return {
    valid: issues.length === 0,
    issues
  };
}

/**
 * Setup the local provider with optional pre-building
 */
export async function setupLocalProvider(options: SetupOptions = {}): Promise<SetupResult> {
  const { skipPreBuild = false, selectedAgents, verbose = false } = options;
  const warnings: string[] = [];

  try {
    if (verbose) {
      console.log('🔍 Validating system dependencies...');
    }

    // Step 1: Validate dependencies
    const validation = await validateDependencies();
    if (!validation.valid) {
      return {
        success: false,
        message: `Setup failed due to missing dependencies:\n${validation.issues.map(issue => `  ❌ ${issue}`).join('\n')}`,
        warnings
      };
    }

    if (verbose) {
      console.log('✅ System dependencies validated');
    }

    // Step 2: Test Dagger connectivity
    if (verbose) {
      console.log('🔗 Testing Dagger engine connectivity...');
    }

    try {
      await execAsync('dagger query --help', { timeout: 10000 });
      if (verbose) {
        console.log('✅ Dagger engine connectivity verified');
      }
    } catch (error) {
      warnings.push('Dagger engine test skipped (may start on first use)');
      if (verbose) {
        console.log('⚠️  Dagger engine will start automatically on first use');
      }
    }

    let preBuildResults;

    // Step 3: Pre-build agent images (optional)
    if (!skipPreBuild) {
      if (verbose) {
        console.log('🏗️ Pre-building agent images for faster startup...');
      }

      try {
        const buildResult = await prebuildAgentImages(selectedAgents);
        preBuildResults = buildResult.results;

        if (buildResult.success) {
          const successCount = buildResult.results.filter(r => r.success).length;
          if (verbose) {
            console.log(`✅ Pre-build completed: ${successCount}/${buildResult.results.length} images ready`);
          }
        } else {
          warnings.push('Some agent images failed to pre-build but can be built on first use');
        }
      } catch (error) {
        warnings.push(`Pre-building failed: ${error instanceof Error ? error.message : String(error)}`);
        if (verbose) {
          console.log('⚠️  Agent images will be built on first use instead');
        }
      }
    } else if (verbose) {
      console.log('⏭️  Skipping pre-build as requested');
    }

    // Step 4: Setup completion
    const successMessage = [
      'Local provider setup completed successfully!',
      '',
      '📋 What\'s available:',
      '  • Create sandboxes with agent-specific environments',
      '  • Automatic Docker image caching for fast startup',
      '  • Local development with containerized isolation',
      '  • Git operations and PR creation support',
      '',
      '🚀 Quick start:',
      '  const provider = createLocalProvider();',
      '  const sandbox = await provider.create({}, "claude");',
      '',
    ];

    if (preBuildResults) {
      const successfulBuilds = preBuildResults.filter(r => r.success).map(r => r.agentType);
      if (successfulBuilds.length > 0) {
        successMessage.push(`🎯 Pre-built agents: ${successfulBuilds.join(', ')}`);
      }
    }

    if (warnings.length > 0) {
      successMessage.push('');
      successMessage.push('⚠️  Warnings:');
      warnings.forEach(warning => successMessage.push(`  • ${warning}`));
    }

    return {
      success: true,
      message: successMessage.join('\n'),
      preBuildResults,
      warnings
    };

  } catch (error) {
    return {
      success: false,
      message: `Setup failed: ${error instanceof Error ? error.message : String(error)}`,
      warnings
    };
  }
}

/**
 * Pre-build specific agent images
 */
export async function prebuildSpecificAgents(agentTypes: AgentType[]): Promise<SetupResult> {
  try {
    console.log(`🏗️ Pre-building images for: ${agentTypes.join(', ')}`);
    
    const buildResult = await prebuildAgentImages();
    const requestedResults = buildResult.results.filter(r => agentTypes.includes(r.agentType));
    
    const successCount = requestedResults.filter(r => r.success).length;
    const failedAgents = requestedResults.filter(r => !r.success).map(r => `${r.agentType}: ${r.error}`);
    
    let message = `Pre-build completed: ${successCount}/${agentTypes.length} requested images ready`;
    
    if (failedAgents.length > 0) {
      message += `\n\nFailed builds:\n${failedAgents.map(f => `  ❌ ${f}`).join('\n')}`;
    }

    return {
      success: successCount > 0,
      message,
      preBuildResults: requestedResults
    };
  } catch (error) {
    return {
      success: false,
      message: `Pre-build failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Check if local provider is properly set up
 */
export async function checkSetupStatus(): Promise<{ isSetup: boolean; issues: string[]; recommendations: string[] }> {
  const issues: string[] = [];
  const recommendations: string[] = [];

  // Check dependencies
  const validation = await validateDependencies();
  issues.push(...validation.issues);

  // Check if any agent images are pre-built
  try {
    const agentTypes: AgentType[] = ["claude", "codex", "opencode", "gemini"];
    let hasPreBuiltImages = false;

    for (const agentType of agentTypes) {
      try {
        const { stdout } = await execAsync(`docker images -q vibekit-${agentType}:latest`);
        if (stdout.trim()) {
          hasPreBuiltImages = true;
          break;
        }
      } catch (error) {
        // Ignore individual image check errors
      }
    }

    if (!hasPreBuiltImages) {
      recommendations.push('Consider pre-building agent images for faster startup: prebuildAgentImages()');
    }
  } catch (error) {
    recommendations.push('Unable to check pre-built images status');
  }

  return {
    isSetup: issues.length === 0,
    issues,
    recommendations
  };
}

/**
 * Clean up pre-built images (for maintenance)
 */
export async function cleanupPreBuiltImages(): Promise<{ success: boolean; removed: string[]; errors: string[] }> {
  const removed: string[] = [];
  const errors: string[] = [];
  const agentTypes: AgentType[] = ["claude", "codex", "opencode", "gemini"];

  for (const agentType of agentTypes) {
    const imageTag = `vibekit-${agentType}:latest`;
    try {
      const { stdout } = await execAsync(`docker images -q ${imageTag}`);
      if (stdout.trim()) {
        await execAsync(`docker rmi ${imageTag}`);
        removed.push(imageTag);
      }
    } catch (error) {
      errors.push(`Failed to remove ${imageTag}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    success: errors.length === 0,
    removed,
    errors
  };
} 