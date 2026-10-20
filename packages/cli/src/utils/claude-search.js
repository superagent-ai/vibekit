import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const parallelConfig = JSON.stringify({
  mcpServers: {
    parallel: {
      type: 'http',
      url: 'https://search.parallel.ai/mcp',
      headers: { 'User-Agent': 'vibekit (https://github.com/superagent-ai/vibekit)' }
    }
  }
});

// These flags select a saved session, configuration, or tool policy. Let Claude
// resolve them without adding a second search provider or bypassing a restriction.
const configurationFlags = new Set([
  '--mcp-config', '--strict-mcp-config', '--settings', '--setting-sources',
  '--tools', '--disallowedTools', '--disallowed-tools', '--permission-mode',
  '--plugin-dir', '--agent', '--agents',
  '--continue', '-c', '--resume', '-r', '--fork-session',
  '--help', '-h', '--version', '-v'
]);
const subcommands = new Set(['mcp', 'auth', 'config', 'doctor', 'install', 'update', 'setup-token']);

function selectsNativeSearch(args) {
  for (let i = 0; i < args.length; i++) {
    const [flag, ...inline] = args[i].split('=');
    if (flag !== '--allowedTools' && flag !== '--allowed-tools') continue;
    const values = inline.length ? [inline.join('=')] : [];
    if (!inline.length) {
      for (let j = i + 1; j < args.length && !args[j].startsWith('-'); j++) values.push(args[j]);
    }
    if (values.some(value => value.split(/[,\s]+/).some(tool =>
      tool === '*' || tool === 'Web*' || tool.startsWith('WebSearch')))) return true;
  }
  return false;
}

function hasToolChoices(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, entry]) => {
    // Empty server maps/lists are the normal unconfigured state. Explicit
    // booleans (including false) still express an enable/disable choice.
    if (/mcp|search|fetch|permissions|allowedTools|disallowedTools|plugin|marketplace/i.test(key)) {
      if (entry === null || typeof entry !== 'object') return true;
      if (entry && typeof entry === 'object' && Object.keys(entry).length) return true;
    }
    return hasToolChoices(entry);
  });
}

async function configHasChoices(file, existenceIsChoice = false) {
  try {
    const text = await readFile(file, 'utf8');
    const config = JSON.parse(text);
    return existenceIsChoice || !config || typeof config !== 'object' ||
      Array.isArray(config) || hasToolChoices(config);
  } catch (error) {
    // An unreadable/malformed configuration is never permission to fall back.
    return error.code !== 'ENOENT';
  }
}

/**
 * Supply search for an unconfigured Claude launch without changing files or tool
 * permissions. Claude owns MCP transport, approvals, timeouts and cancellation.
 */
export async function resolveClaudeSearchArgs(args, {
  cwd = process.cwd(), home = os.homedir(), settings = {}, env = process.env,
  sandboxOptions = {}
} = {}) {
  // Consume our own opt-out only before the end-of-options delimiter.
  const delimiter = args.indexOf('--');
  const optionArgs = delimiter < 0 ? args : args.slice(0, delimiter);
  const disabled = optionArgs.includes('--no-search');
  const forwarded = args.filter((arg, index) => !(arg === '--no-search' && (delimiter < 0 || index < delimiter)));
  if (disabled || Object.hasOwn(settings, 'search') || env.VIBEKIT_SEARCH ||
      env.CLAUDE_CONFIG_DIR || env.VIBEKIT_SANDBOX_ACTIVE ||
      env.VIBEKIT_SANDBOX_IMAGE || env.VIBEKIT_SANDBOX_FLAGS ||
      env.VIBEKIT_SANDBOX_EXEC_PROFILE || env.VIBEKIT_SANDBOX_EXEC_PROFILE_FILE ||
      env.VIBEKIT_SANDBOX_EXEC_PROFILE_STRING || env.VIBEKIT_SANDBOX_EXEC_PARAMS ||
      settings.sandbox?.sandboxExec || sandboxOptions.sandboxExec ||
      selectsNativeSearch(optionArgs) ||
      optionArgs.some(arg => configurationFlags.has(arg.split('=')[0])) ||
      subcommands.has(optionArgs[0])) return forwarded;

  const files = new Map([
    [path.join(home, '.vibekit', 'settings.json'), false],
    [path.join(home, '.claude.json'), false],
    [path.join(home, '.claude', 'settings.json'), false],
    [path.join(home, '.claude', 'settings.local.json'), false],
    [path.join(home, '.config', 'claude'), true],
    // Managed policy is resolved by Claude. Never compete with it.
    ['/etc/claude-code/managed-settings.json', true],
    ['/etc/claude-code/managed-mcp.json', true],
    ['/Library/Application Support/ClaudeCode/managed-settings.json', true],
    ['/Library/Application Support/ClaudeCode/managed-mcp.json', true],
    [path.join(env.ProgramFiles || 'C:\\Program Files', 'ClaudeCode', 'managed-settings.json'), true],
    [path.join(env.ProgramFiles || 'C:\\Program Files', 'ClaudeCode', 'managed-mcp.json'), true]
  ]);
  // Claude can load project configuration from ancestors, not just cwd.
  for (let dir = path.resolve(cwd); ; dir = path.dirname(dir)) {
    files.set(path.join(dir, '.mcp.json'), true);
    files.set(path.join(dir, '.claude', 'settings.json'), false);
    files.set(path.join(dir, '.claude', 'settings.local.json'), false);
    if (dir === path.dirname(dir)) break;
  }
  for (const [file, existenceIsChoice] of files) {
    if (await configHasChoices(file, existenceIsChoice)) return forwarded;
  }

  // No auth header or process-wide session_id: the host owns conversation scope.
  // Make this the unconfigured search default, rather than offering two search
  // providers to the model. Explicit configuration or --no-search restores the
  // host's own tools; this restriction never grants MCP tool permission.
  // Both host options are variadic. Append them after the user's prompt so a
  // positional prompt cannot be consumed as another MCP config or denied tool.
  const insertion = delimiter < 0 ? forwarded.length : delimiter;
  return [...forwarded.slice(0, insertion), '--mcp-config', parallelConfig,
    '--disallowedTools', 'WebSearch', ...forwarded.slice(insertion)];
}
