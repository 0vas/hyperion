import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import {
  LiveHarnessLauncherStore,
  resolveHarnesses,
  resolveHarness,
} from '../desktop/harness-launcher.mjs';
import {
  LiveClaudeChat,
  prepareLiveClaudeConfig,
} from '../desktop/live-claude-chat.mjs';
import {
  LiveAcpChat,
  acpAdapterPath,
  acpLaunchSpec,
  safeFailure,
} from '../desktop/live-acp-chat.mjs';
import { LiveHarnessChat } from '../desktop/live-harness-chat.mjs';

function executable(directory, name) {
  const path = join(directory, name);
  writeFileSync(path, '#!/bin/sh\nexit 0\n');
  chmodSync(path, 0o755);
  return path;
}

test('the live-chat harness registry discovers all four providers from absolute paths', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-harnesses-'));
  try {
    const codex = executable(directory, 'codex');
    const claude = executable(directory, 'claude');
    const cursor = executable(directory, 'cursor-agent');
    const antigravity = executable(directory, 'agy');
    const harnesses = resolveHarnesses({
      userData: join(directory, 'user-data'),
      options: {
        env: { PATH: '/not-a-shell-path' },
        platform: 'darwin',
        extraCandidates: {
          codex: [codex],
          claude: [claude],
          cursor: [cursor],
          antigravity: [antigravity],
        },
      },
    });
    assert.deepEqual(
      harnesses.map(({ id, status, executable: path }) => ({
        id,
        status,
        executable: path,
      })),
      [
        { id: 'codex', status: 'ready', executable: codex },
        { id: 'claude', status: 'ready', executable: claude },
        { id: 'cursor', status: 'ready', executable: cursor },
        { id: 'antigravity', status: 'ready', executable: antigravity },
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('Antigravity is discovered in its vendor CLI directory without shell PATH', () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-agy-'));
  try {
    mkdirSync(join(home, '.gemini/bin'), { recursive: true });
    const agy = executable(join(home, '.gemini/bin'), 'agy');
    const result = resolveHarness('antigravity', {
      userData: home,
      options: { home, env: { PATH: '' }, platform: 'darwin' },
    });
    assert.equal(result.executable, agy);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function fakeAcpProcess({
  silent = false,
  waitForPermissionOnCancel = false,
} = {}) {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = () => {
    child.stdin.end();
    child.stdout.end();
    child.stderr.end();
  };
  const requests = [];
  let prompt;
  let cancellationRequested = false;
  const reply = (id, result) =>
    child.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  let buffer = '';
  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n');
      const request = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      requests.push(request);
      if (silent) continue;
      if (request.method === 'initialize')
        reply(request.id, {
          protocolVersion: 1,
          agentCapabilities: {},
          authMethods: [{ id: 'cursor_login', name: 'Cursor' }],
        });
      if (request.method === 'authenticate') reply(request.id, {});
      if (request.method === 'session/new')
        reply(request.id, { sessionId: 'native-session' });
      if (request.method === 'session/prompt') {
        prompt = request;
        child.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/request_permission',
            id: 900,
            params: {
              sessionId: 'native-session',
              toolCall: {
                toolCallId: 'read-1',
                title: 'Read isolated test workflow',
              },
              options: [
                { kind: 'allow_once', optionId: 'once', name: 'Allow once' },
              ],
            },
          }) + '\n',
        );
      }
      if (request.id === 900 && request.result) {
        if (request.result.outcome.outcome === 'cancelled') {
          if (cancellationRequested || !waitForPermissionOnCancel)
            reply(prompt.id, { stopReason: 'cancelled' });
          continue;
        }
        child.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/update',
            params: {
              sessionId: 'native-session',
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: 'Verified wire response' },
              },
            },
          }) + '\n',
        );
        reply(prompt.id, { stopReason: 'end_turn' });
      }
      if (request.method === 'session/cancel') {
        cancellationRequested = true;
        if (!waitForPermissionOnCancel)
          reply(prompt.id, { stopReason: 'cancelled' });
      }
    }
  });
  return { child, requests };
}

async function until(check) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.ok(check(), 'Expected ACP event');
}

for (const harness of ['codex', 'claude', 'cursor', 'antigravity']) {
  test(`${harness} receives the shared entry prompt once and can request consent without a selected run`, async () => {
    const home = mkdtempSync(join(tmpdir(), 'hyperion-entry-'));
    const wire = fakeAcpProcess();
    const events = [];
    const chat = new LiveAcpChat({
      harness,
      userData: home,
      directory: home,
      url: 'http://127.0.0.1:4317',
      resolveExecutable: () => ({ executable: '/private/test-cli' }),
      spawnImpl: () => wire.child,
      onEvent: (event) => events.push(event),
    });
    try {
      assert.equal((await chat.connect(null)).connected, true);
      assert.equal(
        wire.requests.filter((r) => r.method === 'session/prompt').length,
        0,
        'no synthetic startup turn',
      );
      for (let turn = 0; turn < 2; turn++) {
        const message = turn
          ? 'Lee el estado actualizado'
          : 'Crea un flujo para mi nueva actividad';
        await chat.send(null, message);
        await until(
          () =>
            wire.requests.filter((r) => r.method === 'session/prompt')
              .length ===
            turn + 1,
        );
        const blocks = wire.requests
          .filter((r) => r.method === 'session/prompt')
          .at(-1).params.prompt;
        assert.equal(blocks.length, turn ? 2 : 3);
        if (!turn) {
          assert.match(blocks[0].text, /Hyperion.*collaborator/);
          for (const rule of [
            'language',
            'hyperion_active',
            'parentRunId',
            'commandId',
            'expectedRevision',
            'canvas',
            'private chain-of-thought',
            'sandbox',
          ])
            assert.ok(blocks[0].text.includes(rule), rule);
        }
        assert.match(blocks.at(-2).text, /"selectedRunId":null/);
        assert.equal(blocks.at(-1).text, message);
        assert.ok(
          blocks.every((block) => block.type === 'text' && !('role' in block)),
        );
        await until(() => chat.pendingApprovals.size === 1);
        chat.approve(null, [...chat.pendingApprovals.keys()][0], 'allow');
        await until(() => chat.turnId === null);
      }
      assert.equal(
        events.filter((event) => event.type === 'user-message').length,
        2,
      );
      assert.ok(
        events
          .filter((event) => event.threadId)
          .every((event) => event.runId === null),
      );
    } finally {
      chat.dispose();
      rmSync(home, { recursive: true, force: true });
    }
  });
}

test('changing workflow selection replaces an idle session including null and rejects active retargeting', async () => {
  const made = [];
  const chat = new LiveHarnessChat({
    userData: '/unused',
    store: { getSelected: () => 'codex' },
    resolveHarnesses: () => [],
    factories: {
      codex: () => {
        const session = {
          runId: null,
          turnId: null,
          connecting: false,
          disposed: false,
          async connect(runId) {
            this.runId = runId;
            return { connected: true };
          },
          dispose() {
            this.disposed = true;
          },
        };
        made.push(session);
        return session;
      },
    },
  });
  await chat.connect(null);
  await chat.connect('11111111-1111-4111-8111-111111111111');
  assert.equal(made.length, 2);
  assert.equal(made[0].disposed, true);
  made[1].turnId = 'active';
  assert.throws(() => chat.connect(null), /turn|connection/);
  assert.equal(made[1].disposed, false);
  made[1].turnId = null;
  await chat.connect(null);
  assert.equal(made.length, 3);
  assert.equal(made[1].disposed, true);
});

test('a fresh session replays entry instructions, clears old context and cancels no-run permissions', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-reconnect-entry-'));
  const wires = [];
  const events = [];
  const runId = '22222222-2222-4222-8222-222222222222';
  const chat = new LiveAcpChat({
    harness: 'codex',
    userData: home,
    directory: home,
    url: 'http://127.0.0.1:4317',
    resolveExecutable: () => ({ executable: '/private/test-cli' }),
    spawnImpl: () => {
      const wire = fakeAcpProcess({ waitForPermissionOnCancel: true });
      wires.push(wire);
      return wire.child;
    },
    onEvent: (event) => events.push(event),
  });
  try {
    await chat.connect(runId);
    await chat.send(runId, 'Read the selected workflow');
    await until(() => chat.pendingApprovals.size === 1);
    await assert.rejects(chat.connect(null), /Close the current/);
    await assert.rejects(chat.send(null, 'Do not retarget'), /selection/);
    chat.approve(runId, [...chat.pendingApprovals.keys()][0], 'allow');
    await until(() => chat.turnId === null);
    chat.dispose();
    await chat.connect(null);
    await chat.send(null, 'Create another workflow');
    await until(() => chat.pendingApprovals.size === 1);
    const token = [...chat.pendingApprovals.keys()][0];
    const blocks = wires[1].requests.find((r) => r.method === 'session/prompt')
      .params.prompt;
    assert.equal(blocks.length, 3);
    assert.ok(!JSON.stringify(blocks).includes(runId));
    await chat.stop(null);
    await until(() => chat.turnId === null);
    assert.equal(chat.pendingApprovals.size, 0);
    assert.throws(
      () => chat.approve(null, token, 'allow'),
      /no longer pending/,
    );
    assert.ok(
      events.some(
        (event) =>
          event.type === 'approval-resolved' &&
          event.runId === null &&
          event.decision === 'cancelled',
      ),
    );
  } finally {
    chat.dispose();
    rmSync(home, { recursive: true, force: true });
  }
});

for (const harness of ['codex', 'claude', 'cursor', 'antigravity']) {
  test(`${harness} uses a real ACP wire contract for MCP, streaming and explicit consent`, async () => {
    const home = mkdtempSync(join(tmpdir(), 'hyperion-wire-'));
    const wire = fakeAcpProcess();
    const events = [];
    const chat = new LiveAcpChat({
      harness,
      userData: home,
      directory: home,
      url: 'http://127.0.0.1:4317',
      resolveExecutable: () => ({ executable: '/private/test-cli' }),
      spawnImpl: () => wire.child,
      onEvent: (event) => events.push(event),
    });
    try {
      assert.equal(
        (await chat.connect('11111111-1111-4111-8111-111111111111')).connected,
        true,
      );
      assert.equal(
        wire.requests.find((r) => r.method === 'session/new').params
          .mcpServers[0].name,
        'hyperion_active',
      );
      await chat.send(
        '11111111-1111-4111-8111-111111111111',
        'Read my isolated test workflow',
      );
      await until(() => events.some((e) => e.type === 'approval'));
      assert.equal(
        wire.requests.some((r) => r.id === 900),
        false,
      );
      chat.approve(
        '11111111-1111-4111-8111-111111111111',
        events.find((e) => e.type === 'approval').token,
        'allow',
      );
      await until(() =>
        events.some((e) => e.type === 'turn' && e.status === 'completed'),
      );
      assert.equal(
        events.find((e) => e.type === 'assistant-delta').text,
        'Verified wire response',
      );
      assert.equal(
        wire.requests.find((r) => r.id === 900).result.outcome.optionId,
        'once',
      );
    } finally {
      chat.dispose();
      rmSync(home, { recursive: true, force: true });
    }
  });
}

test('an unresponsive native ACP executable times out and releases its process', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-timeout-'));
  const { child } = fakeAcpProcess({ silent: true });
  const chat = new LiveAcpChat({
    harness: 'antigravity',
    userData: home,
    directory: home,
    url: 'http://127.0.0.1:4317',
    resolveExecutable: () => ({ executable: '/private/test-cli' }),
    spawnImpl: () => child,
    onEvent() {},
    connectionTimeoutMs: 20,
  });
  try {
    assert.equal(
      (await chat.connect('11111111-1111-4111-8111-111111111111')).connected,
      false,
    );
    assert.equal(chat.child, null);
    assert.equal(chat.connecting, false);
  } finally {
    chat.dispose();
    rmSync(home, { recursive: true, force: true });
  }
});

test('native ACP providers use the selected executable without a sidecar or shell', () => {
  const selected = resolve(tmpdir(), 'provider with spaces', 'selected-cli');
  for (const harness of ['cursor', 'antigravity']) {
    const spec = acpLaunchSpec(harness, selected, {
      PATH: dirname(process.execPath),
      ELECTRON_RUN_AS_NODE: '1',
    });
    assert.equal(spec.command, selected);
    assert.deepEqual(spec.args, ['acp']);
    assert.equal(spec.env.ELECTRON_RUN_AS_NODE, undefined);
    assert.equal(spec.env.PATH.split(delimiter)[0], dirname(selected));
    assert.ok(
      !spec.args.some((arg) => /force|yolo|skip-permissions/.test(arg)),
    );
  }
  assert.equal(
    acpLaunchSpec('claude', '/private/claude').env.CLAUDE_CODE_EXECUTABLE,
    '/private/claude',
  );
  assert.equal(
    acpLaunchSpec('codex', '/private/codex').env.CODEX_PATH,
    '/private/codex',
  );
});

test('a one-time permission never selects allow-always implicitly', async () => {
  const chat = new LiveAcpChat({ harness: 'cursor', onEvent() {} });
  chat.runId = '11111111-1111-4111-8111-111111111111';
  chat.threadId = 'thread';
  chat.turnId = 'turn';
  const result = chat.requestPermission({
    sessionId: 'thread',
    options: [
      { kind: 'allow_always', optionId: 'always' },
      { kind: 'allow_once', optionId: 'once' },
    ],
  });
  const token = [...chat.pendingApprovals.keys()][0];
  chat.approve('11111111-1111-4111-8111-111111111111', token, 'allow');
  assert.equal((await result).outcome.optionId, 'once');
});

test('stop settles permissions over ACP before a provider can complete cancellation', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-stop-permission-'));
  const wire = fakeAcpProcess({ waitForPermissionOnCancel: true });
  const events = [];
  const chat = new LiveAcpChat({
    harness: 'cursor',
    userData: home,
    directory: home,
    url: 'http://127.0.0.1:4317',
    resolveExecutable: () => ({ executable: '/private/test-cli' }),
    spawnImpl: () => wire.child,
    onEvent: (event) => events.push(event),
  });
  try {
    assert.equal(
      (await chat.connect('11111111-1111-4111-8111-111111111111')).connected,
      true,
    );
    await chat.send(
      '11111111-1111-4111-8111-111111111111',
      'Inspect the workflow',
    );
    await until(() => events.some((event) => event.type === 'approval'));
    const token = events.find((event) => event.type === 'approval').token;
    await chat.stop('11111111-1111-4111-8111-111111111111');
    await until(() =>
      events.some(
        (event) => event.type === 'turn' && event.status === 'interrupted',
      ),
    );
    assert.equal(chat.turnId, null);
    assert.equal(chat.pendingApprovals.size, 0);
    assert.deepEqual(
      wire.requests.find((request) => request.id === 900).result,
      {
        outcome: { outcome: 'cancelled' },
      },
    );
    assert.equal(
      events.find((event) => event.type === 'approval-resolved').decision,
      'cancelled',
    );
    assert.throws(
      () =>
        chat.approve('11111111-1111-4111-8111-111111111111', token, 'allow'),
      /no longer pending/,
    );
  } finally {
    chat.dispose();
    rmSync(home, { recursive: true, force: true });
  }
});

function activePermissionChat() {
  const events = [];
  const chat = new LiveAcpChat({
    harness: 'cursor',
    onEvent: (event) => events.push(event),
  });
  chat.runId = '11111111-1111-4111-8111-111111111111';
  chat.threadId = 'thread';
  chat.turnId = 'turn';
  chat.agent = { notify: async () => {} };
  const params = {
    sessionId: 'thread',
    options: [{ kind: 'allow_once', optionId: 'once' }],
  };
  return { chat, events, params };
}

for (const status of ['completed', 'interrupted', 'failed']) {
  test(`a ${status} turn settles permissions and rejects its old token in a new turn`, async () => {
    const { chat, events, params } = activePermissionChat();
    const result = chat.requestPermission(params);
    const token = [...chat.pendingApprovals.keys()][0];
    chat.finish(status);
    assert.equal(chat.pendingApprovals.size, 0);
    assert.deepEqual(await result, { outcome: { outcome: 'cancelled' } });
    assert.equal(
      events.find((event) => event.type === 'approval-resolved').decision,
      'cancelled',
    );
    chat.turnId = 'next-turn';
    assert.throws(
      () =>
        chat.approve('11111111-1111-4111-8111-111111111111', token, 'allow'),
      /no longer pending/,
    );
  });
}

test('permissions received while stopping, idle or for another session are cancelled immediately', async () => {
  const { chat, events, params } = activePermissionChat();
  await chat.stop('11111111-1111-4111-8111-111111111111');
  const stopping = chat.requestPermission(params);
  assert.equal(chat.pendingApprovals.size, 0);
  assert.deepEqual(await stopping, { outcome: { outcome: 'cancelled' } });
  chat.finish('interrupted');
  const idle = chat.requestPermission(params);
  assert.equal(chat.pendingApprovals.size, 0);
  assert.deepEqual(await idle, { outcome: { outcome: 'cancelled' } });
  chat.turnId = 'next-turn';
  const foreign = chat.requestPermission({
    ...params,
    sessionId: 'old-session',
  });
  assert.equal(chat.pendingApprovals.size, 0);
  assert.deepEqual(await foreign, { outcome: { outcome: 'cancelled' } });
  assert.equal(events.filter((event) => event.type === 'approval').length, 0);
});

test('provider cancellation invalidates a permission before a late human click', async () => {
  const { chat, events, params } = activePermissionChat();
  const abort = new AbortController();
  const result = chat.requestPermission(params, abort.signal);
  const token = [...chat.pendingApprovals.keys()][0];
  abort.abort();
  assert.equal(chat.pendingApprovals.size, 0);
  assert.deepEqual(await result, { outcome: { outcome: 'cancelled' } });
  assert.equal(events.at(-1).decision, 'cancelled');
  assert.throws(
    () => chat.approve('11111111-1111-4111-8111-111111111111', token, 'allow'),
    /no longer pending/,
  );
});

test('an allow click without allow_once reports cancellation, never approval', async () => {
  const { chat, events, params } = activePermissionChat();
  const result = chat.requestPermission({
    ...params,
    options: [{ kind: 'allow_always', optionId: 'always' }],
  });
  const token = [...chat.pendingApprovals.keys()][0];
  chat.approve('11111111-1111-4111-8111-111111111111', token, 'allow');
  assert.deepEqual(await result, { outcome: { outcome: 'cancelled' } });
  assert.equal(events.at(-1).decision, 'cancelled');
});

test('permission decisions cannot be applied to a changed session or turn', async () => {
  for (const field of ['threadId', 'turnId']) {
    const { chat, params } = activePermissionChat();
    const result = chat.requestPermission(params);
    const token = [...chat.pendingApprovals.keys()][0];
    chat[field] = 'different';
    assert.throws(
      () =>
        chat.approve('11111111-1111-4111-8111-111111111111', token, 'allow'),
      /no longer pending/,
    );
    assert.deepEqual(await result, { outcome: { outcome: 'cancelled' } });
  }
});

test('the selected harness is persisted independently from its executable path', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-harness-selection-'));
  try {
    const store = new LiveHarnessLauncherStore(join(directory, 'user-data'));
    assert.equal(store.getSelected(), null);
    store.select('claude');
    assert.equal(store.getSelected(), 'claude');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the Desktop ships ACP sidecars and redacts local authentication failures', () => {
  assert.ok(
    acpAdapterPath('codex').endsWith(join('codex-acp', 'dist', 'index.js')),
  );
  assert.ok(
    acpAdapterPath('claude').endsWith(
      join('claude-agent-acp', 'dist', 'index.js'),
    ),
  );
  assert.equal(
    safeFailure('claude', new Error('OAuth session expired')),
    'Claude Code needs a valid local sign-in before Hyperion can start a session.',
  );
});

test('Claude Code runs through a private MCP config with built-in tools denied', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-live-claude-'));
  try {
    const profile = prepareLiveClaudeConfig({
      userData: directory,
      directory: '/private/hyperion',
      url: 'http://127.0.0.1:4317',
    });
    const config = JSON.parse(readFileSync(profile.configPath, 'utf8'));
    assert.deepEqual(Object.keys(config.mcpServers), ['hyperion']);
    assert.equal(config.mcpServers.hyperion.env.HYPERION_AGENT_ID, 'claude');

    const events = [];
    let spawned;
    const chat = new LiveClaudeChat({
      userData: directory,
      directory: '/private/hyperion',
      url: 'http://127.0.0.1:4317',
      onEvent: (event) => events.push(event),
      onError: () => {},
      resolveExecutable: () => ({
        status: 'ready',
        executable: '/private/claude',
      }),
      spawnImpl: (executablePath, args, options) => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.stdin = { writable: true };
        spawned = { executablePath, args, options, child };
        return child;
      },
    });

    await chat.connect('run-1');
    await chat.send('run-1', 'Genera un flujo seguro.');
    assert.equal(spawned.executablePath, '/private/claude');
    assert.equal(spawned.args.includes('--restricted'), true);
    assert.equal(spawned.args.includes('--strict-mcp-config'), true);
    assert.equal(spawned.args.includes('--permission-prompts'), true);
    assert.equal(spawned.args.includes('--mcp-config'), true);
    assert.equal(spawned.options.shell, false);

    spawned.child.stdout.emit(
      'data',
      JSON.stringify({
        type: 'stream_event',
        event: {
          type: 'content_block_delta',
          delta: { type: 'text_delta', text: 'Listo' },
        },
      }) + '\n',
    );
    spawned.child.stdout.emit(
      'data',
      JSON.stringify({ type: 'result', subtype: 'success' }) + '\n',
    );
    assert.equal(
      events.some(
        (event) => event.type === 'assistant-delta' && event.text === 'Listo',
      ),
      true,
    );
    assert.equal(
      events.some(
        (event) => event.type === 'turn' && event.status === 'completed',
      ),
      true,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the multiplexer connects only the selected supported harness', async () => {
  const calls = [];
  const chat = new LiveHarnessChat({
    userData: '/private/user-data',
    directory: '/private/hyperion',
    url: 'http://127.0.0.1:4317',
    onEvent: () => {},
    onError: () => {},
    resolveHarnesses: () => [
      {
        id: 'codex',
        label: 'Codex',
        status: 'ready',
        executable: '/private/codex',
      },
      {
        id: 'claude',
        label: 'Claude Code',
        status: 'ready',
        executable: '/private/claude',
      },
    ],
    store: {
      selected: 'codex',
      getSelected() {
        return this.selected;
      },
      select(id) {
        this.selected = id;
      },
    },
    factories: {
      codex: () => ({ connect: async () => calls.push('codex') }),
      claude: () => ({ connect: async () => calls.push('claude') }),
    },
  });
  assert.equal(chat.snapshot().selected, 'codex');
  chat.selectHarness('claude');
  await chat.connect('11111111-1111-4111-8111-111111111111');
  assert.deepEqual(calls, ['claude']);
});

test('an idle persistent process can be switched, but an active turn cannot', () => {
  let disposed = 0;
  const chat = new LiveHarnessChat({
    userData: '/unused',
    store: { getSelected: () => 'claude', select() {} },
    resolveHarnesses: () => [],
  });
  chat.chat = {
    child: {},
    turnId: 'running',
    dispose() {
      disposed++;
    },
  };
  assert.throws(() => chat.selectHarness('codex'));
  chat.chat.turnId = null;
  assert.equal(chat.selectHarness('codex').selected, 'codex');
  assert.equal(disposed, 1);
});

test('authentication failure closes the session and releases pending permissions', async () => {
  const events = [];
  const chat = new LiveAcpChat({
    harness: 'claude',
    onEvent: (e) => events.push(e),
    onError() {},
  });
  let killed = 0;
  chat.child = {
    kill() {
      killed++;
    },
  };
  chat.connection = { close() {} };
  chat.agent = {};
  chat.runId = '11111111-1111-4111-8111-111111111111';
  chat.threadId = 'thread';
  chat.turnId = 'turn';
  const permission = chat.requestPermission({
    sessionId: 'thread',
    options: [],
  });
  chat.finish(
    'failed',
    new Error('OAuth session expired and could not be refreshed'),
  );
  assert.equal(chat.child, null);
  assert.equal(chat.agent, null);
  assert.equal(killed, 1);
  assert.deepEqual(await permission, { outcome: { outcome: 'cancelled' } });
  assert.equal(events.at(-1).code, 'auth-required');
});

test('provider authentication diagnostics are not emitted as assistant prose', () => {
  const events = [];
  const chat = new LiveAcpChat({
    harness: 'claude',
    onEvent: (e) => events.push(e),
    onError() {},
  });
  chat.threadId = 'thread';
  chat.turnId = 'turn';
  chat.onSessionUpdate({
    sessionId: 'thread',
    update: {
      sessionUpdate: 'agent_message_chunk',
      content: {
        type: 'text',
        text: 'Failed to authenticate: OAuth session expired and could not be refreshed',
      },
    },
  });
  assert.equal(
    events.some((e) => e.type === 'assistant-delta'),
    false,
  );
  assert.equal(events.at(-1).code, 'auth-required');
});
