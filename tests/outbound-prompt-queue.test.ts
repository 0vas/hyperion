import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/server/store.js';

const human = { role: 'human' as const, id: 'user' };
const plan = {
  title: 'Outbound continuation prompt',
  steps: [
    {
      id: 'work',
      title: 'Continue work',
      kind: 'agent',
    },
    {
      id: 'peer',
      title: 'Peer ready',
      kind: 'agent',
    },
  ],
};
const connector = (harness: string) => ({
  id: 'send-bridge',
  harness,
  sessionId: 'session-outbound',
  scope: 'managed-session' as const,
  capabilities: { resume: true, idempotentDelivery: true },
});
const multiReadyText = (runId: string) =>
  `Continue Hyperion run ${runId}\n- Continue work (work)\n- Peer ready (peer)`;

test('outbound continuation_prompt is durable, idempotent, and separate from ADR 0022', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-outbound-'));
  const path = join(directory, 'db.sqlite');
  const actor = { role: 'agent' as const, id: 'cursor' };
  let store = new Store(path);
  try {
    const run = store.create(plan, actor, 'create');
    assert.equal(
      run.steps.every((step) => step.status === 'ready'),
      true,
    );
    assert.equal(store.continuations.state(run.id), undefined);

    const commandId = randomUUID();
    const text = multiReadyText(run.id);
    const first = store.outboundPrompts.enqueue(
      run.id,
      {
        expectedRevision: run.revision,
        commandId,
        text,
        connector: connector('cursor'),
      },
      human,
    );
    assert.equal(first.status, 'queued');
    assert.equal(first.kind, 'continuation_prompt');
    assert.equal(first.connectorId, 'send-bridge');
    assert.ok(!JSON.stringify(first).includes('session-outbound'));

    const replay = store.outboundPrompts.enqueue(
      run.id,
      {
        expectedRevision: run.revision,
        commandId,
        text,
        connector: connector('cursor'),
      },
      human,
    );
    assert.equal(replay.jobId, first.jobId);

    assert.throws(
      () =>
        store.outboundPrompts.enqueue(
          run.id,
          {
            expectedRevision: run.revision,
            commandId,
            text: 'different text',
            connector: connector('cursor'),
          },
          human,
        ),
      /IDEMPOTENCY|different/i,
    );

    store.close();
    store = new Store(path);
    assert.equal(store.outboundPrompts.state(run.id)?.status, 'queued');
    assert.equal(store.continuations.state(run.id), undefined);

    assert.throws(
      () =>
        store.outboundPrompts.claim('send-bridge', {
          role: 'human',
          id: 'user',
        }),
      /agent/i,
    );
    assert.equal(
      store.outboundPrompts.claim('send-bridge', {
        role: 'agent',
        id: 'other',
      }),
      null,
    );

    const job = store.outboundPrompts.claim('send-bridge', actor)!;
    assert.equal(job.kind, 'continuation_prompt');
    assert.equal(job.text, text);
    assert.equal(job.sessionId, 'session-outbound');
    assert.equal(job.harness, 'cursor');
    assert.equal(store.outboundPrompts.claim('send-bridge', actor), null);

    store.outboundPrompts.settle(
      job.id,
      { leaseToken: job.leaseToken, outcome: 'accepted' },
      actor,
    );
    store.outboundPrompts.settle(
      job.id,
      { leaseToken: job.leaseToken, outcome: 'accepted' },
      actor,
    );
    assert.equal(store.outboundPrompts.state(run.id)?.status, 'delivered');
    // Delivery acknowledgement never starts or completes agent work.
    assert.equal(store.get(run.id).steps[0]!.status, 'ready');
    assert.equal(store.get(run.id).steps[0]!.attempt, 0);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('expired outbound lease becomes uncertain and requires reconciliation', () => {
  let now = 1_000_000;
  const store = new Store(':memory:', { now: () => now });
  const actor = { role: 'agent' as const, id: 'hermes' };
  try {
    const run = store.create(plan, actor, 'create');
    const commandId = randomUUID();
    store.outboundPrompts.enqueue(
      run.id,
      {
        expectedRevision: run.revision,
        commandId,
        text: multiReadyText(run.id),
        connector: connector('hermes'),
      },
      actor,
    );
    const job = store.outboundPrompts.claim('send-bridge', actor)!;
    now += 301_000;
    assert.equal(store.outboundPrompts.claim('send-bridge', actor), null);
    assert.equal(store.outboundPrompts.state(run.id)?.status, 'uncertain');
    assert.equal(
      store.outboundPrompts.pending('send-bridge', actor)[0]?.id,
      job.id,
    );
    assert.throws(
      () =>
        store.outboundPrompts.settle(
          job.id,
          { leaseToken: job.leaseToken, outcome: 'accepted' },
          actor,
        ),
      /reconcil/i,
    );
    store.outboundPrompts.settle(
      job.id,
      {
        leaseToken: job.leaseToken,
        outcome: 'failed',
        reconciled: true,
        message: 'Verified no host turn was started',
      },
      actor,
    );
    assert.equal(store.outboundPrompts.state(run.id)?.status, 'failed');

    const nextId = randomUUID();
    const next = store.outboundPrompts.enqueue(
      run.id,
      {
        expectedRevision: run.revision,
        commandId: nextId,
        text: multiReadyText(run.id),
        connector: connector('hermes'),
      },
      human,
    );
    assert.equal(next.status, 'queued');
    assert.notEqual(next.jobId, job.id);
  } finally {
    store.close();
  }
});

test('outbound enqueue rejects outstanding delivery, wrong harness, and foreign agents', () => {
  const store = new Store(':memory:');
  const actor = { role: 'agent' as const, id: 'codex' };
  try {
    const run = store.create(plan, actor, 'create');
    assert.throws(
      () =>
        store.outboundPrompts.enqueue(
          run.id,
          {
            expectedRevision: run.revision,
            commandId: randomUUID(),
            text: 'wake',
            connector: connector('cursor'),
          },
          actor,
        ),
      /harness|coordinator/i,
    );
    assert.throws(
      () =>
        store.outboundPrompts.enqueue(
          run.id,
          {
            expectedRevision: run.revision,
            commandId: randomUUID(),
            text: 'wake',
            connector: connector('codex'),
          },
          { role: 'agent', id: 'other' },
        ),
      /human|coordinator/i,
    );
    store.outboundPrompts.enqueue(
      run.id,
      {
        expectedRevision: run.revision,
        commandId: randomUUID(),
        text: multiReadyText(run.id),
        connector: connector('codex'),
      },
      human,
    );
    assert.throws(
      () =>
        store.outboundPrompts.enqueue(
          run.id,
          {
            expectedRevision: run.revision,
            commandId: randomUUID(),
            text: multiReadyText(run.id),
            connector: connector('codex'),
          },
          human,
        ),
      /Reconcile|outstanding/i,
    );
  } finally {
    store.close();
  }
});

test('linked_cycle_prompt is rejected in PR1 schema', () => {
  const store = new Store(':memory:');
  const actor = { role: 'agent' as const, id: 'cursor' };
  try {
    const run = store.create(plan, actor, 'create');
    assert.throws(
      () =>
        store.outboundPrompts.enqueue(
          run.id,
          {
            expectedRevision: run.revision,
            commandId: randomUUID(),
            text: 'new beginning',
            connector: connector('cursor'),
            kind: 'linked_cycle_prompt',
          },
          human,
        ),
      /Invalid|literal|continuation_prompt/i,
    );
  } finally {
    store.close();
  }
});
