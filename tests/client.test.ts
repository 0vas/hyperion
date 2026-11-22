import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HyperionClient } from '../src/adapters/client.js';

test('adapter rejects remote targets and unbounded/invalid waits before contacting a server', async () => {
  assert.throws(
    () => new HyperionClient({ url: 'https://example.com', token: 'test' }),
    /local/i,
  );
  const client = new HyperionClient({
    url: 'http://127.0.0.1:1',
    token: 'test',
  });
  for (const seconds of [NaN, Infinity, -1, 56]) {
    await assert.rejects(client.wait('anything', 0, seconds), /timeout/i);
  }
  await assert.rejects(client.wait('anything', NaN, 0), /revision/i);
});

test('a waiting harness receives the real human decision and can resume the dependent task', async () => {
  const { createApp } = await import('../src/server/app.js');
  const { Store } = await import('../src/server/store.js');
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'codex',
  });
  const url = await app.listen(0);
  const agent = new HyperionClient({ url, token: 'agent' });
  const human = new HyperionClient({ url, token: 'human' });
  try {
    const run = await agent.create(
      {
        title: 'Human handoff',
        steps: [
          {
            id: 'choose',
            title: 'Choose',
            kind: 'manual',
            outputs: [{ name: 'product', type: 'string', required: true }],
          },
          {
            id: 'write',
            title: 'Write',
            kind: 'agent',
            dependencies: ['choose'],
            inputs: [
              {
                name: 'product',
                type: 'string',
                required: true,
                source: { stepId: 'choose', output: 'product' },
              },
            ],
          },
        ],
      },
      'create-handoff',
    );
    const unchanged = await agent.wait(run.id, run.revision, 0);
    assert.equal(unchanged.steps[0]!.status, 'waiting');
    const waiting = agent.wait(run.id, run.revision, 5);
    await human.command(run.id, {
      type: 'submit',
      stepId: 'choose',
      outputs: { product: 'idea' },
      expectedRevision: run.revision,
    });
    const resumed = await waiting;
    assert.equal(resumed.steps[1]!.status, 'ready');
    assert.deepEqual(resumed.steps[0]!.outputValues, { product: 'idea' });
    const started = await agent.command(run.id, {
      type: 'start',
      stepId: 'write',
    });
    assert.equal(started.steps[1]!.status, 'running');
  } finally {
    await app.close();
    store.close();
  }
});

test('disconnecting a long wait does not read the store during cleanup', async () => {
  const { createApp } = await import('../src/server/app.js');
  const { Store } = await import('../src/server/store.js');
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentToken: 'agent',
    humanToken: 'human',
    agentId: 'codex',
  });
  const url = await app.listen(0);
  const agent = new HyperionClient({ url, token: 'agent' });
  const abort = new AbortController();
  const originalGet = store.get.bind(store);
  let readsAfterDisconnect = 0;
  try {
    const run = await agent.create(
      {
        title: 'Disconnect wait',
        steps: [{ id: 'work', title: 'Work', kind: 'agent' }],
      },
      'create-disconnect-wait',
    );
    const waiting = fetch(
      `${url}/api/runs/${run.id}/wait?afterRevision=${run.revision}&timeoutSeconds=30`,
      {
        headers: { authorization: 'Bearer agent' },
        signal: abort.signal,
      },
    ).catch(() => undefined);
    for (let attempt = 0; attempt < 25; attempt += 1) {
      if ((await agent.get(run.id)).agentWaiting) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal((await agent.get(run.id)).agentWaiting, true);
    store.get = ((id: string) => {
      readsAfterDisconnect += 1;
      return originalGet(id);
    }) as typeof store.get;
    abort.abort();
    await waiting;
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(readsAfterDisconnect, 0);
  } finally {
    store.get = originalGet;
    await app.close();
    store.close();
  }
});
