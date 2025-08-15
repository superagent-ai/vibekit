import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Function to setup proxy settings from ANTHROPIC_BASE_URL
export async function setupProxySettings(proxyEnabled = true) {
  // If proxy is disabled, don't modify settings
  if (!proxyEnabled) {
    return null;
  }

  // Look for settings files starting from current directory and walking up
  let currentDir = process.cwd();
  const settingsFiles = [];
  
  // Walk up directory tree to find .claude folder
  while (currentDir !== path.dirname(currentDir)) {
    settingsFiles.push(
      path.join(currentDir, '.claude', 'settings.local.json'),
      path.join(currentDir, '.claude', 'settings.json')
    );
    currentDir = path.dirname(currentDir);
  }
  
  // Also check home directory
  settingsFiles.push(
    path.join(os.homedir(), '.claude', 'settings.local.json'),
    path.join(os.homedir(), '.claude', 'settings.json')
  );

  for (const settingsFile of settingsFiles) {
    try {
      if (await fs.pathExists(settingsFile)) {
        const settings = await fs.readJson(settingsFile);
        
        // Ensure env section exists
        if (!settings.env) {
          settings.env = {};
        }
        
        // Store original ANTHROPIC_BASE_URL as VIBEKIT_PROXY_TARGET_URL if it exists
        if (settings.env.ANTHROPIC_BASE_URL && settings.env.ANTHROPIC_BASE_URL !== 'http://localhost:8080') {
          settings.env.VIBEKIT_PROXY_TARGET_URL = settings.env.ANTHROPIC_BASE_URL;
        }
        
        // Always set ANTHROPIC_BASE_URL to localhost:8080
        settings.env.ANTHROPIC_BASE_URL = 'http://localhost:8080';
        
        // Write back to the settings file
        await fs.writeJson(settingsFile, settings, { spaces: 2 });
        
        return settings.env.VIBEKIT_PROXY_TARGET_URL || null;
      }
    } catch (error) {
      // Ignore JSON parse errors, continue checking other files
    }
  }

  return null;
}

// Function to read Claude settings for custom VIBEKIT_PROXY_TARGET_URL
export async function getVibeKitProxyTargetURL() {
  const settingsFiles = [
    path.join(process.cwd(), '.claude', 'settings.json'),
    path.join(process.cwd(), '.claude', 'settings.local.json'),
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(os.homedir(), '.claude', 'settings.local.json')
  ];

  for (const settingsFile of settingsFiles) {
    try {
      if (await fs.pathExists(settingsFile)) {
        const settings = await fs.readJson(settingsFile);
        
        // Check for VIBEKIT_PROXY_TARGET_URL in env section
        if (settings.env && settings.env.VIBEKIT_PROXY_TARGET_URL) {
          return settings.env.VIBEKIT_PROXY_TARGET_URL;
        }
      }
    } catch (error) {
      // Ignore JSON parse errors, continue checking other files
    }
  }

  return null;
}

// Function to revert ANTHROPIC_BASE_URL when proxy is turned off
export async function revertAnthropicBaseURL() {
  // Look for settings files starting from current directory and walking up
  let currentDir = process.cwd();
  const settingsFiles = [];
  
  // Walk up directory tree to find .claude folder
  while (currentDir !== path.dirname(currentDir)) {
    settingsFiles.push(
      path.join(currentDir, '.claude', 'settings.local.json'),
      path.join(currentDir, '.claude', 'settings.json')
    );
    currentDir = path.dirname(currentDir);
  }
  
  // Also check home directory
  settingsFiles.push(
    path.join(os.homedir(), '.claude', 'settings.local.json'),
    path.join(os.homedir(), '.claude', 'settings.json')
  );

  let modified = false;

  for (const settingsFile of settingsFiles) {
    try {
      if (await fs.pathExists(settingsFile)) {
        const settings = await fs.readJson(settingsFile);
        
        if (settings.env) {
          let fileModified = false;
          
          // If there's a VIBEKIT_PROXY_TARGET_URL, restore it as ANTHROPIC_BASE_URL
          if (settings.env.VIBEKIT_PROXY_TARGET_URL) {
            settings.env.ANTHROPIC_BASE_URL = settings.env.VIBEKIT_PROXY_TARGET_URL;
            // Remove VIBEKIT_PROXY_TARGET_URL after restoring
            delete settings.env.VIBEKIT_PROXY_TARGET_URL;
            fileModified = true;
          } else if (settings.env.ANTHROPIC_BASE_URL === 'http://localhost:8080') {
            // If ANTHROPIC_BASE_URL is set to proxy but no target URL exists, remove it
            delete settings.env.ANTHROPIC_BASE_URL;
            fileModified = true;
          }
          
          // Write back to the settings file if modified
          if (fileModified) {
            await fs.writeJson(settingsFile, settings, { spaces: 2 });
            modified = true;
          }
        }
      }
    } catch (error) {
      // Ignore JSON parse errors, continue checking other files
    }
  }

  return modified;
}