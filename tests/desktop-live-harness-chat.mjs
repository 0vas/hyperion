import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
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
import { LiveChatPermissionStore } from '../desktop/live-chat-permission-store.mjs';
import { buildClaudePermissionOptions } from '../node_modules/@agentclientprotocol/claude-agent-acp/dist/permissions/options.js';

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
  permissionCall,
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
        const call = permissionCall?.(
          requests.find((item) => item.method === 'session/new').params
            .mcpServers[0].name,
        );
        if (call)
          child.stdout.write(
            JSON.stringify({
              jsonrpc: '2.0',
              method: 'session/update',
              params: {
                sessionId: 'native-session',
                update: { sessionUpdate: 'tool_call', ...call },
              },
            }) + '\n',
          );
        child.stdout.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'session/request_permission',
            id: 900,
            params: {
              sessionId: 'native-session',
              ...(call ? { _meta: { is_mcp_tool_approval: true } } : {}),
              toolCall: call
                ? {
                    toolCallId: call.toolCallId,
                    kind: 'execute',
                    status: 'pending',
                  }
                : {
                    toolCallId: 'read-1',
                    title: 'Read isolated test workflow',
                  },
              options: [
                {
                  kind: 'allow_once',
                  optionId: call ? 'allow_once' : 'once',
                  name: 'Allow',
                },
                ...(call
                  ? [
                      {
                        kind: 'allow_always',
                        optionId: 'allow_session',
                        name: 'Allow for this session',
                      },
                    ]
                  : []),
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
            'substantive direct answer',
            'plan.request',
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
      assert.match(
        wire.requests.find((r) => r.method === 'session/new').params
          .mcpServers[0].name,
        /^hyperion_active_[0-9a-f]{32}$/,
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

test('an adapter-shaped MCP permission travels over ACP with only a one-time Auto response', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-auto-wire-'));
  const events = [];
  const wire = fakeAcpProcess({
    permissionCall: (server) => ({
      toolCallId: 'private-mcp-1',
      title: 'Read workflow',
      kind: 'execute',
      status: 'pending',
      _meta: { is_mcp_tool_call: true },
      rawInput: { server, tool: 'hyperion_list_runs', arguments: {} },
    }),
  });
  const chat = new LiveAcpChat({
    harness: 'codex',
    userData: home,
    directory: home,
    url: 'http://127.0.0.1:4317',
    resolveExecutable: () => ({ executable: '/private/test-cli' }),
    spawnImpl: () => wire.child,
    onEvent: (event) => events.push(event),
  });
  try {
    await chat.connect(null);
    chat.setPermissionMode('auto');
    await chat.send(null, 'List workflows');
    await until(() =>
      events.some(
        (event) => event.type === 'turn' && event.status === 'completed',
      ),
    );
    assert.deepEqual(
      wire.requests.find((request) => request.id === 900).result,
      { outcome: { outcome: 'selected', optionId: 'allow_once' } },
    );
    assert.equal(
      events.some((event) => event.type === 'approval'),
      false,
    );
    assert.equal(
      events.find((event) => event.type === 'action').itemId,
      'private-mcp-1',
    );
    assert.equal(
      events.find((event) => event.type === 'assistant-delta').text,
      'Verified wire response',
    );
    chat.dispose();
    assert.equal(chat.permissionMode, 'auto');
  } finally {
    chat.dispose();
    rmSync(home, { recursive: true, force: true });
  }
});

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

function policyChat() {
  const fixture = activePermissionChat();
  fixture.chat.harness = 'codex';
  fixture.params.options[0].optionId = 'allow_once';
  fixture.params._meta = { is_mcp_tool_approval: true };
  fixture.params.options.push({
    kind: 'allow_always',
    optionId: 'allow_session',
  });
  const toolCall = {
    toolCallId: 'hyperion-read-1',
    title: 'Read workflow',
    kind: 'execute',
    status: 'pending',
    _meta: { is_mcp_tool_call: true },
    rawInput: {
      server: fixture.chat.mcpServerName,
      tool: 'hyperion_get_run',
      arguments: { runId: fixture.chat.runId },
    },
  };
  fixture.chat.onSessionUpdate({
    sessionId: fixture.chat.threadId,
    update: { sessionUpdate: 'tool_call', ...toolCall },
  });
  return { ...fixture, toolCall };
}

test('Codex correlated MCP approval uses the installed sparse request shape', async () => {
  // ElicitationReporter.permission + buildMcpPermissionRequest in codex-acp:
  // correlated requests omit rawInput/title and mark the REQUEST, not the call.
  const { chat, toolCall } = policyChat();
  chat.setPermissionMode('auto');
  const result = chat.requestPermission({
    sessionId: chat.threadId,
    toolCall: {
      toolCallId: toolCall.toolCallId,
      kind: 'execute',
      status: 'pending',
    },
    _meta: { is_mcp_tool_approval: true },
    options: [
      { optionId: 'allow_once', name: 'Allow', kind: 'allow_once' },
      {
        optionId: 'allow_session',
        name: 'Allow for this session',
        kind: 'allow_always',
      },
      { optionId: 'cancel', name: 'Cancel', kind: 'reject_once' },
    ],
  });
  try {
    assert.equal(chat.pendingApprovals.size, 0);
    assert.equal((await result).outcome.optionId, 'allow_once');
  } finally {
    chat.dispose();
    await result;
  }
});

test('sparse MCP requests fail closed without approval metadata, persistence or a live matching call', async () => {
  for (const variant of [
    'no-marker',
    'false-marker',
    'no-persistence',
    'unrecognized-persistence',
    'wrong-call',
    'wrong-session',
    'terminal',
    'conflicting-input',
    'question',
  ]) {
    const { chat, params, toolCall } = policyChat();
    chat.setPermissionMode('auto');
    const request = {
      ...params,
      toolCall: {
        toolCallId: toolCall.toolCallId,
        kind: 'execute',
        status: 'pending',
      },
    };
    if (variant === 'no-marker') delete request._meta;
    if (variant === 'false-marker')
      request._meta = { is_mcp_tool_approval: false };
    if (variant === 'no-persistence')
      request.options = [{ kind: 'allow_once', optionId: 'allow_once' }];
    if (variant === 'unrecognized-persistence')
      request.options = [
        ...request.options.slice(0, 1),
        { kind: 'allow_always', optionId: 'unknown' },
      ];
    if (variant === 'wrong-call') request.toolCall.toolCallId = 'another';
    if (variant === 'wrong-session') request.sessionId = 'another';
    if (variant === 'terminal')
      chat.onSessionUpdate({
        sessionId: chat.threadId,
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: toolCall.toolCallId,
          status: 'completed',
        },
      });
    if (variant === 'conflicting-input')
      request.toolCall.rawInput = {
        ...toolCall.rawInput,
        arguments: { runId: 'another' },
      };
    if (variant === 'question')
      request.toolCall.input = { schema: { question: 'Human response' } };
    const result = chat.requestPermission(request);
    try {
      assert.equal(
        chat.pendingApprovals.size,
        variant === 'wrong-session' ? 0 : 1,
        variant,
      );
    } finally {
      chat.dispose();
      assert.equal((await result).outcome.outcome, 'cancelled');
    }
  }
});

test('Claude provider ask rules and suppressed persistence remain manual with exact adapter options', async () => {
  const { chat, params } = activePermissionChat();
  chat.harness = 'claude';
  const toolName = `mcp__${chat.mcpServerName}__hyperion_get_run`;
  const toolCall = {
    toolCallId: 'ask-rule',
    rawInput: { runId: chat.runId },
    _meta: {
      claudeCode: {
        toolName,
        mcpServer: { name: chat.mcpServerName, source: 'dynamic' },
      },
    },
  };
  chat.onSessionUpdate({
    sessionId: chat.threadId,
    update: { sessionUpdate: 'tool_call', ...toolCall },
  });
  chat.setPermissionMode('auto');
  const options = buildClaudePermissionOptions({
    toolName,
    input: toolCall.rawInput,
    allowPersistentOptions: false,
  });
  const result = chat.requestPermission({ ...params, toolCall, options });
  try {
    assert.equal(chat.pendingApprovals.size, 1);
  } finally {
    chat.dispose();
    await result;
  }
});

test('Auto Hyperion is opt-in and uses allow_once for identified session tools', async () => {
  const { chat, events, params, toolCall } = policyChat();
  assert.equal(chat.permissionMode, 'ask');
  const pending = chat.requestPermission({ ...params, toolCall });
  assert.equal(chat.pendingApprovals.size, 1);
  assert.equal(
    events.find((event) => event.type === 'approval').autoEligible,
    true,
  );
  chat.setPermissionMode('auto');
  assert.equal((await pending).outcome.optionId, 'allow_once');
  const result = await chat.requestPermission({
    ...params,
    toolCall,
    options: [
      { kind: 'allow_always', optionId: 'allow_session' },
      { kind: 'allow_once', optionId: 'allow_once' },
    ],
  });
  assert.equal(result.outcome.optionId, 'allow_once');
  assert.equal(chat.pendingApprovals.size, 0);
});

test('Auto Hyperion asks for unknown, spoofed, human, destructive and incomplete requests', async () => {
  const variants = [
    undefined,
    {
      toolCallId: 'unknown',
      title: 'mcp.hyperion_active.hyperion_get_run',
      rawInput: undefined,
      _meta: undefined,
    },
    {
      rawInput: { server: 'foreign', tool: 'hyperion_get_run', arguments: {} },
    },
    { rawInput: { tool: 'hyperion_submit', arguments: {} } },
    { rawInput: { tool: 'hyperion_step', arguments: { action: 'approve' } } },
    { rawInput: { tool: 'hyperion_step', arguments: { action: 'amend' } } },
    { rawInput: { tool: 'hyperion_step', arguments: {} } },
    { rawInput: { tool: 'shell', arguments: { command: 'delete something' } } },
    { rawInput: null },
  ];
  for (const variant of variants) {
    const { chat, params, toolCall } = policyChat();
    chat.setPermissionMode('auto');
    const candidate = variant && {
      ...toolCall,
      ...variant,
      ...(variant.rawInput && {
        rawInput: { ...toolCall.rawInput, ...variant.rawInput },
      }),
    };
    // Both events agree: exclusion must come from the allowlist/metadata,
    // not merely a mismatch with the original read call.
    chat.toolCalls.clear();
    if (candidate)
      chat.onSessionUpdate({
        sessionId: chat.threadId,
        update: { sessionUpdate: 'tool_call', ...candidate },
      });
    const pending = chat.requestPermission({ ...params, toolCall: candidate });
    assert.equal(chat.pendingApprovals.size, 1, JSON.stringify(variant));
    chat.cancelPendingApprovals();
    assert.deepEqual(await pending, { outcome: { outcome: 'cancelled' } });
  }
});

test('Auto Hyperion never substitutes a persistent-only option or a provider denial hint', async () => {
  for (const extra of [
    { options: [{ kind: 'allow_always', optionId: 'always' }] },
    { _meta: { permission: { defaultToNo: true } } },
  ]) {
    const { chat, params, toolCall } = policyChat();
    chat.setPermissionMode('auto');
    const result = chat.requestPermission({ ...params, toolCall, ...extra });
    assert.equal(chat.pendingApprovals.size, 1);
    chat.cancelPendingApprovals();
    assert.deepEqual(await result, { outcome: { outcome: 'cancelled' } });
  }
});

test('Claude requires correlated dynamic private-server metadata; native providers stay manual', async () => {
  for (const source of ['dynamic', 'sdk', 'user', undefined]) {
    const { chat, params } = activePermissionChat();
    chat.harness = 'claude';
    const toolCall = {
      toolCallId: 'claude-read',
      title: 'Read workflow',
      status: 'pending',
      rawInput: { runId: chat.runId },
      _meta: {
        claudeCode: {
          toolName: `mcp__${chat.mcpServerName}__hyperion_get_run`,
          mcpServer: { name: chat.mcpServerName, source },
        },
      },
    };
    params.options = buildClaudePermissionOptions({
      toolName: toolCall._meta.claudeCode.toolName,
      input: toolCall.rawInput,
      allowPersistentOptions: true,
      durableChangeSet: {
        updates: [
          {
            type: 'addRules',
            behavior: 'allow',
            destination: 'localSettings',
            rules: [{ toolName: toolCall._meta.claudeCode.toolName }],
          },
        ],
      },
    });
    chat.onSessionUpdate({
      sessionId: chat.threadId,
      update: { sessionUpdate: 'tool_call', ...toolCall },
    });
    chat.setPermissionMode('auto');
    const result = chat.requestPermission({ ...params, toolCall });
    assert.equal(chat.pendingApprovals.size, source === 'dynamic' ? 0 : 1);
    chat.cancelPendingApprovals();
    assert.equal(
      (await result).outcome.outcome,
      source === 'dynamic' ? 'selected' : 'cancelled',
    );
  }
  for (const harness of ['cursor', 'antigravity']) {
    const { chat, params, toolCall } = policyChat();
    chat.harness = harness;
    chat.setPermissionMode('auto');
    const result = chat.requestPermission({ ...params, toolCall });
    assert.equal(chat.pendingApprovals.size, 1);
    chat.cancelPendingApprovals();
    assert.equal((await result).outcome.outcome, 'cancelled');
  }
});

test('a changed, untracked or stale tool identity cannot be revived by enabling Auto', async () => {
  for (const change of ['input', 'metadata', 'kind', 'untracked', 'turn']) {
    const { chat, params, toolCall } = policyChat();
    const result = chat.requestPermission({ ...params, toolCall });
    if (change === 'untracked') chat.toolCalls.clear();
    else if (change === 'turn') {
      chat.finish('completed');
      chat.turnId = 'next-turn';
    } else {
      const altered = {
        input: {
          rawInput: {
            ...toolCall.rawInput,
            tool: 'hyperion_list_runs',
            arguments: {},
          },
        },
        metadata: { _meta: { is_mcp_tool_call: false } },
        kind: { kind: 'delete' },
      }[change];
      chat.onSessionUpdate({
        sessionId: chat.threadId,
        update: {
          sessionUpdate: 'tool_call_update',
          toolCallId: toolCall.toolCallId,
          ...altered,
        },
      });
      // A later duplicate start must not repair an invalidated identity.
      chat.onSessionUpdate({
        sessionId: chat.threadId,
        update: { sessionUpdate: 'tool_call', ...toolCall },
      });
    }
    chat.setPermissionMode('auto');
    assert.equal(chat.pendingApprovals.size, change === 'turn' ? 0 : 1, change);
    chat.cancelPendingApprovals();
    assert.equal((await result).outcome.outcome, 'cancelled');
    chat.dispose();
  }
});

test('Claude contradictions permanently invalidate identity before or after a permission is pending', async () => {
  for (const timing of ['before', 'after'])
    for (const sessionUpdate of ['tool_call_update', 'tool_call'])
      for (const conflict of ['server', 'source', 'input', 'tool']) {
        const { chat, params } = activePermissionChat();
        chat.harness = 'claude';
        const toolName = `mcp__${chat.mcpServerName}__hyperion_get_run`;
        const toolCall = {
          toolCallId: 'claude-conflict',
          kind: 'execute',
          status: 'pending',
          rawInput: { runId: chat.runId },
          _meta: {
            claudeCode: {
              toolName,
              mcpServer: { name: chat.mcpServerName, source: 'dynamic' },
            },
          },
        };
        params.options = buildClaudePermissionOptions({
          toolName,
          input: toolCall.rawInput,
          allowPersistentOptions: true,
          durableChangeSet: {
            updates: [
              {
                type: 'addRules',
                behavior: 'allow',
                destination: 'localSettings',
                rules: [{ toolName }],
              },
            ],
          },
        });
        chat.onSessionUpdate({
          sessionId: chat.threadId,
          update: { sessionUpdate: 'tool_call', ...toolCall },
        });
        let result =
          timing === 'after'
            ? chat.requestPermission({ ...params, toolCall })
            : undefined;
        const contradictory = structuredClone(toolCall);
        if (conflict === 'server')
          contradictory._meta.claudeCode.mcpServer.name = 'foreign';
        if (conflict === 'source')
          contradictory._meta.claudeCode.mcpServer.source = 'sdk';
        if (conflict === 'tool')
          contradictory._meta.claudeCode.toolName = `mcp__${chat.mcpServerName}__hyperion_list_runs`;
        if (conflict === 'input') contradictory.rawInput.runId = 'foreign';
        chat.onSessionUpdate({
          sessionId: chat.threadId,
          update: { sessionUpdate, ...contradictory },
        });
        // Neither a corrected partial update nor a repeated start repairs trust.
        for (const repair of ['tool_call_update', 'tool_call'])
          chat.onSessionUpdate({
            sessionId: chat.threadId,
            update: { sessionUpdate: repair, ...toolCall },
          });
        result ??= chat.requestPermission({ ...params, toolCall });
        try {
          chat.setPermissionMode('auto');
          assert.equal(
            chat.pendingApprovals.size,
            1,
            `${timing}/${sessionUpdate}/${conflict}`,
          );
        } finally {
          chat.dispose();
          assert.equal((await result).outcome.outcome, 'cancelled');
        }
      }
});

test('action and approval labels never expose provider titles or command prose', async () => {
  for (const harness of ['codex', 'claude', 'cursor', 'antigravity'])
    for (const title of [
      'echo SYNTHETIC_SECRET_MARKER',
      'command --password SYNTHETIC_SECRET_MARKER',
      'Write-Output SYNTHETIC_SECRET_MARKER',
      'Private prose SYNTHETIC_SECRET_MARKER',
    ]) {
      const { chat, params, events } = activePermissionChat();
      chat.harness = harness;
      const toolCall = {
        toolCallId: 'native-command',
        title,
        kind: 'execute',
        status: 'pending',
        rawInput: { command: title },
        ...(harness === 'claude'
          ? {
              _meta: {
                claudeCode: {
                  toolName: title.startsWith('Write-Output')
                    ? 'PowerShell'
                    : 'Bash',
                },
              },
            }
          : {}),
      };
      chat.onSessionUpdate({
        sessionId: chat.threadId,
        update: { sessionUpdate: 'tool_call', ...toolCall },
      });
      const result = chat.requestPermission({ ...params, toolCall });
      try {
        assert.equal(
          JSON.stringify(events).includes('SYNTHETIC_SECRET_MARKER'),
          false,
          `${harness}/${title}`,
        );
        assert.equal(
          events.find((event) => event.type === 'action').label,
          'Run command',
        );
        assert.equal(
          events.find((event) => event.type === 'approval').label,
          'Run command',
        );
      } finally {
        chat.dispose();
        await result;
      }
    }
});

test('provider interruption cancels permissions before terminal without changing global Auto', async () => {
  const { chat, params, events } = policyChat();
  chat.setPermissionMode('auto');
  const result = chat.requestPermission(params); // Unknown action stays pending.
  chat.finish('interrupted');
  assert.equal(chat.permissionMode, 'auto');
  assert.equal((await result).outcome.outcome, 'cancelled');
  const terminal = events.findIndex(
    (event) => event.type === 'turn' && event.status === 'interrupted',
  );
  const reset = events.findIndex(
    (event) => event.type === 'permission-mode' && event.mode === 'ask',
  );
  const resolved = events.findIndex(
    (event) => event.type === 'approval-resolved',
  );
  assert.equal(reset, -1);
  assert.ok(resolved >= 0 && resolved < terminal);
  chat.dispose();
});

test('verified Hyperion labels also ignore titles on starts, updates and permissions', async () => {
  const { chat, params, events, toolCall } = policyChat();
  const privateCall = { ...toolCall, title: 'SYNTHETIC_SECRET_MARKER' };
  for (const sessionUpdate of ['tool_call', 'tool_call_update'])
    chat.onSessionUpdate({
      sessionId: chat.threadId,
      update: { sessionUpdate, ...privateCall },
    });
  const result = chat.requestPermission({ ...params, toolCall: privateCall });
  try {
    assert.equal(
      JSON.stringify(events).includes('SYNTHETIC_SECRET_MARKER'),
      false,
    );
    assert.equal(events.at(-1).label, 'Read workflow');
  } finally {
    chat.dispose();
    await result;
  }
});

test('permission mode can change without a session; revocation cancels pending requests', async () => {
  const { chat, params } = policyChat();
  assert.throws(() => chat.setPermissionMode('anything'));
  chat.setPermissionMode('auto');
  const pending = chat.requestPermission(params);
  const token = [...chat.pendingApprovals.keys()][0];
  chat.setPermissionMode('ask');
  assert.deepEqual(await pending, { outcome: { outcome: 'cancelled' } });
  assert.throws(() => chat.approve(chat.runId, token, 'allow'));
  chat.disconnect();
  assert.equal(chat.permissionMode, 'ask');
  assert.deepEqual(chat.setPermissionMode('auto'), { mode: 'auto' });
});

test('global Auto survives stop, failure, interruption, completion and disconnect', async () => {
  for (const ending of [
    'completed',
    'failed',
    'interrupted',
    'stop',
    'disconnect',
  ]) {
    const { chat } = policyChat();
    chat.setPermissionMode('auto');
    if (ending === 'stop') await chat.stop(chat.runId);
    else if (ending === 'disconnect') chat.disconnect();
    else chat.finish(ending);
    assert.equal(chat.permissionMode, 'auto');
  }
});

test('unrecognized statuses and payloads do not create facts or leak raw content', () => {
  for (const status of ['__proto__', 'constructor', 'unknown']) {
    const { chat, events, toolCall } = policyChat();
    chat.onSessionUpdate({
      sessionId: chat.threadId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: toolCall.toolCallId,
        status,
        title: '/private/credential-file',
        rawOutput: {
          content: [{ type: 'text', text: 'private raw prose' }],
        },
      },
    });
    assert.equal(events.at(-1).status, 'pending');
    assert.equal(events.at(-1).label, 'Read workflow');
    assert.equal(events.at(-1).summary, undefined);
    assert.equal(JSON.stringify(events.at(-1)).includes('private'), false);
    chat.dispose();
  }
});

test('tool updates retain real ids, status and bounded public results without raw arguments', () => {
  const { chat, events, toolCall } = policyChat();
  chat.onSessionUpdate({
    sessionId: chat.threadId,
    update: {
      sessionUpdate: 'tool_call_update',
      toolCallId: toolCall.toolCallId,
      status: 'completed',
      rawOutput: {
        result: {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                status: 'active',
                steps: [{ id: 'one' }],
                token: 'secret-credential',
                report: 'private structure',
              }),
            },
          ],
        },
      },
      content: [
        {
          type: 'content',
          content: {
            type: 'text',
            text: 'Read complete. Authorization: Bearer secret-credential',
          },
        },
      ],
    },
  });
  const action = events.at(-1);
  assert.equal(action.toolCallId, toolCall.toolCallId);
  assert.equal(action.turnId, 'turn');
  assert.equal(action.status, 'completed');
  assert.equal(action.label, 'Read workflow');
  assert.equal(action.summary, 'Workflow active; 1 steps recorded.');
  assert.ok(!JSON.stringify(action).includes('secret-credential'));
  assert.ok(!JSON.stringify(action).includes('private structure'));
  assert.equal(action.rawOutput, undefined);
  assert.equal(action.rawInput, undefined);
  chat.finish('completed');
  const before = events.length;
  chat.onSessionUpdate({
    sessionId: chat.threadId,
    update: {
      sessionUpdate: 'tool_call_update',
      toolCallId: toolCall.toolCallId,
      status: 'failed',
    },
  });
  assert.equal(events.length, before);
});

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

test('Auto applies to delegable command, file and external MCP tools, not only Hyperion', async () => {
  const cases = [
    {
      harness: 'codex',
      call: {
        toolCallId: 'command',
        name: 'exec_command',
        kind: 'execute',
        rawInput: { command: 'echo synthetic', cwd: '/fixture' },
      },
      options: [
        { kind: 'allow_once', optionId: 'allow_once' },
        { kind: 'allow_always', optionId: 'allow_for_session' },
      ],
    },
    {
      harness: 'codex',
      call: {
        toolCallId: 'wrapped-command',
        name: 'exec_command',
        kind: 'execute',
        rawInput: { command: "/bin/zsh -lc 'echo synthetic'", cwd: '/fixture' },
      },
      permission: {
        toolCallId: 'wrapped-command',
        name: 'exec_command',
        kind: 'execute',
        status: 'pending',
        rawInput: { command: 'echo synthetic', cwd: '/fixture' },
      },
      options: [
        { kind: 'allow_once', optionId: 'allow_once' },
        { kind: 'allow_always', optionId: 'allow_for_session' },
      ],
    },
    {
      harness: 'claude',
      call: {
        toolCallId: 'claude-external',
        kind: 'other',
        rawInput: { query: 'synthetic' },
        _meta: { claudeCode: { toolName: 'mcp__docs__search' } },
      },
      permission: {
        toolCallId: 'claude-external',
        name: 'mcp__docs__search',
        kind: 'other',
        rawInput: { query: 'synthetic' },
        _meta: {
          claudeCode: {
            toolName: 'mcp__docs__search',
            mcpServer: { name: 'docs', source: 'user' },
          },
        },
      },
      options: buildClaudePermissionOptions({
        toolName: 'mcp__docs__search',
        input: { query: 'synthetic' },
        durableChangeSet: {
          updates: [
            {
              type: 'addRules',
              behavior: 'allow',
              destination: 'localSettings',
              rules: [{ toolName: 'mcp__docs__search' }],
            },
          ],
        },
      }),
    },
    {
      harness: 'codex',
      call: {
        toolCallId: 'file',
        kind: 'edit',
        content: [
          { type: 'diff', path: '/fixture/file', oldText: 'a', newText: 'b' },
        ],
      },
      permission: {
        toolCallId: 'file',
        kind: 'edit',
        status: 'pending',
        locations: [{ path: '/fixture/file' }],
      },
      options: [
        { kind: 'allow_once', optionId: 'allow_once' },
        { kind: 'allow_always', optionId: 'allow_for_session' },
      ],
    },
    {
      harness: 'codex',
      call: {
        toolCallId: 'external',
        kind: 'execute',
        _meta: { is_mcp_tool_call: true },
        rawInput: {
          server: 'external-fixture',
          tool: 'search_docs',
          arguments: { query: 'synthetic' },
        },
      },
      permission: {
        toolCallId: 'external',
        kind: 'execute',
        status: 'pending',
      },
      meta: { is_mcp_tool_approval: true },
      options: [
        { kind: 'allow_once', optionId: 'allow_once' },
        { kind: 'allow_always', optionId: 'allow_session' },
      ],
    },
    ...['Bash', 'PowerShell', 'Write'].map((name) => ({
      harness: 'claude',
      call: {
        toolCallId: name,
        kind: name === 'Write' ? 'edit' : 'execute',
        rawInput: {
          command: 'synthetic',
          file_path: '/fixture',
          content: 'synthetic',
        },
        _meta: { claudeCode: { toolName: name } },
      },
      permission: {
        toolCallId: name,
        name,
        kind: name === 'Write' ? 'edit' : 'execute',
        rawInput: {
          command: 'synthetic',
          file_path: '/fixture',
          content: 'synthetic',
        },
      },
      options: buildClaudePermissionOptions({
        toolName: name,
        cwd: '/fixture',
        input: {
          command: 'synthetic',
          file_path: '/fixture',
          content: 'synthetic',
        },
        durableChangeSet: {
          updates: [
            {
              type: 'addRules',
              behavior: 'allow',
              destination: name === 'Write' ? 'session' : 'localSettings',
              rules:
                name === 'Write'
                  ? [{ toolName: 'Edit' }]
                  : [{ toolName: name, ruleContent: 'synthetic:*' }],
            },
          ],
        },
      }),
    })),
  ];
  for (const fixture of cases) {
    const { chat, params, events } = activePermissionChat();
    chat.harness = fixture.harness;
    chat.onSessionUpdate({
      sessionId: chat.threadId,
      update: {
        sessionUpdate: 'tool_call',
        status: 'pending',
        ...fixture.call,
      },
    });
    chat.setPermissionMode('auto');
    const result = chat.requestPermission({
      ...params,
      toolCall: fixture.permission || fixture.call,
      options: fixture.options,
      _meta: fixture.meta,
    });
    try {
      assert.equal(
        chat.pendingApprovals.size,
        0,
        `${fixture.harness}/${fixture.call.toolCallId}`,
      );
      assert.equal(
        (await result).outcome.optionId,
        fixture.options.find((item) => item.kind === 'allow_once').optionId,
      );
      assert.equal(
        events.some((event) => event.type === 'approval'),
        false,
      );
    } finally {
      chat.dispose();
      await result;
    }
  }
});

test('global Auto leaves host-forced asks, strict review, missing metadata and canvas roles manual', async () => {
  for (const variant of [
    'once-only',
    'default-no',
    'reason',
    'strict-review',
    'duplicate-options',
    'unknown-native',
    'grant-permissions',
    'AskUserQuestion',
    'EnterPlanMode',
    'ExitPlanMode',
  ]) {
    const { chat, params } = activePermissionChat();
    chat.harness = 'codex';
    let toolCall = {
      toolCallId: variant,
      name: 'exec_command',
      kind: 'execute',
      rawInput: { command: 'echo synthetic', cwd: '/fixture' },
    };
    let options = [
      { kind: 'allow_once', optionId: 'allow_once' },
      { kind: 'allow_always', optionId: 'allow_for_session' },
    ];
    let meta;
    if (variant === 'once-only') options.pop();
    if (variant === 'default-no') meta = { permission: { defaultToNo: true } };
    if (variant === 'reason')
      meta = { permission: { description: 'Provider requires a decision' } };
    if (variant === 'strict-review')
      options[0].optionId = 'allow_permissions_turn_strict_auto_review';
    if (variant === 'duplicate-options')
      options.push({ kind: 'allow_always', optionId: 'allow_once' });
    if (variant === 'unknown-native') delete toolCall.rawInput;
    if (variant === 'grant-permissions')
      toolCall = {
        toolCallId: variant,
        name: 'request_permissions',
        kind: 'other',
        rawInput: { permissions: { network: { enabled: true } } },
      };
    if (
      ['AskUserQuestion', 'EnterPlanMode', 'ExitPlanMode'].includes(variant)
    ) {
      chat.harness = 'claude';
      toolCall = {
        toolCallId: variant,
        name: variant,
        kind: 'other',
        rawInput: {},
        _meta: { claudeCode: { toolName: variant } },
      };
      options = [
        { kind: 'allow_once', optionId: 'allow-once' },
        { kind: 'allow_always', optionId: 'allow-with-updates' },
      ];
    }
    chat.onSessionUpdate({
      sessionId: chat.threadId,
      update: { sessionUpdate: 'tool_call', status: 'pending', ...toolCall },
    });
    chat.setPermissionMode('auto');
    const result = chat.requestPermission({
      ...params,
      toolCall,
      options,
      _meta: meta,
    });
    try {
      assert.equal(chat.pendingApprovals.size, 1, variant);
    } finally {
      chat.dispose();
      assert.equal((await result).outcome.outcome, 'cancelled');
    }
  }
});

test('native command and file mutations invalidate pending consent and cannot be repaired', async () => {
  for (const kind of ['execute', 'edit']) {
    const { chat, params } = activePermissionChat();
    chat.harness = 'codex';
    const call =
      kind === 'execute'
        ? {
            toolCallId: 'native-change',
            kind,
            name: 'exec_command',
            rawInput: { command: 'echo first' },
          }
        : {
            toolCallId: 'native-change',
            kind,
            content: [
              { type: 'diff', path: '/fixture', oldText: 'a', newText: 'b' },
            ],
          };
    chat.onSessionUpdate({
      sessionId: chat.threadId,
      update: { sessionUpdate: 'tool_call', status: 'pending', ...call },
    });
    const request =
      kind === 'execute'
        ? call
        : {
            toolCallId: call.toolCallId,
            kind,
            locations: [{ path: '/fixture' }],
          };
    const pending = chat.requestPermission({
      ...params,
      toolCall: request,
      options: [
        { kind: 'allow_once', optionId: 'allow_once' },
        { kind: 'allow_always', optionId: 'allow_for_session' },
      ],
    });
    const conflict =
      kind === 'execute'
        ? { rawInput: { command: 'echo second' } }
        : {
            content: [
              {
                type: 'diff',
                path: '/fixture',
                oldText: 'a',
                newText: 'changed',
              },
            ],
          };
    chat.onSessionUpdate({
      sessionId: chat.threadId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: call.toolCallId,
        ...conflict,
      },
    });
    chat.onSessionUpdate({
      sessionId: chat.threadId,
      update: { sessionUpdate: 'tool_call', ...call },
    });
    chat.setPermissionMode('auto');
    try {
      assert.equal(chat.pendingApprovals.size, 1, kind);
    } finally {
      chat.dispose();
      assert.equal((await pending).outcome.outcome, 'cancelled');
    }
  }
});

test('global permission selection works before any session and persists across reload', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-global-mode-'));
  const events = [];
  const options = {
    userData: directory,
    onEvent: (event) => events.push(event),
    store: { getSelected: () => 'codex', select() {} },
    resolveHarnesses: () => [],
  };
  try {
    const mux = new LiveHarnessChat(options);
    assert.deepEqual(mux.getPermissionMode(), { mode: 'ask' });
    assert.deepEqual(mux.setPermissionMode('auto'), { mode: 'auto' });
    assert.equal(
      mux.chat,
      null,
      'Changing the preference does not connect or spawn',
    );
    assert.deepEqual(events.at(-1), { type: 'permission-mode', mode: 'auto' });
    const reloaded = new LiveHarnessChat(options);
    assert.deepEqual(reloaded.getPermissionMode(), { mode: 'auto' });
    assert.throws(() => reloaded.setPermissionMode('auto-hyperion'));
    assert.deepEqual(reloaded.getPermissionMode(), { mode: 'auto' });
    reloaded.setPermissionMode('ask');
    assert.deepEqual(new LiveHarnessChat(options).getPermissionMode(), {
      mode: 'ask',
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('corrupt or legacy choices default Ask; failed persistence never enables Auto or emits success', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-mode-failure-'));
  const path = join(directory, 'live-chat-permission.json');
  try {
    for (const data of [
      'not json',
      '{}',
      '{"mode":"auto-hyperion"}',
      '{"mode":"manual"}',
      '{"mode":true}',
    ]) {
      writeFileSync(path, data);
      assert.deepEqual(new LiveChatPermissionStore(directory).snapshot(), {
        mode: 'ask',
      });
    }
    const events = [];
    const store = new LiveChatPermissionStore(directory);
    // Deterministic filesystem failure without changing real OS permissions.
    mkdirSync(path + '.tmp');
    const mux = new LiveHarnessChat({
      userData: directory,
      permissionStore: store,
      store: { getSelected: () => 'codex' },
      resolveHarnesses: () => [],
      onEvent: (event) => events.push(event),
    });
    const { chat } = activePermissionChat();
    mux.chat = chat;
    assert.throws(() => mux.setPermissionMode('auto'));
    assert.deepEqual(mux.getPermissionMode(), { mode: 'ask' });
    assert.equal(chat.permissionMode, 'ask');
    assert.deepEqual(events, []);
    mux.dispose();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('the preload sends only explicit permission-mode arguments to the dedicated IPC channel', async () => {
  let bridge;
  const calls = [];
  runInNewContext(
    readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8'),
    {
      require: (name) => {
        assert.equal(name, 'electron');
        return {
          contextBridge: {
            exposeInMainWorld: (_name, value) => {
              bridge = value;
            },
          },
          ipcRenderer: {
            sendSync: () => null,
            invoke: async (...args) => {
              calls.push(args);
              return { mode: 'ask' };
            },
          },
        };
      },
    },
  );
  const state = await bridge.liveChat.setPermissionMode('ask');
  await bridge.liveChat.getPermissionMode();
  assert.deepEqual(calls, [
    ['hyperion:live-chat:permission-mode:set', 'ask'],
    ['hyperion:live-chat:permission-mode:get'],
  ]);
  assert.equal(state.mode, 'ask');
});

test('changing provider or workflow retains global Auto in each new session', async () => {
  const sessions = [];
  const factory = () => {
    const { chat } = activePermissionChat();
    chat.turnId = null;
    chat.connect = async (runId) => {
      chat.runId = runId;
      return { connected: true };
    };
    sessions.push(chat);
    return chat;
  };
  const mux = new LiveHarnessChat({
    userData: '/unused',
    store: { getSelected: () => 'codex', select() {} },
    permissionStore: {
      mode: 'ask',
      snapshot() {
        return { mode: this.mode };
      },
      set(mode) {
        this.mode = mode;
        return this.snapshot();
      },
    },
    resolveHarnesses: () => [],
    factories: { codex: factory, claude: factory },
  });
  mux.setPermissionMode('auto');
  await mux.connect(null);
  mux.setPermissionMode('auto');
  await mux.connect('11111111-1111-4111-8111-111111111111');
  assert.equal(sessions[0].permissionMode, 'auto');
  assert.equal(sessions[0].agent, null);
  assert.equal(sessions[1].permissionMode, 'auto');
  mux.setPermissionMode('auto');
  mux.selectHarness('claude');
  assert.equal(sessions[1].permissionMode, 'auto');
  await mux.connect(null);
  assert.equal(sessions[2].permissionMode, 'auto');
  mux.dispose();
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
