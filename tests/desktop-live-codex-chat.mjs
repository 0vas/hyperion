import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LIVE_CODEX_DISABLED_FEATURES,
  LiveCodexChat,
  LiveTurnStore,
  prepareLiveCodexHome,
} from '../desktop/live-codex-chat.mjs';
import {
  LiveCodexLauncherStore,
  resolveCodexExecutable,
  saveCodexExecutable,
} from '../desktop/codex-launcher.mjs';

function executable(
  directory,
  name = process.platform === 'win32' ? 'codex.exe' : 'codex',
) {
  const path = join(directory, name);
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o755);
  return path;
}

test('Codex launcher discovers a binary with a minimal Electron PATH', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-codex-launcher-'));
  try {
    const codex = executable(directory);
    const result = resolveCodexExecutable({
      userData: join(directory, 'user-data'),
      options: {
        env: { PATH: '/not-a-shell-path' },
        platform: 'darwin',
        extraCandidates: [codex],
      },
    });
    assert.deepEqual(result, {
      status: 'ready',
      executable: codex,
      source: 'discovered',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Codex launcher persists a valid explicit selection and fails closed when stale', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-codex-selection-'));
  try {
    const userData = join(directory, 'user-data');
    const store = new LiveCodexLauncherStore(userData);
    store.save('/missing/codex');
    assert.equal(
      resolveCodexExecutable({ userData, store }).status,
      'invalid-selection',
    );
    const codex = executable(directory);
    assert.deepEqual(
      saveCodexExecutable({ userData, executable: codex, store }),
      { saved: true, status: 'ready' },
    );
    assert.equal(resolveCodexExecutable({ userData, store }).executable, codex);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('missing Codex stays disconnected with setup guidance and never spawns', async () => {
  const events = [];
  let spawned = false;
  const chat = new LiveCodexChat({
    userData: '/private/user-data',
    directory: '/private/hyperion',
    url: 'http://127.0.0.1:4317',
    onEvent: (event) => events.push(event),
    onError: () => {},
    resolveExecutable: () => ({ status: 'missing', executable: null }),
    spawnImpl: () => {
      spawned = true;
      throw new Error('must not spawn');
    },
  });
  assert.deepEqual(await chat.connect('run-1'), {
    connected: false,
    setup: 'missing',
  });
  assert.equal(spawned, false);
  assert.match(events.at(-1)?.message || '', /install Codex locally/i);
  assert.doesNotMatch(events.at(-1)?.message || '', /ENOENT/i);
});

function chatWithWrites() {
  const writes = [];
  const chat = new LiveCodexChat({
    userData: '/private/user-data',
    directory: '/private/hyperion',
    url: 'http://127.0.0.1:4317',
    onEvent: () => {},
    onError: () => {},
  });
  chat.child = {
    stdin: {
      writable: true,
      write: (line) => writes.push(JSON.parse(line)),
    },
  };
  return { chat, writes };
}

test('live Desktop chat requires an explicit redacted provider approval', () => {
  const events = [];
  const { chat, writes } = chatWithWrites();
  chat.onEvent = (event) => events.push(event);
  chat.runId = 'run-1';
  chat.threadId = 'thread';
  chat.onMessage({
    jsonrpc: '2.0',
    id: 0,
    method: 'mcpServer/elicitation/request',
    params: {
      threadId: 'thread',
      serverName: 'hyperion',
      mode: 'form',
      message: 'sensitive command details must stay in main',
      requestedSchema: {},
    },
  });
  assert.deepEqual(writes, []);
  assert.equal(events[0]?.type, 'approval');
  assert.equal(events[0]?.label.includes('bounded Hyperion'), true);
  assert.equal(JSON.stringify(events[0]).includes('sensitive'), false);
  chat.approve('run-1', events[0].token, 'allow');
  assert.deepEqual(writes, [
    {
      jsonrpc: '2.0',
      id: 0,
      result: { action: 'accept' },
    },
  ]);
});

test('live Desktop chat declines any non-Hyperion MCP elicitation', () => {
  const { chat, writes } = chatWithWrites();
  chat.onMessage({
    jsonrpc: '2.0',
    id: 'other-server',
    method: 'mcpServer/elicitation/request',
    params: { serverName: 'untrusted-server' },
  });
  assert.deepEqual(writes, [
    {
      jsonrpc: '2.0',
      id: 'other-server',
      result: { action: 'decline' },
    },
  ]);
});

test('the private live-Codex profile removes generic local tools before a turn starts', () => {
  const sourceHome = mkdtempSync(join(tmpdir(), 'hyperion-codex-auth-'));
  const userData = mkdtempSync(join(tmpdir(), 'hyperion-live-profile-'));
  const previous = process.env.CODEX_HOME;
  try {
    writeFileSync(join(sourceHome, 'auth.json'), '{}');
    process.env.CODEX_HOME = sourceHome;
    const { home } = prepareLiveCodexHome({
      userData,
      directory: '/private/hyperion',
      url: 'http://127.0.0.1:4317',
    });
    const config = readFileSync(join(home, 'config.toml'), 'utf8');
    assert.match(config, /^web_search = "disabled"$/m);
    for (const feature of LIVE_CODEX_DISABLED_FEATURES)
      assert.match(config, new RegExp(`^${feature} = false$`, 'm'));
    assert.match(config, /^\[mcp_servers\.hyperion\]$/m);
    assert.equal(config.includes('[mcp_servers.'), true);
    assert.equal(config.match(/^\[mcp_servers\.[^\].]+\]$/gm)?.length, 1);
  } finally {
    if (previous === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previous;
    rmSync(sourceHome, { recursive: true, force: true });
    rmSync(userData, { recursive: true, force: true });
  }
});

test('live Desktop chat denies shell, file and permission escalation requests', () => {
  const { chat, writes } = chatWithWrites();
  for (const method of [
    'item/commandExecution/requestApproval',
    'item/fileChange/requestApproval',
  ])
    chat.onMessage({ jsonrpc: '2.0', id: method, method, params: {} });
  chat.onMessage({
    jsonrpc: '2.0',
    id: 'permissions',
    method: 'item/permissions/requestApproval',
    params: {},
  });
  chat.onMessage({
    jsonrpc: '2.0',
    id: 'legacy-shell',
    method: 'execCommandApproval',
    params: {},
  });
  assert.deepEqual(writes, [
    {
      jsonrpc: '2.0',
      id: 'item/commandExecution/requestApproval',
      result: { decision: 'decline' },
    },
    {
      jsonrpc: '2.0',
      id: 'item/fileChange/requestApproval',
      result: { decision: 'decline' },
    },
    { jsonrpc: '2.0', id: 'permissions', result: { permissions: {} } },
    {
      jsonrpc: '2.0',
      id: 'legacy-shell',
      result: {
        decision: {
          denied: {
            rejection:
              'Hyperion Desktop live chat permits only its authenticated MCP surface.',
          },
        },
      },
    },
  ]);
});

test('an unsettled persisted turn blocks reconnect and fresh send until resolved', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'hyperion-live-turn-'));
  try {
    const store = new LiveTurnStore(userData);
    store.markUnsettled('run-1', 'thread-1', 'turn-1');
    const afterRestart = new LiveTurnStore(userData);
    const events = [];
    let spawned = false;
    const chat = new LiveCodexChat({
      userData,
      directory: '/private/hyperion',
      url: 'http://127.0.0.1:4317',
      onEvent: (event) => events.push(event),
      onError: () => {},
      turnStore: afterRestart,
      spawnImpl: () => {
        spawned = true;
        throw new Error('must not spawn');
      },
    });
    assert.deepEqual(await chat.connect('run-1'), {
      connected: false,
      uncertain: true,
    });
    assert.equal(spawned, false);
    assert.equal(events[0]?.type, 'uncertain');
    chat.resolveUncertain('run-1');
    assert.equal(afterRestart.get('run-1'), null);

    afterRestart.markUnsettled('run-1', 'thread-1', 'turn-1');
    chat.runId = 'run-1';
    chat.threadId = 'thread-1';
    chat.onMessage({
      method: 'turn/completed',
      params: {
        threadId: 'thread-1',
        turn: { id: 'turn-1', status: 'interrupted' },
      },
    });
    assert.equal(afterRestart.get('run-1'), null);
  } finally {
    rmSync(userData, { recursive: true, force: true });
  }
});

test('a corrupt persisted turn store fails closed for every run until resolved', async () => {
  const userData = mkdtempSync(join(tmpdir(), 'hyperion-live-corrupt-turn-'));
  try {
    writeFileSync(join(userData, 'live-codex-turns.json'), '{not-json');
    const store = new LiveTurnStore(userData);
    assert.equal(store.get('any-run')?.status, 'uncertain');
    const events = [];
    const chat = new LiveCodexChat({
      userData,
      directory: '/private/hyperion',
      url: 'http://127.0.0.1:4317',
      onEvent: (event) => events.push(event),
      onError: () => {},
      turnStore: store,
      spawnImpl: () => {
        throw new Error('must not spawn');
      },
    });
    assert.deepEqual(await chat.connect('a-different-run'), {
      connected: false,
      uncertain: true,
    });
    assert.equal(events[0]?.type, 'uncertain');
    chat.resolveUncertain('a-different-run');
    assert.equal(store.get('a-different-run'), null);
  } finally {
    rmSync(userData, { recursive: true, force: true });
  }
});
