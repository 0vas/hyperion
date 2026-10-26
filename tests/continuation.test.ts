import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../src/server/app.js';
import { Store } from '../src/server/store.js';
import { HyperionClient } from '../src/adapters/client.js';

test('approval wakes the subscribed coordinator without a chat nudge', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'codex',
    getAgentTokens: () => ({ codex: 'agent' }),
  });
  const url = await app.listen(0);
  const agent = new HyperionClient({ url, token: 'agent' });
  const human = new HyperionClient({ url, token: 'human' });
  try {
    const run = await agent.create({
      title: 'Approve and continue',
      steps: [
        { id: 'gate', title: 'Gate', kind: 'approval' },
        {
          id: 'work',
          title: 'After gate',
          kind: 'agent',
          dependencies: ['gate'],
        },
      ],
    });
    const waiter = agent.wait(run.id, run.revision, 2);
    for (let i = 0; i < 100 && !(await agent.get(run.id)).agentWaiting; i++)
      await delay(10);
    assert.equal((await agent.get(run.id)).agentWaiting, true);
    await human.command(run.id, {
      type: 'approve',
      stepId: 'gate',
      expectedRevision: run.revision,
    });
    const update = await waiter;
    assert.equal(update.steps[1]!.status, 'ready');
    assert.equal((await agent.get(run.id)).agentWaiting, false);
  } finally {
    await app.close();
    store.close();
  }
});

test('confirmation wakes the subscribed coordinator without polling or an extra human message', async () => {
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'codex',
    getAgentTokens: () => ({ codex: 'agent', other: 'other' }),
  });
  const url = await app.listen(0);
  const agent = new HyperionClient({ url, token: 'agent' });
  const human = new HyperionClient({ url, token: 'human' });
  try {
    const run = await agent.create({
      title: 'Confirm and continue',
      steps: [
        {
          id: 'answer',
          title: 'Input',
          kind: 'manual',
          outputs: [{ name: 'answer', type: 'string', required: true }],
        },
        {
          id: 'work',
          title: 'Use answer',
          kind: 'agent',
          dependencies: ['answer'],
        },
      ],
    });
    const endpoint = `${url}/api/runs/${run.id}/wait?afterRevision=${run.revision}&timeoutSeconds=2`;
    assert.equal(
      (await fetch(endpoint, { headers: { authorization: 'Bearer human' } }))
        .status,
      403,
    );
    assert.equal(
      (await fetch(endpoint, { headers: { authorization: 'Bearer other' } }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(endpoint + '&unexpected=true', {
          headers: { authorization: 'Bearer agent' },
        })
      ).status,
      400,
    );
    const waiter = agent.wait(run.id, run.revision, 2);
    for (let i = 0; i < 100 && !(await agent.get(run.id)).agentWaiting; i++)
      await delay(10);
    assert.equal((await agent.get(run.id)).agentWaiting, true);
    await human.command(run.id, {
      type: 'submit',
      stepId: 'answer',
      outputs: { answer: 'My choice' },
      expectedRevision: run.revision,
    });
    const update = await waiter;
    assert.equal(update.steps[1]!.status, 'ready');
    assert.deepEqual(update.steps[0]!.outputValues, { answer: 'My choice' });
    assert.equal((await agent.get(run.id)).agentWaiting, false);
    assert.equal(
      (await agent.command(run.id, { type: 'start', stepId: 'work' })).steps[1]!
        .status,
      'running',
    );
    const current = await agent.get(run.id);
    const timeout = await agent.wait(run.id, current.revision, 0.02);
    assert.equal(timeout.revision, current.revision);
    assert.equal((await agent.get(run.id)).agentWaiting, false);
    const aborted = new AbortController();
    const disconnected = fetch(
      `${url}/api/runs/${run.id}/wait?afterRevision=${current.revision}&timeoutSeconds=2`,
      { headers: { authorization: 'Bearer agent' }, signal: aborted.signal },
    ).catch(() => null);
    for (let i = 0; i < 100 && !(await agent.get(run.id)).agentWaiting; i++)
      await delay(10);
    aborted.abort();
    await disconnected;
    for (let i = 0; i < 100 && (await agent.get(run.id)).agentWaiting; i++)
      await delay(10);
    assert.equal((await agent.get(run.id)).agentWaiting, false);
  } finally {
    await app.close();
    store.close();
  }
});
