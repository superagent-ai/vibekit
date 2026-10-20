import { beforeEach, describe, expect, test, vi } from 'vitest';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { resolveClaudeSearchArgs } from '../../src/utils/claude-search.js';

vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));

const home = '/users/search-test';
const cwd = '/projects/repository/nested';
const originalArgs = ['-p', 'Find current release documentation'];
let files;

function options(overrides = {}) {
  return { home, cwd, settings: {}, env: {}, sandboxOptions: {}, ...overrides };
}

function config(file, value) {
  files.set(file, JSON.stringify(value));
}

async function expectUnchanged(overrides = {}, args = originalArgs) {
  expect(await resolveClaudeSearchArgs(args, options(overrides))).toEqual(args);
}

beforeEach(() => {
  files = new Map();
  vi.mocked(readFile).mockReset().mockImplementation(async file => {
    if (files.has(file)) {
      const value = files.get(file);
      if (value instanceof Error) throw value;
      return value;
    }
    throw Object.assign(new Error('Missing fixture'), { code: 'ENOENT' });
  });
});

describe('Claude search launch configuration', () => {
  test('adds anonymous HTTP MCP search to a fresh launch without mutating arguments', async () => {
    const args = [...originalArgs];
    const resolved = await resolveClaudeSearchArgs(args, options());
    expect(args).toEqual(originalArgs);
    expect(resolved.slice(0, -4)).toEqual(args);
    expect(resolved.at(-4)).toBe('--mcp-config');
    expect(resolved.slice(-2)).toEqual(['--disallowedTools', 'WebSearch']);
    const configuration = JSON.parse(resolved.at(-3));
    expect(configuration).toEqual({
      mcpServers: {
        parallel: {
          type: 'http',
          url: 'https://search.parallel.ai/mcp',
          headers: { 'User-Agent': 'vibekit (https://github.com/superagent-ai/vibekit)' }
        }
      }
    });
    expect(JSON.stringify(configuration)).not.toMatch(/api.?key|authorization|session_id/i);
    expect(resolved).not.toContain('--allowedTools');
    expect(resolved).not.toContain('--dangerously-skip-permissions');
  });

  test('keeps credential-only host settings and empty default MCP maps unconfigured', async () => {
    config(path.join(home, '.claude.json'), {
      oauthAccount: { uuid: 'saved-login' },
      mcpServers: {},
      projects: { [cwd]: { mcpServers: {}, allowedTools: [], disabledMcpjsonServers: [] } }
    });
    expect((await resolveClaudeSearchArgs(originalArgs, options())).at(-4)).toBe('--mcp-config');
  });

  test.each([
    { mcpServers: { existingSearch: { type: 'http', url: 'https://search.example/mcp' } } },
    { mcpServers: { parallel: { type: 'http', url: 'https://custom.example/mcp' } } },
    { projects: { [cwd]: { disabledMcpjsonServers: ['parallel'] } } },
    { projects: { [cwd]: { enabledMcpjsonServers: ['saved-server'] } } },
    { projects: { [cwd]: { allowedTools: ['WebSearch'] } } },
    { enableAllProjectMcpServers: false },
    { permissions: { deny: ['WebSearch'] } },
    { permissions: { ask: ['mcp__parallel__*'] } },
    { search: false },
    { searchProvider: 'existing' },
    { enabledPlugins: { 'search@tools': true } },
    { extraKnownMarketplaces: { tools: { source: { source: 'github', repo: 'example/tools' } } } },
    { webFetch: false }
  ])('preserves saved tool or provider choices: %j', async value => {
    config(path.join(home, '.claude.json'), value);
    await expectUnchanged();
  });

  test.each([
    '/users/search-test/.claude/settings.json',
    '/users/search-test/.claude/settings.local.json',
    '/projects/repository/nested/.claude/settings.json',
    '/projects/repository/.claude/settings.local.json',
    '/projects/.claude/settings.json',
    '/.claude/settings.local.json'
  ])('respects user, project and ancestor settings at %s', async file => {
    config(file, { permissions: { deny: ['WebSearch'] } });
    await expectUnchanged();
  });

  test.each([
    '/projects/repository/nested/.mcp.json',
    '/projects/repository/.mcp.json',
    '/projects/.mcp.json',
    '/.mcp.json',
    '/etc/claude-code/managed-settings.json',
    '/etc/claude-code/managed-mcp.json',
    '/Library/Application Support/ClaudeCode/managed-settings.json',
    '/Library/Application Support/ClaudeCode/managed-mcp.json'
  ])('treats explicit or managed MCP configuration at %s as authoritative, even empty', async file => {
    config(file, {});
    await expectUnchanged();
  });

  test('checks the Windows managed configuration location supplied by the environment', async () => {
    config(path.join('/windows/program-files', 'ClaudeCode', 'managed-mcp.json'), {});
    await expectUnchanged({ env: { ProgramFiles: '/windows/program-files' } });
  });

  test.each(['null', 'false', '42', '"custom"', '[]', '{malformed'])('does not fall back after scalar or malformed host configuration %s', async value => {
    files.set(path.join(home, '.claude.json'), value);
    await expectUnchanged();
  });

  test.each([
    { mcpServers: 42 },
    { permissions: 0 },
    { projects: { [cwd]: { disabledMcpjsonServers: 1 } } }
  ])('preserves malformed scalar values in relevant configuration keys: %j', async value => {
    config(path.join(home, '.claude.json'), value);
    await expectUnchanged();
  });

  test.each(['EACCES', 'EISDIR', 'EIO'])('does not fall back after unreadable host configuration: %s', async code => {
    files.set(path.join(home, '.claude.json'), Object.assign(new Error('Unreadable fixture'), { code }));
    await expectUnchanged();
  });

  test('leaves a custom Claude config directory to the host', async () => {
    files.set(path.join(home, '.config', 'claude'), Object.assign(new Error('Directory fixture'), { code: 'EISDIR' }));
    await expectUnchanged();
  });

  test.each([
    ['--mcp-config', '/custom/mcp.json'],
    ['--mcp-config={"mcpServers":{}}'],
    ['--strict-mcp-config'],
    ['--settings', '/custom/settings.json'],
    ['--settings={"permissions":{}}'],
    ['--setting-sources', 'user,project'],
    ['--tools', 'Read'],
    ['--disallowedTools', 'WebSearch'],
    ['--disallowed-tools=WebFetch'],
    ['--permission-mode', 'plan'],
    ['--allowedTools', 'WebSearch'], ['--allowedTools=Read,WebSearch'],
    ['--allowed-tools', 'WebSearch(domain:example.com)'],
    ['--allowedTools', 'Read', 'WebSearch', 'Bash'],
    ['--allowedTools', '*'], ['--allowedTools', 'Web*'],
    ['--plugin-dir', '/custom/plugin'], ['--agent', 'research'], ['--agents={"research":{}}'],
    ['--continue'], ['-c'], ['--resume', 'saved-session'], ['-r', 'saved-session'],
    ['--fork-session'], ['--help'], ['-h'], ['--version'], ['-v'],
    ['mcp', 'list'], ['auth', 'status'], ['config'], ['doctor'], ['install'], ['update'], ['setup-token']
  ].map(args => ({ args })))('preserves explicit Claude options or administrative commands $args', async ({ args }) => {
    await expectUnchanged({}, args);
    expect(readFile).not.toHaveBeenCalled();
  });

  test('consumes only the VibeKit opt-out before the argument delimiter', async () => {
    const args = ['--no-search', '-p', 'Explain --no-search', '--', '--no-search'];
    expect(await resolveClaudeSearchArgs(args, options())).toEqual(['-p', 'Explain --no-search', '--', '--no-search']);
    expect(args).toEqual(['--no-search', '-p', 'Explain --no-search', '--', '--no-search']);
    expect(readFile).not.toHaveBeenCalled();
  });

  test('keeps delimiter-protected prompt text unchanged', async () => {
    const args = ['--', '--no-search'];
    expect(await resolveClaudeSearchArgs(args, options())).toEqual(args);
  });

  test('keeps an explicit tool grant without adding further grants', async () => {
    const args = ['--allowedTools', 'mcp__parallel__web_search', ...originalArgs];
    const resolved = await resolveClaudeSearchArgs(args, options());
    expect(resolved.slice(0, -4)).toEqual(args);
    expect(resolved.filter(value => value === '--allowedTools')).toHaveLength(1);
  });

  test.each([
    { settings: { search: false } },
    { settings: { search: 'custom-provider' } },
    { settings: { search: null } },
    { env: { VIBEKIT_SEARCH: 'false' } },
    { env: { VIBEKIT_SEARCH: 'custom-provider' } },
    { env: { CLAUDE_CONFIG_DIR: '/custom/claude' } },
    { env: { VIBEKIT_SANDBOX_ACTIVE: '1' } },
    { env: { VIBEKIT_SANDBOX_IMAGE: 'custom-image' } },
    { env: { VIBEKIT_SANDBOX_FLAGS: '--network none' } },
    { env: { VIBEKIT_SANDBOX_EXEC_PROFILE: 'no-network' } },
    { env: { VIBEKIT_SANDBOX_EXEC_PROFILE_FILE: '/custom/profile' } },
    { env: { VIBEKIT_SANDBOX_EXEC_PROFILE_STRING: '(deny network*)' } },
    { env: { VIBEKIT_SANDBOX_EXEC_PARAMS: 'NETWORK=disabled' } },
    { settings: { sandbox: { sandboxExec: { profile: 'no-network' } } } },
    { sandboxOptions: { sandboxExec: { profile: 'no-network' } } }
  ])('preserves explicit VibeKit search settings and sandbox restrictions: %j', async overrides => {
    await expectUnchanged(overrides);
    expect(readFile).not.toHaveBeenCalled();
  });
});
