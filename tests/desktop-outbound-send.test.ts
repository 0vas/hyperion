import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/server/store.js';
import { createApp } from '../src/server/app.js';
import { HyperionClient } from '../src/adapters/client.js';
import { dispatchOutboundOnce } from '../src/adapters/outbound-prompt-worker.js';
import {
  parseDesktopOutboundConfig,
  publicResumeConnector,
  createDesktopClipboardSendConnector,
  createDesktopHarnessCliSendConnector,
  createDesktopOutboundSendConnector,
  expandHarnessCliArgs,
} from '../src/adapters/desktop-outbound-send.js';
import { outboundSendConfiguredFromResumeConnector } from '../src/client/next-cycle-send.js';

const clipboardConfig = {
  id: 'desktop-clipboard-send',
  harness: 'cursor',
  sessionId: 'user-configured-session',
  scope: 'managed-session' as const,
  capabilities: { resume: true as const, idempotentDelivery: true as const },
  transport: 'clipboard-open' as const,
};

const harnessCliConfig = {
  id: 'desktop-cursor-cli-send',
  harness: 'cursor',
  sessionId: 'cursor-chat-session',
  scope: 'managed-session' as const,
  capabilities: { resume: true as const, idempotentDelivery: true as const },
  transport: 'harness-cli' as const,
  command: 'agent',
  args: ['--resume', '{{sessionId}}', '--print'],
  prompt: 'arg' as const,
};

test('Desktop outbound config parses clipboard-open and harness-cli', () => {
  const clipboard = parseDesktopOutboundConfig(clipboardConfig);
  assert.ok(clipboard);
  assert.equal(clipboard!.transport, 'clipboard-open');

  const harness = parseDesktopOutboundConfig(harnessCliConfig);
  assert.ok(harness);
  assert.equal(harness!.transport, 'harness-cli');
  if (harness!.transport !== 'harness-cli')
    throw new Error('expected harness-cli');
  assert.equal(harness.command, 'agent');
  assert.deepEqual(harness.args, ['--resume', '{{sessionId}}', '--print']);

  assert.equal(
    parseDesktopOutboundConfig({ ...clipboardConfig, transport: 'mcp' }),
    null,
  );
  assert.equal(
    parseDesktopOutboundConfig({ ...harnessCliConfig, command: '' }),
    null,
  );
  assert.equal(
    parseDesktopOutboundConfig({
      id: clipboardConfig.id,
      harness: clipboardConfig.harness,
      sessionId: clipboardConfig.sessionId,
      scope: clipboardConfig.scope,
      capabilities: clipboardConfig.capabilities,
    }),
    null,
  );
});

test('public ResumeConnector strips transport fields and enables Enviar gate', () => {
  const pubClipboard = publicResumeConnector(clipboardConfig);
  assert.equal('transport' in pubClipboard, false);
  assert.equal(
    outboundSendConfiguredFromResumeConnector(pubClipboard, 'cursor'),
    true,
  );

  const pubHarness = publicResumeConnector(harnessCliConfig);
  assert.equal('transport' in pubHarness, false);
  assert.equal('command' in pubHarness, false);
  assert.equal(
    outboundSendConfiguredFromResumeConnector(pubHarness, 'cursor'),
    true,
  );
  assert.equal(
    outboundSendConfiguredFromResumeConnector(pubHarness, 'codex'),
    false,
  );
});

test('expandHarnessCliArgs substitutes session and text without a shell', () => {
  assert.deepEqual(
    expandHarnessCliArgs(
      ['--resume', '{{sessionId}}', '--print', 'prefix {{text}}'],
      { sessionId: 'abc', text: 'hello world' },
    ),
    ['--resume', 'abc', '--print', 'prefix hello world'],
  );
});

test('clipboard-open send settles accepted without starting agent steps', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'cursor',
  });
  const url = await app.listen(0);
  const client = new HyperionClient({ url, token: 'agent' });
  const human = new HyperionClient({ url, token: 'human' });
  try {
    const run = await client.create({
      title: 'Desktop send Case B',
      steps: [
        { id: 'alpha', title: 'Agregar idioma', kind: 'agent' },
        { id: 'beta', title: 'Agregar feed', kind: 'agent' },
      ],
    });
    const text = `Continúa ${run.id}: Agregar idioma (alpha), Agregar feed (beta)`;
    await human.enqueueOutboundPrompt(run.id, {
      expectedRevision: run.revision,
      commandId: randomUUID(),
      text,
      connector: publicResumeConnector(clipboardConfig),
    });

    const written: string[] = [];
    const remembered = new Set<string>();
    const connector = createDesktopClipboardSendConnector(clipboardConfig, {
      writeText: (value) => written.push(value),
      rememberDelivery: (id) => remembered.add(id),
      wasDelivered: (id) => remembered.has(id),
    });

    assert.equal(await dispatchOutboundOnce(client, connector), true);
    assert.equal(written.length, 1);
    assert.equal(written[0], text);
    assert.equal((await human.get(run.id)).outboundPrompt?.status, 'delivered');
    assert.equal((await human.get(run.id)).steps[0]?.status, 'ready');
    assert.equal((await human.get(run.id)).steps[1]?.status, 'ready');
    assert.equal((await human.get(run.id)).steps[0]?.attempt, 0);

    // Idempotent: second claim finds nothing; reconcile path remembers id.
    assert.equal(await dispatchOutboundOnce(client, connector), false);
  } finally {
    await app.close();
    store.close();
  }
});

test('clipboard-open send fails closed when text cannot be written', async () => {
  const connector = createDesktopClipboardSendConnector(clipboardConfig, {
    writeText: () => {
      throw new Error('clipboard denied');
    },
    rememberDelivery: () => {},
    wasDelivered: () => false,
  });
  const result = await connector.send(
    {
      id: randomUUID(),
      kind: 'continuation_prompt',
      runId: 'run',
      revision: 1,
      commandId: randomUUID(),
      text: 'hello',
      connectorId: clipboardConfig.id,
      harness: 'cursor',
      sessionId: clipboardConfig.sessionId,
      scope: 'managed-session',
      leaseToken: randomUUID(),
      leaseUntil: Date.now() + 10_000,
    },
    { status: 'active', steps: [] } as never,
  );
  assert.equal(result.outcome, 'failed');
  assert.match(result.message || '', /clipboard denied/);
});

test('harness-cli send settles accepted via synthetic Cursor CLI spawn', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'cursor',
  });
  const url = await app.listen(0);
  const client = new HyperionClient({ url, token: 'agent' });
  const human = new HyperionClient({ url, token: 'human' });
  try {
    const run = await client.create({
      title: 'Desktop W2 harness-cli',
      steps: [{ id: 'alpha', title: 'Continuar', kind: 'agent' }],
    });
    const text = `Continúa ${run.id}: Continuar (alpha)`;
    await human.enqueueOutboundPrompt(run.id, {
      expectedRevision: run.revision,
      commandId: randomUUID(),
      text,
      connector: publicResumeConnector(harnessCliConfig),
    });

    const spawns: Array<{ command: string; args: string[] }> = [];
    const remembered = new Set<string>();
    const connector = createDesktopHarnessCliSendConnector(harnessCliConfig, {
      writeText: () => {
        throw new Error('clipboard must not run for harness-cli');
      },
      rememberDelivery: (id) => remembered.add(id),
      wasDelivered: (id) => remembered.has(id),
      spawn: async (request) => {
        spawns.push({ command: request.command, args: request.args });
        return { started: true, exitCode: 0, signal: null };
      },
    });

    assert.equal(await dispatchOutboundOnce(client, connector), true);
    assert.equal(spawns.length, 1);
    assert.equal(spawns[0]?.command, 'agent');
    assert.deepEqual(spawns[0]?.args, [
      '--resume',
      harnessCliConfig.sessionId,
      '--print',
      text,
    ]);
    assert.equal((await human.get(run.id)).outboundPrompt?.status, 'delivered');
    assert.equal((await human.get(run.id)).steps[0]?.status, 'ready');
    assert.equal((await human.get(run.id)).steps[0]?.attempt, 0);
    assert.equal(await dispatchOutboundOnce(client, connector), false);
  } finally {
    await app.close();
    store.close();
  }
});

test('harness-cli fails when CLI cannot start; uncertain when exit is ambiguous', async () => {
  const remembered = new Set<string>();
  const baseIo = {
    writeText: () => {},
    rememberDelivery: (id: string) => remembered.add(id),
    wasDelivered: (id: string) => remembered.has(id),
  };
  const delivery = {
    id: randomUUID(),
    kind: 'continuation_prompt' as const,
    runId: 'run',
    revision: 1,
    commandId: randomUUID(),
    text: 'hello',
    connectorId: harnessCliConfig.id,
    harness: 'cursor',
    sessionId: harnessCliConfig.sessionId,
    scope: 'managed-session' as const,
    leaseToken: randomUUID(),
    leaseUntil: Date.now() + 10_000,
  };
  const run = { status: 'active', steps: [] } as never;

  const missing = createDesktopHarnessCliSendConnector(harnessCliConfig, {
    ...baseIo,
    spawn: async () => ({
      started: false,
      exitCode: null,
      signal: null,
      error: new Error('ENOENT agent'),
    }),
  });
  const missingResult = await missing.send(delivery, run);
  assert.equal(missingResult.outcome, 'failed');
  assert.match(missingResult.message || '', /ENOENT/);

  const ambiguous = createDesktopOutboundSendConnector(harnessCliConfig, {
    ...baseIo,
    spawn: async () => ({ started: true, exitCode: 2, signal: null }),
  });
  await assert.rejects(
    () => ambiguous.send(delivery, run),
    /exited 2; reconcile before retry/,
  );
  assert.equal(remembered.size, 0);
});
