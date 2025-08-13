import chalk from 'chalk';
import { ClaudeAuth } from '@vibe-kit/auth/node';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';

/**
 * Claude-specific authentication helper.
 * Handles OAuth token management and container credential injection.
 */
export class ClaudeAuthHelper {
  
  /**
   * Check if credentials are available for Claude
   * @returns {Promise<boolean>} True if Claude auth is available
   */
  static async hasCredentials() {
    try {
      const token = await ClaudeAuth.getValidToken();
      return !!token;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Inject Claude credentials into container arguments
   * @param {string[]} containerArgs - Container arguments to modify
   * @param {string} command - The command being executed
   * @param {string[]} args - The command arguments
   * @returns {Promise<Object|null>} - Command modification object or null
   */
  static async injectCredentials(containerArgs, command = null, args = []) {
    try {
      const credentials = await this.getClaudeCredentials();
      if (!credentials) {
        return null;
      }
      
      // Inject credentials into container
      this.injectClaudeCredentials(credentials, containerArgs);
      
      // Create command wrapper if it's a Claude command
      let commandModification = null;
      if (command === 'claude') {
        commandModification = this.createClaudeWrapper(credentials, args);
      }
      
      console.log(chalk.blue('[auth] ✅ Claude credentials injected into Docker container'));
      return commandModification;
      
    } catch (error) {
      console.log(chalk.yellow(`[auth] ⚠️  Failed to inject Claude credentials: ${error.message}`));
      return null;
    }
  }
  
  /**
   * Get Claude credentials (OAuth token + settings)
   * @returns {Promise<Object|null>} Credential object or null
   */
  static async getClaudeCredentials() {
    try {
      // Get valid OAuth token and raw token data
      const token = await ClaudeAuth.getValidToken();
      const tokenData = await ClaudeAuth.getRawToken();
      
      if (!token || !tokenData) {
        return null;
      }
      
      // Generate settings for onboarding bypass (now includes MCP servers from host)
      const settings = await this.generateClaudeSettings(tokenData);
      
      return {
        oauthToken: token,
        settings: settings,
        tokenData: tokenData
      };
      
    } catch (error) {
      // Return null if auth fails - this is expected when not authenticated
      return null;
    }
  }
  
  /**
   * Inject Claude credentials into container arguments
   * @param {Object} credentials - Credential object from getClaudeCredentials()
   * @param {string[]} containerArgs - Container arguments to modify
   */
  static injectClaudeCredentials(credentials, containerArgs) {
    // Inject OAuth token as environment variable
    containerArgs.push('-e', `CLAUDE_CODE_OAUTH_TOKEN=${credentials.oauthToken}`);
    
    // Inject settings as environment variable - properly escape for shell
    const settingsJson = JSON.stringify(credentials.settings);
    // Escape quotes and special characters for shell safety
    const escapedSettings = settingsJson.replace(/"/g, '\\"');
    containerArgs.push('-e', `CLAUDE_SETTINGS="${escapedSettings}"`);
  }
  
  /**
   * Create wrapper command for Claude with settings injection
   * @param {Object} credentials - Credential object from getClaudeCredentials()
   * @param {string[]} args - Original command arguments
   * @returns {Object} Command modification object
   */
  static createClaudeWrapper(credentials, args) {
    // Create bash wrapper that deep merges our settings into /root/.claude.json
    const settingsJson = JSON.stringify(credentials.settings);
    const mergeScript = `
      # Write our settings to temp file
      echo '${settingsJson}' > /tmp/vibekit-settings.json
      
      # Create merge script using Node.js (available in Claude container)
      cat > /tmp/merge-settings.js << 'MERGE_EOF'
const fs = require('fs');
const path = '/root/.claude.json';
const tempPath = '/tmp/vibekit-settings.json';

// Deep merge function
function deepMerge(target, source) {
  const result = { ...target };
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

try {
  // Read existing config or start with empty object
  let existingConfig = {};
  if (fs.existsSync(path)) {
    existingConfig = JSON.parse(fs.readFileSync(path, 'utf8'));
  }
  
  // Read our settings
  const newSettings = JSON.parse(fs.readFileSync(tempPath, 'utf8'));
  
  // Deep merge and write back
  const mergedConfig = deepMerge(existingConfig, newSettings);
  fs.writeFileSync(path, JSON.stringify(mergedConfig, null, 2));
  
  console.log('[vibekit] Settings merged successfully');
} catch (error) {
  console.error('[vibekit] Settings merge failed:', error.message);
  process.exit(1);
}
MERGE_EOF

      # Run merge script then start claude
      node /tmp/merge-settings.js && claude ${args.join(' ')}
    `;
    
    return {
      command: 'bash',
      args: ['-c', mergeScript.trim()]
    };
  }
  
  /**
   * Extract MCP server configurations from host .claude.json file
   * @returns {Object} MCP server configurations or empty object
   */
  static async extractHostMcpServers() {
    try {
      const homeDir = os.homedir();
      const claudeAuthFile = path.join(homeDir, '.claude.json');
      
      console.log(chalk.blue(`[auth] 🔍 Looking for MCP servers in: ${claudeAuthFile}`));
      
      if (await fs.pathExists(claudeAuthFile)) {
        console.log(chalk.blue('[auth] 📁 Host .claude.json file exists, reading...'));
        const hostConfig = await fs.readJson(claudeAuthFile);
        
        console.log(chalk.blue(`[auth] 📋 Host config keys: ${Object.keys(hostConfig).join(', ')}`));
        
        // Extract user-scope MCP server configs
        if (hostConfig.mcpServers && typeof hostConfig.mcpServers === 'object') {
          console.log(chalk.green(`[auth] ✅ Found root-level mcpServers: ${JSON.stringify(hostConfig.mcpServers)}`));
          return hostConfig.mcpServers;
        } else {
          console.log(chalk.yellow('[auth] ⚠️  No root-level mcpServers found in host .claude.json'));
          if (hostConfig.mcpServers === undefined) {
            console.log(chalk.blue('[auth] 📝 mcpServers key is undefined'));
          } else {
            console.log(chalk.blue(`[auth] 📝 mcpServers value: ${JSON.stringify(hostConfig.mcpServers)}`));
          }
        }
      } else {
        console.log(chalk.yellow(`[auth] ⚠️  Host .claude.json file does not exist at: ${claudeAuthFile}`));
      }
    } catch (error) {
      // Log more detailed error information
      console.log(chalk.red(`[auth] ❌ Error extracting MCP servers from host .claude.json: ${error.message}`));
      console.log(chalk.red(`[auth] 📍 Error stack: ${error.stack}`));
    }
    
    console.log(chalk.blue('[auth] 📤 Returning empty mcpServers object: {}'));
    return {};
  }

  /**
   * Generate Claude CLI settings for onboarding bypass
   * @param {Object} tokenData - Raw token data from ClaudeAuth
   * @returns {Promise<Object>} Settings object for Claude CLI
   */
  static async generateClaudeSettings(tokenData) {
    // Extract MCP server configurations from host file
    const hostMcpServers = await this.extractHostMcpServers();
    
    return {
      hasCompletedOnboarding: true, // Skip first-time setup
      numStartups: 2, // Indicate it's been started before
      installMethod: 'vibekit-oauth', // Custom install method identifier
      autoUpdates: true,
      userID: this.generateUserIdFromToken(tokenData),
      tipsHistory: {
        'new-user-warmup': 1
      },
      firstStartTime: new Date().toISOString(),
      // Always inject user-scope MCP server configurations from host (even if empty)
      mcpServers: hostMcpServers,
      // Project-level configuration for /workspace
      projects: {
        "/workspace": {
          allowedTools: [],
          history: [],
          mcpContextUris: [],
          mcpServers: {},
          enabledMcpjsonServers: [],
          disabledMcpjsonServers: [],
          hasTrustDialogAccepted: true, // Skip trust dialog prompts
          hasTrustDialogHooksAccepted: false,
          projectOnboardingSeenCount: 1,
          hasClaudeMdExternalIncludesApproved: false,
          hasClaudeMdExternalIncludesWarningShown: false
        }
      },
      // Add OAuth account info if available
      ...(tokenData.account && {
        oauthAccount: {
          uuid: tokenData.account.uuid,
          email_address: tokenData.account.email_address
        }
      }),
      // Add organization info if available  
      ...(tokenData.organization && {
        organization: {
          uuid: tokenData.organization.uuid,
          name: tokenData.organization.name
        }
      })
    };
  }
  
  /**
   * Generate consistent user ID from token data
   * @param {Object} tokenData - Raw token data from ClaudeAuth
   * @returns {string} SHA256 hash of user identifier
   */
  static generateUserIdFromToken(tokenData) {
    // Use account UUID if available, otherwise generate from token
    if (tokenData.account && tokenData.account.uuid) {
      return crypto
        .createHash('sha256')
        .update(tokenData.account.uuid)
        .digest('hex');
    }
    
    // Fallback: generate from access token (consistent per user)
    return crypto
      .createHash('sha256')
      .update(tokenData.access_token.substring(0, 50)) // Use first 50 chars for consistency
      .digest('hex');
  }
  
  /**
   * Get authentication status for display
   * @returns {Promise<Object>} Status information
   */
  static async getAuthStatus() {
    try {
      const credentials = await this.getClaudeCredentials();
      
      if (!credentials) {
        return {
          supported: true,
          authenticated: false,
          message: 'Not authenticated'
        };
      }
      
      // Check for expiration information in token data
      let expiresAt = null;
      const tokenData = credentials.tokenData;
      
      if (tokenData) {
        // Log token data for debugging (uncomment if needed)
        // console.log('Debug - tokenData keys:', Object.keys(tokenData));
        
        // Check for various possible expiration fields
        if (tokenData.expires_at) {
          // Handle both seconds and milliseconds timestamps
          const timestamp = tokenData.expires_at;
          expiresAt = timestamp > 1e12 ? new Date(timestamp) : new Date(timestamp * 1000);
        } else if (tokenData.expires_in && tokenData.created_at) {
          const createdTimestamp = tokenData.created_at > 1e12 ? tokenData.created_at : tokenData.created_at * 1000;
          expiresAt = new Date(createdTimestamp + (tokenData.expires_in * 1000));
        } else if (tokenData.expires_in) {
          // Use current time as base if no created_at
          expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
        }
        
        // Check if the calculated date seems unreasonable (more than 10 years in future)
        if (expiresAt && expiresAt.getFullYear() > new Date().getFullYear() + 10) {
          // Probably a parsing error, don't show expiration
          expiresAt = null;
        }
        
        // Check if token is expired
        if (expiresAt && expiresAt < new Date()) {
          return {
            supported: true,
            authenticated: false,
            message: 'Token expired',
            expiresAt: expiresAt
          };
        }
      }
      
      return {
        supported: true,
        authenticated: true,
        message: 'Authenticated with Claude',
        expiresAt: expiresAt
      };
    } catch (error) {
      return {
        supported: true,
        authenticated: false,
        message: `Authentication error: ${error.message}`
      };
    }
  }
}

export default ClaudeAuthHelper;