import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ClaudeAuthHelper } from '../../src/auth/claude-auth-helper.js';

const exec = promisify(execFile);

describe('Claude OAuth wrapper argv', () => {
  it('keeps inline MCP JSON and shell characters as literal arguments', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'vibekit-argv-'));
    try {
      await mkdir(path.join(dir, 'bin'));
      await writeFile(path.join(dir, 'bin', 'claude'),
        '#!/usr/bin/env node\nrequire("fs").writeFileSync(process.env.ARGV_OUTPUT, JSON.stringify(process.argv.slice(2)));\n',
        { mode: 0o755 });
      const args = ['--mcp-config', JSON.stringify({ mcpServers: {
        parallel: { type: 'http', url: 'https://search.parallel.ai/mcp' }
      } }), '-p', "Find Node's docs; $(touch injected) `touch injected` $TOKEN\nnext line", ''];
      const wrapper = ClaudeAuthHelper.createClaudeWrapper({ settings: { mcpServers: {} } }, args);
      const output = path.join(dir, 'argv.json');
      await exec(wrapper.command, wrapper.args, {
        cwd: dir,
        env: { ...process.env, HOME: dir, PATH: path.join(dir, 'bin') + path.delimiter + process.env.PATH, ARGV_OUTPUT: output }
      });
      expect(JSON.parse(await readFile(output, 'utf8'))).toEqual(args);
      await expect(readFile(path.join(dir, 'injected'))).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
