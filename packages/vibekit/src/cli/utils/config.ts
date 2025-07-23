/**
 * CLI Configuration Management
 * 
 * Handles loading configuration from environment variables, .env files,
 * and config files for VibeKit CLI commands.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { AgentType } from '@vibe-kit/local';

export interface CLIConfig {
  agents: {
    openai?: { apiKey: string; model?: string | undefined };
    anthropic?: { apiKey: string; model?: string | undefined };
    google?: { apiKey: string; model?: string | undefined };
    groq?: { apiKey: string; model?: string | undefined };
  };
  github?: {
    token: string;
    repository?: string;
  };
  defaults: {
    agent: AgentType;
    model?: string;
    timeout: number;
    workingDir: string;
  };
  docker: {
    registry: string;
    username?: string;
    preferRegistryImages: boolean;
  };
  storage: {
    path: string;
    maxEnvironments: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  telemetry: {
    enabled: boolean;
    endpoint?: string;
    serviceName?: string;
    serviceVersion?: string;
    headers?: Record<string, string>;
    timeout: number;
    samplingRatio: number;
    sessionId?: string;
  };
}

export interface AgentConfig {
  apiKey: string;
  model?: string;
}

/**
 * Load environment variables from .env file if it exists
 */
function loadDotEnv(): void {
  const envPath = join(process.cwd(), '.env');
  
  if (existsSync(envPath)) {
    try {
      const content = require('fs').readFileSync(envPath, 'utf-8');
      const lines = content.split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const [key, ...valueParts] = trimmed.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["'](.*)["']$/, '$1');
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      }
    } catch (error) {
      // Ignore .env file parsing errors
    }
  }
}

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

/**
 * Get environment variable as number
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  return defaultValue;
}

/**
 * Get environment variable as boolean
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value) {
    return value.toLowerCase() === 'true' || value === '1';
  }
  return defaultValue;
}

/**
 * Load configuration from various sources
 */
export function loadConfig(): CLIConfig {
  // Load .env file first
  loadDotEnv();

  // Build configuration object
  const config: CLIConfig = {
    agents: {},
    defaults: {
      agent: (getEnv('VIBEKIT_DEFAULT_AGENT') as AgentType) || 'claude',
      model: getEnv('VIBEKIT_DEFAULT_MODEL'),
      timeout: getEnvNumber('VIBEKIT_DEFAULT_TIMEOUT', 30000),
      workingDir: getEnv('VIBEKIT_DEFAULT_WORKING_DIR') || '/vibe0'
    },
    docker: {
      registry: getEnv('DOCKER_REGISTRY') || 'docker.io',
      username: getEnv('DOCKER_USERNAME'),
      preferRegistryImages: getEnvBoolean('VIBEKIT_PREFER_REGISTRY_IMAGES', true)
    },
    storage: {
      path: getEnv('VIBEKIT_STORAGE_PATH') || join(homedir(), '.vibekit'),
      maxEnvironments: getEnvNumber('VIBEKIT_MAX_ENVIRONMENTS', 10),
      logLevel: (getEnv('VIBEKIT_LOG_LEVEL') as any) || 'info'
    },
    telemetry: {
      enabled: getEnvBoolean('VIBEKIT_TELEMETRY_ENABLED', false),
      endpoint: getEnv('VIBEKIT_TELEMETRY_ENDPOINT'),
      serviceName: getEnv('VIBEKIT_TELEMETRY_SERVICE_NAME') || 'vibekit-cli',
      serviceVersion: getEnv('VIBEKIT_TELEMETRY_SERVICE_VERSION') || '1.0.0',
      headers: (() => {
        const headersStr = getEnv('VIBEKIT_TELEMETRY_HEADERS');
        if (headersStr) {
          try {
            return JSON.parse(headersStr);
          } catch {
            return undefined;
          }
        }
        return undefined;
      })(),
      timeout: getEnvNumber('VIBEKIT_TELEMETRY_TIMEOUT', 5000),
      samplingRatio: (() => {
        const ratio = getEnv('VIBEKIT_TELEMETRY_SAMPLING_RATIO');
        return ratio ? parseFloat(ratio) : 1.0;
      })(),
      sessionId: getEnv('VIBEKIT_TELEMETRY_SESSION_ID')
    }
  };

  // Add agent configurations if API keys are available
  const openaiKey = getEnv('OPENAI_API_KEY');
  if (openaiKey) {
    config.agents.openai = {
      apiKey: openaiKey,
      model: getEnv('OPENAI_MODEL') || getEnv('VIBEKIT_DEFAULT_MODEL')
    };
  }

  const anthropicKey = getEnv('ANTHROPIC_API_KEY');
  if (anthropicKey) {
    config.agents.anthropic = {
      apiKey: anthropicKey,
      model: getEnv('ANTHROPIC_MODEL') || getEnv('VIBEKIT_DEFAULT_MODEL')
    };
  }

  const googleKey = getEnv('GOOGLE_API_KEY');
  if (googleKey) {
    config.agents.google = {
      apiKey: googleKey,
      model: getEnv('GOOGLE_MODEL') || getEnv('VIBEKIT_DEFAULT_MODEL')
    };
  }

  const groqKey = getEnv('GROQ_API_KEY');
  if (groqKey) {
    config.agents.groq = {
      apiKey: groqKey,
      model: getEnv('GROQ_MODEL') || getEnv('VIBEKIT_DEFAULT_MODEL')
    };
  }

  // Add GitHub configuration if token is available
  const githubToken = getEnv('GITHUB_TOKEN');
  if (githubToken) {
    config.github = {
      token: githubToken,
      repository: getEnv('GITHUB_REPOSITORY')
    };
  }

  return config;
}

/**
 * Get agent configuration for a specific agent type
 */
export function getAgentConfig(agentType: AgentType, config: CLIConfig): AgentConfig {
  switch (agentType) {
    case 'claude':
      if (!config.agents.anthropic) {
        throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.');
      }
      return config.agents.anthropic;
      
    case 'codex':
      if (!config.agents.openai) {
        throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
      }
      return config.agents.openai;
      
    case 'gemini':
      if (!config.agents.google) {
        throw new Error('Google API key not configured. Set GOOGLE_API_KEY environment variable.');
      }
      return config.agents.google;
      
    case 'opencode':
      // OpenCode can use various providers, try in order of preference
      if (config.agents.groq) {
        return config.agents.groq;
      }
      if (config.agents.openai) {
        return config.agents.openai;
      }
      if (config.agents.anthropic) {
        return config.agents.anthropic;
      }
      throw new Error('No API key configured for OpenCode agent. Set GROQ_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.');
      
    default:
      throw new Error(`Unknown agent type: ${agentType}`);
  }
}

/**
 * Validate configuration and provide helpful error messages
 */
export function validateConfig(config: CLIConfig): string[] {
  const errors: string[] = [];

  // Check if at least one agent is configured
  const hasAnyAgent = Object.keys(config.agents).length > 0;
  if (!hasAnyAgent) {
    errors.push(
      'No AI agent API keys configured. Please set at least one of:\n' +
      '  - OPENAI_API_KEY (for Codex agent)\n' +
      '  - ANTHROPIC_API_KEY (for Claude agent)\n' +
      '  - GOOGLE_API_KEY (for Gemini agent)\n' +
      '  - GROQ_API_KEY (for OpenCode agent)'
    );
  }

  // Check if default agent is configured
  try {
    getAgentConfig(config.defaults.agent, config);
  } catch (error) {
    errors.push(
      `Default agent '${config.defaults.agent}' is not configured. ` +
      `Either configure the required API key or change VIBEKIT_DEFAULT_AGENT.`
    );
  }

  // Validate timeout
  if (config.defaults.timeout <= 0) {
    errors.push('VIBEKIT_DEFAULT_TIMEOUT must be a positive number');
  }

  // Validate max environments
  if (config.storage.maxEnvironments <= 0) {
    errors.push('VIBEKIT_MAX_ENVIRONMENTS must be a positive number');
  }

  return errors;
}

/**
 * Get default model for an agent type
 */
export function getDefaultModel(agentType: AgentType): string {
  switch (agentType) {
    case 'claude':
      return 'claude-3-5-sonnet-20241022';
    case 'codex':
      return 'gpt-4o';
    case 'gemini':
      return 'gemini-1.5-pro';
    case 'opencode':
      return 'llama-3.1-70b-versatile'; // Groq model
    default:
      return 'gpt-4o';
  }
}

/**
 * Create a VibeKit configuration object from CLI config and environment
 */
export function createVibeKitConfig(
  env: { agentType?: AgentType; sandboxId: string; workingDirectory: string },
  config: CLIConfig
) {
  const agentType = env.agentType || config.defaults.agent;
  const agentConfig = getAgentConfig(agentType, config);
  const model = agentConfig.model || getDefaultModel(agentType);

  return {
    agent: {
      type: agentType,
      model,
      apiKey: agentConfig.apiKey
    },
    github: config.github,
    environment: {
      local: {
        sandboxId: env.sandboxId,
        workingDirectory: env.workingDirectory
      }
    }
  };
} 