import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import ClaudeAgent from '../../src/agents/claude.js';
import GeminiAgent from '../../src/agents/gemini.js';
import { resolveClaudeSearchArgs } from '../../src/utils/claude-search.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(async () => { throw Object.assign(new Error('No saved configuration'), { code: 'ENOENT' }); })
}));
vi.mock('../../src/utils/claude-search.js', async importOriginal => {
  const original = await importOriginal();
  return { ...original, resolveClaudeSearchArgs: vi.fn(original.resolveClaudeSearchArgs) };
});
vi.mock('../../src/components/status-display.js', () => ({ default: () => null }));
vi.mock('ink', () => ({ render: vi.fn(), Static: () => null }));
vi.mock('../../src/analytics/analytics.js', () => ({ default: class Analytics {} }));
vi.mock('../../src/sandbox/sandbox-engine.js', () => ({
  default: class SandboxEngine {
    executeWithSandbox = vi.fn().mockResolvedValue(null);
  }
}));
vi.mock('../../src/sandbox/sandbox-config.js', () => ({ default: {} }));

const logger = { log: vi.fn().mockResolvedValue(undefined) };
const args = ['-p', 'Find current release documentation'];

function agent(Agent = ClaudeAgent, options = {}) {
  const instance = new Agent(logger, options);
  vi.spyOn(instance, 'showStatusDisplay').mockResolvedValue(undefined);
  vi.spyOn(instance, 'createChildProcess').mockResolvedValue({ code: 0 });
  vi.spyOn(instance, 'runWithAnalytics').mockImplementation(async (_command, _args, execute) => execute());
  return instance;
}

function expectParallelArgs(resolved) {
  expect(resolved[0]).toBe('--mcp-config');
  expect(JSON.parse(resolved[1]).mcpServers.parallel.url).toBe('https://search.parallel.ai/mcp');
  expect(resolved.slice(2, 4)).toEqual(['--disallowedTools', 'WebSearch']);
  expect(resolved.slice(4)).toEqual(args);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  for (const key of Object.keys(process.env)) {
    if (/^VIBEKIT_(SEARCH|SANDBOX)/.test(key) || key === 'CLAUDE_CONFIG_DIR') vi.stubEnv(key, undefined);
  }
});

afterEach(() => vi.unstubAllEnvs());

describe('Claude launch path', () => {
  test('resolves once and forwards the same configuration to the sandbox attempt and direct fallback', async () => {
    const instance = agent();
    const original = [...args];
    await instance.run(original);
    expect(resolveClaudeSearchArgs).toHaveBeenCalledTimes(1);
    expect(resolveClaudeSearchArgs).toHaveBeenCalledWith(original, { settings: {}, sandboxOptions: {} });
    const sandboxArgs = instance.sandboxEngine.executeWithSandbox.mock.calls[0][1];
    expectParallelArgs(sandboxArgs);
    expect(instance.createChildProcess).toHaveBeenCalledWith('claude', sandboxArgs);
    expect(instance.createChildProcess.mock.calls[0][1]).toBe(sandboxArgs);
    expect(original).toEqual(args);
  });

  test('uses the resolved arguments through a successful sandbox launch', async () => {
    const instance = agent();
    instance.sandboxEngine.executeWithSandbox.mockResolvedValue({ code: 0, sandbox: true });
    const result = await instance.run(args);
    expect(result).toEqual({ code: 0, sandbox: true });
    expect(resolveClaudeSearchArgs).toHaveBeenCalledTimes(1);
    expectParallelArgs(instance.sandboxEngine.executeWithSandbox.mock.calls[0][1]);
    expect(instance.createChildProcess).not.toHaveBeenCalled();
  });

  test('does not add another server when already inside a sandbox', async () => {
    vi.stubEnv('VIBEKIT_SANDBOX_ACTIVE', '1');
    const instance = agent();
    await instance.run(args);
    expect(resolveClaudeSearchArgs).toHaveBeenCalledTimes(1);
    expect(instance.sandboxEngine.executeWithSandbox).not.toHaveBeenCalled();
    expect(instance.createChildProcess).toHaveBeenCalledWith('claude', args);
  });

  test('passes saved settings and sandbox restrictions into the resolver', async () => {
    const settings = { search: false };
    const sandboxOptions = { sandboxExec: { profile: 'no-network' } };
    const instance = agent(ClaudeAgent, { settings, sandboxOptions });
    await instance.run(args);
    expect(resolveClaudeSearchArgs).toHaveBeenCalledWith(args, { settings, sandboxOptions });
    expect(instance.createChildProcess).toHaveBeenCalledWith('claude', args);
  });

  test('leaves other agents and their original arguments unchanged', async () => {
    const instance = agent(GeminiAgent);
    await instance.run(args);
    expect(resolveClaudeSearchArgs).not.toHaveBeenCalled();
    expect(instance.sandboxEngine.executeWithSandbox.mock.calls[0][1]).toBe(args);
    expect(instance.createChildProcess).toHaveBeenCalledWith('gemini', args);
  });
});
