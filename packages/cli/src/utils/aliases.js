import fs from 'fs-extra';
import path from 'path';
import os from 'os';

// Get all potential shell configuration files
function getShellConfigPaths() {
  const homedir = os.homedir();
  return [
    path.join(homedir, '.bashrc'),
    path.join(homedir, '.zshrc'),
    path.join(homedir, '.profile'),
    path.join(homedir, '.bash_profile'),
    path.join(homedir, '.zprofile'),
    path.join(homedir, '.zsh_profile')
  ];
}

// Helper functions for alias management
export async function installGlobalAliases() {
  // First remove any existing conflicting aliases
  await removeAllConflictingAliases();
  
  // Use 'vibekit' command directly instead of absolute path
  // This works for both local development (npx vibekit) and global installs
  const aliases = [
    { name: 'claude', command: `"vibekit claude"` },
    { name: 'gemini', command: `"vibekit gemini"` },
    { name: 'codex', command: `"vibekit codex"` }
  ];
  
  const shellConfigPaths = getShellConfigPaths();
  
  for (const alias of aliases) {
    for (const configPath of shellConfigPaths) {
      if (await fs.pathExists(configPath)) {
        const content = await fs.readFile(configPath, 'utf8');
        const aliasLine = `alias ${alias.name}=${alias.command}`;
        
        if (!content.includes(aliasLine)) {
          await fs.appendFile(configPath, `\n# VibeKit alias - do not modify\n${aliasLine}\n`);
        }
      }
    }
  }
  
}

// Remove all conflicting aliases (more robust than uninstallGlobalAliases)
export async function removeAllConflictingAliases() {
  const aliases = ['claude', 'gemini', 'codex'];
  const shellConfigPaths = getShellConfigPaths();
  
  for (const configPath of shellConfigPaths) {
    if (await fs.pathExists(configPath)) {
      const content = await fs.readFile(configPath, 'utf8');
      const lines = content.split('\n');
      let filteredLines = [];
      let skipNext = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip VibeKit alias comment lines
        if (line.includes('# VibeKit alias')) {
          skipNext = true;
          continue;
        }
        
        // Skip alias lines that follow VibeKit comments
        if (skipNext && (line.includes('alias claude=') || line.includes('alias gemini=') || line.includes('alias codex='))) {
          skipNext = false;
          continue;
        }
        
        // Remove any claude/gemini alias that might conflict
        let shouldSkip = false;
        for (const aliasName of aliases) {
          if (line.trim().startsWith(`alias ${aliasName}=`)) {
            // Check if it's any kind of vibekit-related alias or absolute path
            if (line.includes('vibekit') || 
                line.includes('/vibekit/') || 
                line.includes('cli.js') ||
                line.includes('/dist/') ||
                line.includes('node_modules')) {
              shouldSkip = true;
              break;
            }
          }
        }
        
        if (shouldSkip) {
          continue;
        }
        
        filteredLines.push(line);
        skipNext = false;
      }
      
      if (filteredLines.length !== lines.length) {
        await fs.writeFile(configPath, filteredLines.join('\n'));
      }
    }
  }
}

// Legacy function for backwards compatibility
export async function uninstallGlobalAliases() {
  await removeAllConflictingAliases();

}

// Check if aliases are properly set up in current shell
export async function checkAliasesInCurrentShell() {
  const { spawn } = await import('child_process');
  
  return new Promise((resolve) => {
    const shell = process.env.SHELL || '/bin/bash';
    const shellName = path.basename(shell);
    
    // Check if aliases are defined and working
    const checkProcess = spawn(shellName, ['-i', '-c', 'alias claude 2>/dev/null && alias gemini 2>/dev/null && alias codex 2>/dev/null && echo "ALIASES_OK"'], {
      stdio: 'pipe'
    });
    
    let output = '';
    checkProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    checkProcess.on('close', () => {
      const hasValidAliases = output.includes('vibekit claude') && 
                             output.includes('vibekit gemini') && 
                             output.includes('vibekit codex') && 
                             output.includes('ALIASES_OK');
      resolve(hasValidAliases);
    });
    
    // Timeout after 2 seconds
    setTimeout(() => {
      checkProcess.kill();
      resolve(false);
    }, 2000);
  });
}

// Force reload shell aliases in current session
export async function reloadShellAliases() {
  const { spawn } = await import('child_process');
  const shell = process.env.SHELL || '/bin/bash';
  
  try {
    if (shell.includes('zsh') && await fs.pathExists(path.join(os.homedir(), '.zshrc'))) {
      spawn('zsh', ['-c', 'source ~/.zshrc'], { stdio: 'ignore' });
    } else if (shell.includes('bash') && await fs.pathExists(path.join(os.homedir(), '.bashrc'))) {
      spawn('bash', ['-c', 'source ~/.bashrc'], { stdio: 'ignore' });
    }
  } catch (error) {
    // Ignore errors in shell reloading
  }
}

export async function setupAliases(enabled) {
  if (enabled) {
    await installGlobalAliases();
    
    // Give a moment for file writes to complete, then check
    setTimeout(async () => {
      const working = await checkAliasesInCurrentShell();
      if (!working) {
        console.log('⚠️  Aliases installed but may need terminal restart to take effect.');
        console.log('   Run: source ~/.zshrc (or restart your terminal)');
      }
    }, 500);
    
  } else {
    await uninstallGlobalAliases();
  }
}