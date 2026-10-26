import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/server/store.js';
import { createApp } from '../src/server/app.js';
import { HyperionClient } from '../src/adapters/client.js';
import {
  dispatchBridgeOnce,
  dispatchOnce,
} from '../src/adapters/continuation-worker.js';
import { dispatchOutboundOnce } from '../src/adapters/outbound-prompt-worker.js';

test('outbound worker claims continuation_prompt text and settles without executing steps', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'hermes',
  });
  const url = await app.listen(0);
  const client = new HyperionClient({ url, token: 'agent' });
  const human = new HyperionClient({ url, token: 'human' });
  try {
    const run = await client.create({
      title: 'Outbound worker',
      steps: [
        { id: 'alpha', title: 'Alpha ready', kind: 'agent' },
        { id: 'beta', title: 'Beta ready', kind: 'agent' },
      ],
    });
    const text = `Continúa el flujo de Hyperion ${run.id}. Alpha ready (alpha), Beta ready (beta)`;
    await human.enqueueOutboundPrompt(run.id, {
      expectedRevision: run.revision,
      commandId: randomUUID(),
      text,
      connector: {
        id: 'send-bridge',
        harness: 'hermes',
        sessionId: 'private-send-session',
        scope: 'managed-session',
        capabilities: { resume: true, idempotentDelivery: true },
      },
    });
    assert.equal((await client.get(run.id)).outboundPrompt?.status, 'queued');

    let turns = 0;
    let seenText = '';
    const connector = {
      id: 'send-bridge',
      async send(
        delivery: { text: string; sessionId: string; kind: string },
        current: Awaited<ReturnType<typeof client.get>>,
      ) {
        turns++;
        seenText = delivery.text;
        assert.equal(delivery.sessionId, 'private-send-session');
        assert.equal(delivery.kind, 'continuation_prompt');
        assert.equal(current.steps[0]?.status, 'ready');
        return { outcome: 'accepted' as const };
      },
    };
    assert.equal(await dispatchOutboundOnce(client, connector), true);
    assert.equal(await dispatchOutboundOnce(client, connector), false);
    assert.equal(turns, 1);
    assert.equal(seenText, text);
    assert.equal((await human.get(run.id)).outboundPrompt?.status, 'delivered');
    // Delivery ack is not execution.
    assert.equal((await human.get(run.id)).steps[0]?.status, 'ready');
    assert.equal((await human.get(run.id)).steps[0]?.attempt, 0);
    assert.ok(
      !JSON.stringify(await human.get(run.id)).includes('private-send-session'),
    );
  } finally {
    await app.close();
    store.close();
  }
});

test('bridge tick runs outbound send without claiming ADR 0022 when resume is absent', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'cursor',
  });
  const url = await app.listen(0);
  const client = new HyperionClient({ url, token: 'agent' });
  try {
    const run = await client.create({
      title: 'Bridge outbound only',
      steps: [{ id: 'work', title: 'Work', kind: 'agent' }],
    });
    await client.enqueueOutboundPrompt(run.id, {
      expectedRevision: run.revision,
      commandId: randomUUID(),
      text: `Continue ${run.id}`,
      connector: {
        id: 'bridge',
        harness: 'cursor',
        sessionId: 'sess',
        scope: 'managed-session',
        capabilities: { resume: true, idempotentDelivery: true },
      },
    });
    let sent = 0;
    assert.equal(
      await dispatchBridgeOnce(client, {
        id: 'bridge',
        async send() {
          sent++;
          return { outcome: 'accepted' as const };
        },
      }),
      true,
    );
    assert.equal(sent, 1);
    assert.equal(
      (await client.get(run.id)).outboundPrompt?.status,
      'delivered',
    );
  } finally {
    await app.close();
    store.close();
  }
});

test('ambiguous outbound send exceptions retain the lease', async () => {
  let settlements = 0;
  const client = {
    pendingOutboundPrompts: async () => [],
    claimOutboundPrompt: async () => ({
      id: 'job',
      runId: 'run',
      leaseToken: 'lease',
      text: 'wake',
      kind: 'continuation_prompt',
    }),
    get: async () => ({ status: 'active', steps: [] }),
    settleOutboundPrompt: async () => {
      settlements++;
    },
  };
  await assert.rejects(
    () =>
      dispatchOutboundOnce(client as unknown as HyperionClient, {
        id: 'bridge',
        async send() {
          throw new Error('connection lost after send');
        },
      }),
    /connection lost/,
  );
  assert.equal(settlements, 0);
});

test('ADR 0022 dispatchOnce is unchanged for resume-only connectors', async () => {
  let settlements = 0;
  const client = {
    pendingContinuations: async () => [],
    claimContinuation: async () => null,
    get: async () => ({ status: 'active', steps: [] }),
    settleContinuation: async () => {
      settlements++;
    },
  };
  assert.equal(
    await dispatchOnce(client as unknown as HyperionClient, {
      id: 'bridge',
      async resume() {
        return { outcome: 'accepted' as const };
      },
    }),
    false,
  );
  assert.equal(settlements, 0);
});
