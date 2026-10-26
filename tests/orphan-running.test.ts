import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ORPHAN_ABANDON_EVENT,
  ORPHAN_ABANDON_MESSAGE,
  ORPHAN_RUNNING_LEASE_MS,
  lastAttemptProgressAt,
  reconcileOrphanRunning,
} from '../src/domain/orphan-running.js';
import { createRun, transition } from '../src/domain/workflow.js';
import { attachArtifact } from '../src/domain/artifacts.js';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';

const agent = { role: 'agent' as const, id: 'codex' };
const plan = {
  title: 'Orphan lease',
  steps: [
    { id: 'scan', title: 'Scan', kind: 'agent' as const, dependencies: [] },
  ],
};

function started(at = '2026-10-26T00:00:00.000Z') {
  let run = createRun(plan, agent.id);
  run = transition(run, { type: 'start', stepId: 'scan' }, agent);
  const step = run.steps.find((s) => s.id === 'scan')!;
  step.startedAt = at;
  const start = run.events.find(
    (e) => e.type === 'start' && e.stepId === 'scan',
  )!;
  start.at = at;
  run.updatedAt = at;
  return run;
}

test('start without progress past L fails with distinct abandon event', () => {
  const run = started('2026-10-26T00:00:00.000Z');
  const now =
    Date.parse('2026-10-26T00:00:00.000Z') + ORPHAN_RUNNING_LEASE_MS + 1;
  const next = reconcileOrphanRunning(run, { now, agentWaiting: false });
  assert.notEqual(next, run);
  assert.equal(next.steps[0]!.status, 'failed');
  assert.equal(next.steps[0]!.result, ORPHAN_ABANDON_MESSAGE);
  assert.equal(next.revision, run.revision + 1);
  const abandon = next.events.at(-1)!;
  assert.equal(abandon.type, ORPHAN_ABANDON_EVENT);
  assert.equal(abandon.message, ORPHAN_ABANDON_MESSAGE);
  assert.equal(abandon.actor, 'hyperion');
  assert.ok(run.events.some((e) => e.type === 'start'));
});

test('log within lease keeps the attempt running', () => {
  let run = started('2026-10-26T00:00:00.000Z');
  const logAt = '2026-10-26T00:00:50.000Z';
  run = transition(
    run,
    { type: 'log', stepId: 'scan', attempt: 1, message: 'still scanning' },
    agent,
  );
  run.events.at(-1)!.at = logAt;
  const now = Date.parse('2026-10-26T00:00:00.000Z') + ORPHAN_RUNNING_LEASE_MS;
  // 180s from start, but only 130s from log — still within lease from progress.
  assert.equal(
    reconcileOrphanRunning(run, { now, agentWaiting: false }).steps[0]!.status,
    'running',
  );
  const later = Date.parse(logAt) + ORPHAN_RUNNING_LEASE_MS + 1;
  const failed = reconcileOrphanRunning(run, {
    now: later,
    agentWaiting: false,
  });
  assert.equal(failed.steps[0]!.status, 'failed');
  assert.equal(failed.events.at(-1)!.type, ORPHAN_ABANDON_EVENT);
});

test('agentWaiting true never auto-fails even past L', () => {
  const run = started('2026-10-26T00:00:00.000Z');
  const now =
    Date.parse('2026-10-26T00:00:00.000Z') + ORPHAN_RUNNING_LEASE_MS + 60_000;
  const next = reconcileOrphanRunning(run, { now, agentWaiting: true });
  assert.equal(next, run);
  assert.equal(next.steps[0]!.status, 'running');
});

test('artifact mid-attempt refreshes the lease', () => {
  let run = started('2026-10-26T00:00:00.000Z');
  const artAt = '2026-10-26T00:02:00.000Z';
  run = attachArtifact(
    run,
    {
      id: 'art-1',
      name: 'partial.txt',
      mediaType: 'text/plain',
      attempt: 1,
      createdAt: artAt,
      url: 'https://example.invalid/partial.txt',
    },
    { stepId: 'scan', attempt: 1 },
    agent,
  );
  assert.equal(lastAttemptProgressAt(run, run.steps[0]!), Date.parse(artAt));
  const stillOk = Date.parse(artAt) + ORPHAN_RUNNING_LEASE_MS;
  assert.equal(
    reconcileOrphanRunning(run, { now: stillOk, agentWaiting: false }).steps[0]!
      .status,
    'running',
  );
  const stale = Date.parse(artAt) + ORPHAN_RUNNING_LEASE_MS + 1;
  assert.equal(
    reconcileOrphanRunning(run, { now: stale, agentWaiting: false }).steps[0]!
      .status,
    'failed',
  );
});

test('continuation leased or waiting protects the attempt', () => {
  const run = started('2026-10-26T00:00:00.000Z');
  const now =
    Date.parse('2026-10-26T00:00:00.000Z') + ORPHAN_RUNNING_LEASE_MS + 1;
  for (const continuationStatus of [
    'waiting',
    'queued',
    'leased',
    'delivered',
    'uncertain',
  ] as const) {
    assert.equal(
      reconcileOrphanRunning(run, {
        now,
        agentWaiting: false,
        continuationStatus,
      }).steps[0]!.status,
      'running',
      continuationStatus,
    );
  }
});

test('GET run reconciles once and second GET is idempotent', async () => {
  const store = new Store(':memory:');
  const real = store.reconcileOrphans.bind(store);
  let skew = 0;
  store.reconcileOrphans = (id, context = {}) =>
    real(id, { ...context, now: Date.now() + skew });
  const app = createApp({
    store,
    agentToken: 'test-agent',
    humanToken: 'test-human',
    agentId: 'codex',
  });
  const url = await app.listen(0);
  try {
    const created = await fetch(url + '/api/runs', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-agent',
      },
      body: JSON.stringify({
        commandId: 'create-orphan',
        plan: {
          title: 'HTTP orphan',
          steps: [{ id: 'scan', title: 'Scan', kind: 'agent' }],
        },
      }),
    });
    assert.equal(created.status, 201);
    const run = await created.json();
    const startedRes = await fetch(url + `/api/runs/${run.id}/commands`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer test-agent',
      },
      body: JSON.stringify({
        commandId: 'start-scan',
        type: 'start',
        stepId: 'scan',
      }),
    });
    assert.equal(startedRes.status, 200);
    const before = await startedRes.json();
    assert.equal(before.steps[0].status, 'running');

    skew = ORPHAN_RUNNING_LEASE_MS + 1;
    const first = await fetch(url + `/api/runs/${run.id}`, {
      headers: { authorization: 'Bearer test-agent' },
    });
    assert.equal(first.status, 200);
    const abandoned = await first.json();
    assert.equal(abandoned.steps[0].status, 'failed');
    assert.equal(abandoned.steps[0].result, ORPHAN_ABANDON_MESSAGE);
    assert.ok(
      abandoned.events.some(
        (e: { type: string }) => e.type === ORPHAN_ABANDON_EVENT,
      ),
    );
    const revision = abandoned.revision;

    const second = await fetch(url + `/api/runs/${run.id}`, {
      headers: { authorization: 'Bearer test-agent' },
    });
    const again = await second.json();
    assert.equal(again.revision, revision);
    assert.equal(
      again.events.filter(
        (e: { type: string }) => e.type === ORPHAN_ABANDON_EVENT,
      ).length,
      1,
    );
  } finally {
    await app.close();
  }
});
