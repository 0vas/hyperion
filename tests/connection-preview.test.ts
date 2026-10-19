import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  inspectDesktopClient,
  sanitizeConnectionEntry,
} from '../src/adapters/connection-status.js';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';

const secret = 'SYNTHETIC_CREDENTIAL_DO_NOT_DISPLAY';
const launcher =
  '/synthetic/Hyperion Preview.app/dist/adapters/mcp-launcher.js';
const privateUrl = `https://synthetic-user:${secret}@127.0.0.1:4317/private/${secret}?api_key=${secret}#${secret}`;

for (const args of [
  ['--token', secret],
  [`--api-key=${secret}`],
  ['--password', `/synthetic/${secret}`],
  ['--client-secret', '--url', `https://${secret}.invalid`],
  ['--authorization', `Bearer ${secret}`],
  [`--authorization=Basic ${secret}`],
  ['-H', `Authorization: Bearer ${secret}`],
  [`--header=X-API-Key: ${secret}`],
  ['--header', 'Authorization:', 'Bearer', secret],
  ['--user', `synthetic-user:${secret}`],
  [`-u${secret}`],
  ['--cookie', `session=${secret}`],
  ['-c', `echo ${secret}`],
  ['--unknown-option', secret, '/synthetic/safe-looking-tail.js'],
  ['--url', `https://[broken/${secret}`],
  ['--url', `https://127.0.0.1\\@${secret}.invalid`],
  [`//synthetic.invalid/${secret}`],
  [false, secret],
]) {
  test(`preview withholds unsupported or ambiguous arguments: ${String(args[0]).split('=')[0]}`, () => {
    const raw = { command: '/synthetic/node', args: [launcher, ...args] };
    const before = structuredClone(raw);
    const preview = sanitizeConnectionEntry(raw);
    assert.ok(!JSON.stringify(preview).includes(secret));
    assert.equal(preview.args?.[0], launcher);
    assert.deepEqual(preview.args?.slice(1), ['••••']);
    assert.deepEqual(raw, before, 'preview must not change configuration');
  });
}

test('preview reduces HTTP(S) URLs to origins everywhere before truncation', () => {
  assert.equal(
    sanitizeConnectionEntry({ url: privateUrl }).url,
    'https://127.0.0.1:4317',
  );
  const preview = sanitizeConnectionEntry({
    url: privateUrl,
    args: [
      launcher,
      privateUrl,
      `--url=${privateUrl}`,
      '--endpoint',
      privateUrl,
    ],
    env: { HYPERION_URL: privateUrl },
  });
  assert.ok(!JSON.stringify(preview).includes(secret));
  assert.ok(!JSON.stringify(preview).includes('synthetic-user'));
  assert.equal(preview.url, 'https://127.0.0.1:4317');
  assert.equal(preview.envPreview?.HYPERION_URL, 'https://127.0.0.1:4317');
  assert.deepEqual(preview.args, [
    launcher,
    'https://127.0.0.1:4317',
    '--url=https://127.0.0.1:4317',
    '--endpoint',
    'https://127.0.0.1:4317',
  ]);
});

test('preview fails closed for malformed URLs and embedded command text', () => {
  for (const value of [
    `https://[broken/${secret}`,
    `https:${secret}`,
    `file:///synthetic/${secret}`,
    `https://127.0.0.1\\@${secret}.invalid`,
    `https://127.0.0.1\n${secret}`,
  ]) {
    const preview = sanitizeConnectionEntry({
      url: value,
      env: { HYPERION_URL: value },
    });
    assert.ok(!JSON.stringify(preview).includes(secret));
    assert.equal(preview.url, '••••');
  }
  const preview = sanitizeConnectionEntry({
    command: `node --token=${secret}`,
    cwd: `/synthetic?token=${secret}`,
    type: secret,
    owner: secret,
    skillPath: `https://invalid/${secret}`,
    env: {
      HYPERION_AGENT_ID: `Bearer ${secret}`,
      HYPERION_DATA_DIR: `token=${secret}`,
      ELECTRON_RUN_AS_NODE: secret,
    },
  });
  assert.ok(!JSON.stringify(preview).includes(secret));
});

test('preview keeps supported local metadata and omits non-allowlisted env values', () => {
  const raw = {
    command: '/synthetic/Hyperion Preview.app/Contents/MacOS/Hyperion',
    args: [
      launcher,
      '--agent',
      'codex',
      '--data-dir=/synthetic/data',
      '--url',
      'http://[::1]:4317',
      '--stdio',
    ],
    cwd: '/synthetic/workspace',
    type: 'stdio',
    skillPath: '/synthetic/SKILL.md',
    owner: 'hyperion',
    env: {
      HYPERION_URL: 'http://127.0.0.1:4317',
      HYPERION_AGENT_ID: 'codex',
      HYPERION_DATA_DIR: '/synthetic/data',
      ELECTRON_RUN_AS_NODE: '1',
      API_TOKEN: secret,
      CUSTOM: secret,
    },
  };
  const preview = sanitizeConnectionEntry(raw);
  assert.deepEqual(preview.args, raw.args);
  assert.equal(preview.command, raw.command);
  assert.equal(preview.cwd, raw.cwd);
  assert.equal(preview.type, 'stdio');
  assert.equal(preview.skillPath, raw.skillPath);
  assert.equal(preview.owner, 'hyperion');
  assert.deepEqual(preview.envKeys, Object.keys(raw.env).sort());
  assert.deepEqual(preview.envPreview, {
    HYPERION_URL: 'http://127.0.0.1:4317',
    HYPERION_AGENT_ID: 'codex',
    HYPERION_DATA_DIR: '/synthetic/data',
    ELECTRON_RUN_AS_NODE: '1',
  });
  assert.ok(!JSON.stringify(preview).includes(secret));
  const windows = String.raw`C:\Program Files\Hyperion\mcp-launcher.js`;
  assert.deepEqual(
    sanitizeConnectionEntry({
      command: windows,
      args: [windows],
      cwd: String.raw`C:\synthetic\data`,
    }),
    {
      command: windows,
      args: [windows],
      cwd: String.raw`C:\synthetic\data`,
    },
  );
});

test('redaction precedes display truncation and inventory preserves conflicting source bytes', () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-preview-'));
  const file = join(home, '.cursor/mcp.json');
  mkdirSync(join(home, '.cursor'));
  const raw = JSON.stringify({
    mcpServers: {
      hyperion: {
        command: 'node',
        args: [launcher, '--token', `${secret}${'x'.repeat(200)}${secret}`],
        url: privateUrl,
        env: { HYPERION_URL: privateUrl, API_TOKEN: secret },
      },
      other: { command: 'untouched' },
    },
  });
  writeFileSync(file, raw);
  try {
    const row = inspectDesktopClient('cursor', {
      home,
      directory: join(home, 'data'),
      url: 'http://127.0.0.1:4317',
    });
    assert.equal(row.status, 'conflict');
    assert.ok(!JSON.stringify(row).includes(secret));
    assert.ok(row.expected?.command);
    assert.equal(readFileSync(file, 'utf8'), raw);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('authenticated inventory response contains only the projected preview', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-preview-http-'));
  const priorHome = process.env.HYPERION_HOME;
  const priorCodex = process.env.CODEX_HOME;
  const priorAppData = process.env.APPDATA;
  process.env.HYPERION_HOME = home;
  process.env.CODEX_HOME = join(home, '.codex');
  process.env.APPDATA = join(home, 'Roaming');
  const store = new Store(':memory:');
  const app = createApp({
    store,
    directory: join(home, 'data'),
    agentId: 'codex',
    agentToken: 'synthetic-agent',
    humanToken: 'synthetic-human',
  });
  const file = join(home, '.cursor/mcp.json');
  mkdirSync(join(home, '.cursor'));
  const raw = JSON.stringify({
    mcpServers: {
      hyperion: {
        command: 'node',
        args: [launcher, `--api-key=${secret}`],
        url: privateUrl,
        env: { HYPERION_URL: privateUrl, API_TOKEN: secret },
      },
    },
  });
  writeFileSync(file, raw);
  try {
    const url = await app.listen(0);
    const response = await fetch(`${url}/api/connections`, {
      headers: { authorization: 'Bearer synthetic-human' },
    });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(!body.includes(secret));
    const cursor = JSON.parse(body).integrations.find(
      (row: { id: string }) => row.id === 'cursor',
    );
    assert.equal(cursor.status, 'conflict');
    assert.equal(cursor.existing.url, 'https://127.0.0.1:4317');
    assert.equal(cursor.existing.args[0], launcher);
    assert.equal(readFileSync(file, 'utf8'), raw);
  } finally {
    await app.close();
    store.close();
    if (priorHome === undefined) delete process.env.HYPERION_HOME;
    else process.env.HYPERION_HOME = priorHome;
    if (priorCodex === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = priorCodex;
    if (priorAppData === undefined) delete process.env.APPDATA;
    else process.env.APPDATA = priorAppData;
    rmSync(home, { recursive: true, force: true });
  }
});
