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
} from '../src/adapters/desktop-outbound-send.js';
import { outboundSendConfiguredFromResumeConnector } from '../src/client/next-cycle-send.js';

const baseConfig = {
  id: 'desktop-clipboard-send',
  harness: 'cursor',
  sessionId: 'user-configured-session',
  scope: 'managed-session' as const,
  capabilities: { resume: true as const, idempotentDelivery: true as const },
  transport: 'clipboard-open' as const,
};

test('Desktop outbound config parses only clipboard-open + connectorSchema', () => {
  const ok = parseDesktopOutboundConfig(baseConfig);
  assert.ok(ok);
  assert.equal(ok!.transport, 'clipboard-open');
  assert.equal(
    parseDesktopOutboundConfig({ ...baseConfig, transport: 'mcp' }),
    null,
  );
  assert.equal(
    parseDesktopOutboundConfig({ ...baseConfig, sessionId: '' }),
    null,
  );
  assert.equal(
    parseDesktopOutboundConfig({
      id: baseConfig.id,
      harness: baseConfig.harness,
      sessionId: baseConfig.sessionId,
      scope: baseConfig.scope,
      capabilities: baseConfig.capabilities,
    }),
    null,
  );
});

test('public ResumeConnector strips transport and enables Enviar gate', () => {
  const pub = publicResumeConnector(baseConfig);
  assert.equal('transport' in pub, false);
  assert.equal(outboundSendConfiguredFromResumeConnector(pub, 'cursor'), true);
  assert.equal(outboundSendConfiguredFromResumeConnector(pub, 'codex'), false);
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
      connector: publicResumeConnector(baseConfig),
    });

    const written: string[] = [];
    const remembered = new Set<string>();
    const connector = createDesktopClipboardSendConnector(baseConfig, {
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
  const connector = createDesktopClipboardSendConnector(baseConfig, {
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
      connectorId: baseConfig.id,
      harness: 'cursor',
      sessionId: baseConfig.sessionId,
      scope: 'managed-session',
      leaseToken: randomUUID(),
      leaseUntil: Date.now() + 10_000,
    },
    { status: 'active', steps: [] } as never,
  );
  assert.equal(result.outcome, 'failed');
  assert.match(result.message || '', /clipboard denied/);
});
