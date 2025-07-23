/**
 * Shell Completion Utilities
 * 
 * Provides auto-completion support for vibekit local commands
 */

import { LocalSandboxProvider, createLocalProvider } from '@vibe-kit/local';

let cachedProvider: LocalSandboxProvider | null = null;

/**
 * Get cached local provider for completion
 */
function getProvider(): LocalSandboxProvider {
  if (!cachedProvider) {
    cachedProvider = createLocalProvider({ autoInstall: false });
  }
  return cachedProvider;
}

/**
 * Get environment names for completion
 */
export async function getEnvironmentNames(): Promise<string[]> {
  try {
    const provider = getProvider();
    const environments = await provider.listEnvironments();
    return environments.map(env => env.name);
  } catch (error) {
    // Silently fail for completion
    return [];
  }
}

/**
 * Get environment names with specific status for completion
 */
export async function getEnvironmentNamesByStatus(status: string): Promise<string[]> {
  try {
    const provider = getProvider();
    const environments = await provider.listEnvironments();
    return environments
      .filter(env => env.status === status)
      .map(env => env.name);
  } catch (error) {
    // Silently fail for completion
    return [];
  }
}

/**
 * Get running environment names for completion
 */
export async function getRunningEnvironmentNames(): Promise<string[]> {
  return getEnvironmentNamesByStatus('running');
}

/**
 * Get stopped environment names for completion
 */
export async function getStoppedEnvironmentNames(): Promise<string[]> {
  return getEnvironmentNamesByStatus('stopped');
}

/**
 * Get available agent types for completion
 */
export function getAgentTypes(): string[] {
  return ['cursor', 'claude', 'codex', 'gemini'];
}

/**
 * Get available base images for completion
 */
export function getBaseImages(): string[] {
  return [
    'ubuntu:24.04',
    'ubuntu:22.04',
    'node:20',
    'node:18',
    'python:3.11',
    'python:3.10',
    'alpine:latest',
    'debian:bookworm',
  ];
}

/**
 * Get environment status values for completion
 */
export function getStatusValues(): string[] {
  return ['running', 'stopped', 'starting', 'stopping', 'error'];
}

/**
 * Generate bash completion script
 */
export function generateBashCompletion(): string {
  return `#!/bin/bash

_vibekit_local_completion() {
    local cur prev words cword
    _init_completion || return

    case $prev in
        --agent|-a)
            COMPREPLY=($(compgen -W "cursor claude codex gemini" -- "$cur"))
            return 0
            ;;
        --base-image|-i)
            COMPREPLY=($(compgen -W "ubuntu:24.04 ubuntu:22.04 node:20 node:18 python:3.11 python:3.10 alpine:latest debian:bookworm" -- "$cur"))
            return 0
            ;;
        --status|-s)
            COMPREPLY=($(compgen -W "running stopped starting stopping error" -- "$cur"))
            return 0
            ;;
    esac

    # Get current command structure
    local subcommand=""
    local i=1
    while [[ \$i -lt \$cword ]]; do
        if [[ "\${words[i]}" != -* ]]; then
            subcommand="\${words[i]}"
            break
        fi
        ((i++))
    done

    case $subcommand in
        create)
            if [[ $cur == -* ]]; then
                COMPREPLY=($(compgen -W "--name --agent --base-image --working-directory --env --interactive" -- "$cur"))
            fi
            ;;
        list|ls)
            if [[ $cur == -* ]]; then
                COMPREPLY=($(compgen -W "--status --agent --branch --json" -- "$cur"))
            fi
            ;;
        watch)
            if [[ $cur == -* ]]; then
                COMPREPLY=($(compgen -W "--all --follow" -- "$cur"))
            else
                # Complete with environment names
                local envs=$(vibekit local list --json 2>/dev/null | jq -r '.[].name' 2>/dev/null)
                COMPREPLY=($(compgen -W "$envs" -- "$cur"))
            fi
            ;;
        terminal|shell)
            if [[ $cur != -* ]]; then
                # Complete with running environment names
                local envs=$(vibekit local list --json --status running 2>/dev/null | jq -r '.[].name' 2>/dev/null)
                COMPREPLY=($(compgen -W "$envs" -- "$cur"))
            fi
            ;;
        delete|rm)
            if [[ $cur == -* ]]; then
                COMPREPLY=($(compgen -W "--force --all --interactive" -- "$cur"))
            else
                # Complete with environment names
                local envs=$(vibekit local list --json 2>/dev/null | jq -r '.[].name' 2>/dev/null)
                COMPREPLY=($(compgen -W "$envs" -- "$cur"))
            fi
            ;;
        *)
            # Complete with subcommands
            COMPREPLY=($(compgen -W "create list watch terminal delete" -- "$cur"))
            ;;
    esac
}

complete -F _vibekit_local_completion vibekit
`;
}

/**
 * Generate zsh completion script
 */
export function generateZshCompletion(): string {
  return `#compdef vibekit

_vibekit_local() {
    local context state line
    typeset -A opt_args

    _arguments \
        '1:subcommand:(create list watch terminal delete)' \
        '*:: :->args' \
        && return 0

    case $state in
        args)
            case $words[1] in
                create)
                    _arguments \
                        '--name[Environment name]:name:' \
                        '--agent[Agent type]:agent:(cursor claude codex gemini)' \
                        '--base-image[Base Docker image]:image:(ubuntu:24.04 ubuntu:22.04 node:20 node:18 python:3.11 python:3.10 alpine:latest debian:bookworm)' \
                        '--working-directory[Working directory]:path:_directories' \
                        '--env[Environment variables]:vars:' \
                        '--interactive[Interactive mode]'
                    ;;
                list|ls)
                    _arguments \
                        '--status[Filter by status]:status:(running stopped starting stopping error)' \
                        '--agent[Filter by agent]:agent:(cursor claude codex gemini)' \
                        '--branch[Filter by branch]:branch:' \
                        '--json[JSON output]'
                    ;;
                watch)
                    _arguments \
                        '--all[Watch all environments]' \
                        '--follow[Follow log output]' \
                        '1:environment:_vibekit_environments'
                    ;;
                terminal|shell)
                    _arguments '1:environment:_vibekit_running_environments'
                    ;;
                delete|rm)
                    _arguments \
                        '--force[Force deletion]' \
                        '--all[Delete all environments]' \
                        '--interactive[Interactive mode]' \
                        '1:environment:_vibekit_environments'
                    ;;
            esac
            ;;
    esac
}

# Helper function to complete environment names
_vibekit_environments() {
    local environments
    environments=($(vibekit local list --json 2>/dev/null | jq -r '.[].name' 2>/dev/null))
    _describe 'environments' environments
}

# Helper function to complete running environment names
_vibekit_running_environments() {
    local environments
    environments=($(vibekit local list --json --status running 2>/dev/null | jq -r '.[].name' 2>/dev/null))
    _describe 'running environments' environments
}

_vibekit_local "$@"
`;
}

/**
 * Install completion script for current shell
 */
export async function installCompletion(shell: string = 'auto'): Promise<void> {
  const os = require('os');
  const fs = require('fs').promises;
  const path = require('path');

  // Auto-detect shell if not specified
  if (shell === 'auto') {
    const shellEnv = process.env.SHELL || '/bin/bash';
    if (shellEnv.includes('zsh')) {
      shell = 'zsh';
    } else if (shellEnv.includes('bash')) {
      shell = 'bash';
    } else {
      shell = 'bash'; // Default fallback
    }
  }

  const homeDir = os.homedir();
  let script: string;
  let targetPath: string;

  switch (shell) {
    case 'bash':
      script = generateBashCompletion();
      targetPath = path.join(homeDir, '.bash_completion.d', 'vibekit-local');
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      break;

    case 'zsh':
      script = generateZshCompletion();
      
      // Try common zsh completion directories
      const zshDirs = [
        path.join(homeDir, '.zsh', 'completions'),
        '/usr/local/share/zsh/site-functions',
        '/opt/homebrew/share/zsh/site-functions',
      ];
      
      targetPath = path.join(zshDirs[0], '_vibekit_local');
      
      // Ensure directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      break;

    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }

  // Write completion script
  await fs.writeFile(targetPath, script, 'utf8');
  
  console.log(`Shell completion installed to: ${targetPath}`);
  
  if (shell === 'bash') {
    console.log('Add this to your ~/.bashrc to enable completion:');
    console.log(`source ${targetPath}`);
  } else if (shell === 'zsh') {
    console.log('Add this to your ~/.zshrc to enable completion:');
    console.log(`fpath=(${path.dirname(targetPath)} $fpath)`);
    console.log('autoload -U compinit && compinit');
  }
} 