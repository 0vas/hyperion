import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Store } from '../src/server/store.js';
import { createApp } from '../src/server/app.js';
import { HyperionClient } from '../src/adapters/client.js';

test('HTTP outbound continuation_prompt: enqueue, claim, settle without session leakage', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'hermes',
    getAgentTokens: () => ({ hermes: 'agent', other: 'other-agent' }),
  });
  const url = await app.listen(0);
  const client = new HyperionClient({ url, token: 'agent' });
  const human = new HyperionClient({ url, token: 'human' });
  const other = new HyperionClient({ url, token: 'other-agent' });
  try {
    const run = await client.create({
      title: 'Outbound prompt',
      steps: [
        { id: 'alpha', title: 'Alpha ready', kind: 'agent' },
        { id: 'beta', title: 'Beta ready', kind: 'agent' },
      ],
    });
    const text = `Continue Hyperion run ${run.id}\n- Alpha ready (alpha)\n- Beta ready (beta)`;
    const commandId = randomUUID();
    const connector = {
      id: 'synthetic-send',
      harness: 'hermes',
      sessionId: 'private-outbound-session',
      scope: 'managed-session' as const,
      capabilities: {
        resume: true as const,
        idempotentDelivery: true as const,
      },
    };

    await assert.rejects(
      () =>
        other.enqueueOutboundPrompt(run.id, {
          expectedRevision: run.revision,
          commandId,
          text,
          connector,
        }),
      /human|coordinator|Forbidden|FORBIDDEN/i,
    );

    const queued = await human.enqueueOutboundPrompt(run.id, {
      expectedRevision: run.revision,
      commandId,
      text,
      connector,
    });
    assert.equal(queued.outboundPrompt?.status, 'queued');
    assert.equal(queued.outboundPrompt?.kind, 'continuation_prompt');
    assert.equal(queued.outboundPrompt?.connectorId, 'synthetic-send');
    assert.ok(
      !JSON.stringify(queued).includes('private-outbound-session'),
      'sessionId must not appear in run projections',
    );

    const replay = await human.enqueueOutboundPrompt(run.id, {
      expectedRevision: run.revision,
      commandId,
      text,
      connector,
    });
    assert.equal(replay.outboundPrompt?.jobId, queued.outboundPrompt?.jobId);

    await assert.rejects(
      () => human.claimOutboundPrompt('synthetic-send'),
      /agent/,
    );

    const delivery = await client.claimOutboundPrompt('synthetic-send');
    assert.ok(delivery);
    assert.equal(delivery!.text, text);
    assert.equal(delivery!.sessionId, 'private-outbound-session');
    assert.equal(delivery!.kind, 'continuation_prompt');
    assert.equal(await client.claimOutboundPrompt('synthetic-send'), null);

    await client.settleOutboundPrompt(delivery!.id, {
      leaseToken: delivery!.leaseToken,
      outcome: 'accepted',
    });
    const settled = await human.get(run.id);
    assert.equal(settled.outboundPrompt?.status, 'delivered');
    assert.ok(!JSON.stringify(settled).includes('private-outbound-session'));
    // Delivery ack is not task execution.
    assert.equal(settled.steps[0]?.status, 'ready');
    assert.equal(settled.steps[0]?.attempt, 0);
  } finally {
    await app.close();
    store.close();
  }
});

test('HTTP outbound uncertain lease requires reconciliation before settle', async () => {
  let now = 5_000_000;
  const store = new Store(':memory:', { now: () => now });
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
      title: 'Lease expiry',
      steps: [{ id: 'work', title: 'Work', kind: 'agent' }],
    });
    const enqueued = await client.enqueueOutboundPrompt(run.id, {
      expectedRevision: run.revision,
      commandId: randomUUID(),
      text: `Continue Hyperion run ${run.id}\n- Work (work)`,
      connector: {
        id: 'bridge',
        harness: 'cursor',
        sessionId: 'sess',
        scope: 'managed-session',
        capabilities: { resume: true, idempotentDelivery: true },
      },
    });
    assert.equal(enqueued.outboundPrompt?.status, 'queued');
    const job = await client.claimOutboundPrompt('bridge');
    assert.ok(job);
    now += 301_000;
    assert.equal(await client.claimOutboundPrompt('bridge'), null);
    assert.equal(
      (await client.get(run.id)).outboundPrompt?.status,
      'uncertain',
    );
    const pending = await client.pendingOutboundPrompts('bridge');
    assert.equal(pending[0]?.id, job!.id);
    await assert.rejects(
      () =>
        client.settleOutboundPrompt(job!.id, {
          leaseToken: job!.leaseToken,
          outcome: 'accepted',
        }),
      /reconcil/i,
    );
    await client.settleOutboundPrompt(job!.id, {
      leaseToken: job!.leaseToken,
      outcome: 'failed',
      reconciled: true,
      message: 'No host turn started',
    });
    assert.equal((await client.get(run.id)).outboundPrompt?.status, 'failed');
  } finally {
    await app.close();
    store.close();
  }
});
