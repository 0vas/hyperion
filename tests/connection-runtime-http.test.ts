import assert from 'node:assert/strict';
import test from 'node:test';
import {
  promises as fs,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import {
  buildMcpServer,
  ownedMcpRuntimePaths,
} from '../src/adapters/connections.js';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';

test('human inventory reports owned-file failures without equating configuration with runtime', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-preflight-http-'));
  const directory = join(home, 'data');
  const saved = {
    HYPERION_HOME: process.env.HYPERION_HOME,
    CODEX_HOME: process.env.CODEX_HOME,
    APPDATA: process.env.APPDATA,
  };
  process.env.HYPERION_HOME = home;
  process.env.CODEX_HOME = join(home, '.codex');
  process.env.APPDATA = join(home, 'Roaming');
  const store = new Store(':memory:');
  const app = createApp({
    store,
    directory,
    agentId: 'codex',
    agentToken: 'a'.repeat(64),
    humanToken: 'h'.repeat(64),
  });
  const paths = ownedMcpRuntimePaths();
  const fixture = join(home, 'Program Files', 'Hyperion.exe');
  mkdirSync(join(home, 'Program Files'));
  writeFileSync(fixture, 'synthetic executable, never executed');
  const originalStat = fs.stat.bind(fs);
  const originalOpen = fs.open.bind(fs);
  const inspected: string[] = [];
  let launcherError = 'ENOENT';
  t.mock.method(fs, 'stat', async (path: string) => {
    inspected.push(path);
    assert.ok(
      path === paths.executable || path === paths.launcher,
      'only owned paths may be inspected',
    );
    if (path === paths.launcher)
      throw Object.assign(new Error('SYNTHETIC_PRIVATE_ERROR'), {
        code: launcherError,
      });
    return originalStat(fixture);
  });
  t.mock.method(fs, 'open', async (path: string, flags: string) => {
    assert.equal(path, paths.executable);
    assert.equal(flags, 'r');
    return originalOpen(fixture, flags);
  });
  try {
    const url = await app.listen(0);
    const headers = { authorization: 'Bearer ' + 'h'.repeat(64) };
    mkdirSync(join(home, '.cursor'));
    const { type: _type, ...entry } = buildMcpServer(
      'cursor',
      directory,
      true,
      url,
    );
    const configFile = join(home, '.cursor/mcp.json');
    writeFileSync(
      configFile,
      JSON.stringify({ mcpServers: { hyperion: entry } }),
    );
    mkdirSync(directory);
    const credentials = JSON.stringify({
      agentId: 'codex',
      agentToken: 'a'.repeat(64),
      humanToken: 'h'.repeat(64),
    });
    writeFileSync(join(directory, 'credentials.json'), credentials);
    const before = readFileSync(configFile, 'utf8');

    for (const method of ['GET', 'POST'] as const) {
      const target =
        url + '/api/connections' + (method === 'POST' ? '/setup' : '');
      for (const [authorization, status] of [
        [undefined, 401],
        ['Bearer ' + 'a'.repeat(64), 403],
      ] as const) {
        const response = await fetch(target, {
          method,
          headers: authorization ? { authorization } : {},
        });
        assert.equal(response.status, status);
        await response.text();
      }
    }
    for (const [name, value] of [
      ['origin', 'https://untrusted.invalid'],
      ['sec-fetch-site', 'cross-site'],
    ] as const) {
      const response = await fetch(url + '/api/connections', {
        headers: { ...headers, [name]: value },
      });
      assert.equal(response.status, 403);
      await response.text();
    }
    const deniedHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        const req = request(
          url + '/api/connections',
          { headers: { ...headers, host: 'untrusted.invalid' } },
          (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
          },
        );
        req.on('error', reject);
        req.end();
      },
    );
    assert.equal(deniedHost, 403);
    assert.deepEqual(
      inspected,
      [],
      'authorization and origin/host guards must precede preflight',
    );

    const response = await fetch(
      url + '/api/connections?launcher=/untrusted/path',
      { headers },
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const inventory = await response.json();
    assert.equal(
      inventory.integrations.find((row: { id: string }) => row.id === 'cursor')
        .status,
      'configured',
    );
    assert.ok(
      inventory.runtimePreflight,
      'inventory must distinguish owned-file checks from config equality',
    );
    const { checkedAt, ...preflight } = inventory.runtimePreflight;
    assert.equal(new Date(checkedAt).toISOString(), checkedAt);
    assert.deepEqual(preflight, {
      scope: 'expected_mcp_files',
      executable: { code: 'readable_file' },
      launcher: { code: 'missing' },
      mcpInitialization: 'not_checked',
      toolCall: 'not_checked',
      chatTools: 'unknown',
    });
    assert.equal(readFileSync(configFile, 'utf8'), before);
    assert.equal(
      readFileSync(join(directory, 'credentials.json'), 'utf8'),
      credentials,
    );
    assert.equal(existsSync(join(directory, 'connections')), false);

    launcherError = 'EIO';
    const repeated = await fetch(url + '/api/connections', { headers });
    assert.equal(repeated.status, 200);
    const text = await repeated.text();
    assert.equal(
      JSON.parse(text).runtimePreflight.launcher.code,
      'check_failed',
    );
    assert.ok(!text.includes('SYNTHETIC_PRIVATE_ERROR'));
    assert.ok(!text.includes('a'.repeat(64)) && !text.includes('h'.repeat(64)));
    assert.ok(
      !JSON.stringify(inventory.runtimePreflight).includes(paths.executable),
    );
    assert.ok(
      !JSON.stringify(inventory.runtimePreflight).includes(paths.launcher),
    );

    // Explicit setup still registers/exports. Its returned inventory uses the same safe schema.
    const setup = await fetch(url + '/api/connections/setup', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ client: 'cursor' }),
    });
    assert.equal(setup.status, 200);
    const configured = await setup.json();
    assert.equal(configured.ok, true);
    assert.deepEqual(
      { ...configured.inventory.runtimePreflight, checkedAt },
      {
        ...inventory.runtimePreflight,
        checkedAt,
        launcher: { code: 'check_failed' },
      },
    );
    assert.equal(
      existsSync(join(directory, 'connections/cursor.mcp.json')),
      true,
    );
    assert.ok(
      JSON.parse(readFileSync(join(directory, 'credentials.json'), 'utf8'))
        .agents.cursor,
    );
    assert.equal(readFileSync(configFile, 'utf8'), before);

    const marker = join(home, 'untrusted-command-was-executed');
    writeFileSync(
      configFile,
      JSON.stringify({
        mcpServers: {
          hyperion: {
            command: process.execPath,
            args: [
              '--input-type=module',
              '-e',
              `import {writeFileSync} from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'unexpected');`,
            ],
            cwd: home,
          },
        },
      }),
    );
    const untrustedBefore = readFileSync(configFile, 'utf8');
    const foreignResponse = await fetch(url + '/api/connections', { headers });
    const foreign = await foreignResponse.json();
    assert.equal(
      foreign.integrations.find((row: { id: string }) => row.id === 'cursor')
        .status,
      'conflict',
    );
    assert.equal(
      existsSync(marker),
      false,
      'stored commands must never execute during inspection',
    );
    assert.equal(readFileSync(configFile, 'utf8'), untrustedBefore);
    assert.ok(
      inspected.length > 0 &&
        inspected.every(
          (path) => path === paths.executable || path === paths.launcher,
        ),
    );
  } finally {
    await app.close();
    store.close();
    t.mock.restoreAll();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(home, { recursive: true, force: true });
  }
});
