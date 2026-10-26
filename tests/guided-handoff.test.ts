import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/server/store.js';
import { createApp } from '../src/server/app.js';
import { HyperionClient } from '../src/adapters/client.js';

const choice = {
  title: 'Choose an application',
  steps: [
    {
      id: 'choose',
      title: 'Choose product',
      kind: 'manual',
      outputs: [
        {
          name: 'product',
          type: 'string',
          required: true,
          form: {
            hint: 'Escribe Toolbox, IntelliJ IDEA, PyCharm, WebStorm, Rider u otro. Si no sabes cuál, indica qué lenguaje usarás.',
          },
        },
      ],
    },
    {
      id: 'work',
      title: 'Use the decision',
      kind: 'agent',
      dependencies: ['choose'],
    },
  ],
};
test('known choices written as an instruction are rejected before creating a broken form', () => {
  const store = new Store(':memory:');
  try {
    assert.throws(
      () => store.create(choice, { role: 'agent', id: 'codex' }, 'bad'),
      /CHOICES_REQUIRE_OPTIONS.*choose.*product.*form.options/,
    );
    assert.equal(store.list().length, 0);
    const fixed = structuredClone(choice);
    Object.assign(fixed.steps[0]!.outputs![0]!.form, {
      options: [
        { value: 'idea', label: 'IntelliJ IDEA' },
        { value: 'other', label: 'Otro / Necesito ayuda' },
      ],
    });
    assert.equal(
      store.create(fixed, { role: 'agent', id: 'codex' }, 'good').steps[0]!
        .status,
      'waiting',
    );
    const open = structuredClone(choice);
    open.steps[0]!.outputs![0]!.form.hint =
      'Describe el proyecto, sus recursos y contactos.';
    assert.equal(
      store.create(open, { role: 'agent', id: 'codex' }, 'open').steps[0]!
        .status,
      'waiting',
    );
  } finally {
    store.close();
  }
});

test('guided handoff renews timed out waits and returns saved input for immediate execution', async () => {
  const { followHumanInput, handoff } =
    await import('../src/adapters/handoff.js');
  const store = new Store(':memory:');
  const app = createApp({
    store,
    agentId: 'codex',
    agentToken: 'agent',
    humanToken: 'human',
  });
  const url = await app.listen(0);
  const agent = new HyperionClient({ url, token: 'agent' });
  const human = new HyperionClient({ url, token: 'human' });
  try {
    const run = await agent.create({
      title: 'Connected form',
      steps: [
        {
          id: 'choose',
          title: 'Choose',
          kind: 'manual',
          outputs: [
            {
              name: 'product',
              type: 'string',
              required: true,
              form: { options: [{ value: 'idea', label: 'IntelliJ IDEA' }] },
            },
          ],
        },
        {
          id: 'work',
          title: 'Use answer',
          kind: 'agent',
          dependencies: ['choose'],
        },
      ],
    });
    assert.equal(handoff(run).action, 'wait');
    let renewals = 0;
    let announcements = 0;
    const originalWait = agent.wait.bind(agent);
    agent.wait = async (...args) => {
      if (++renewals === 3)
        await human.command(run.id, {
          type: 'submit',
          stepId: 'choose',
          outputs: { product: 'idea' },
          expectedRevision: run.revision,
        });
      return originalWait(...args);
    };
    const updated = await followHumanInput(
      agent,
      run,
      () => {
        announcements++;
      },
      { waitSeconds: 0.01, maxSeconds: 2 },
    );
    assert.equal(renewals, 3);
    assert.equal(announcements, 1);
    assert.equal(handoff(updated).action, 'execute');
    assert.deepEqual(handoff(updated).stepIds, ['work']);
    assert.match(handoff(updated).instruction || '', /ALL ready|listo/i);
    assert.deepEqual(updated.steps[0]!.outputValues, { product: 'idea' });
    assert.equal(updated.steps[1]!.status, 'ready');
    assert.equal(updated.steps[1]!.attempt, 0); // The integration never pretends to perform the actual work.
    assert.equal((await agent.get(run.id)).agentWaiting, false);
    const paused = await human.command(run.id, {
      type: 'pause',
      expectedRevision: updated.revision,
    });
    assert.equal(handoff(paused).action, 'paused');
    assert.equal(
      (await followHumanInput(agent, paused, () => {})).revision,
      paused.revision,
    );
  } finally {
    await app.close();
    store.close();
  }
});

test('a bounded guide returns a wait instruction without approving or executing on timeout', async () => {
  const { followHumanInput, handoff } =
    await import('../src/adapters/handoff.js');
  const store = new Store(':memory:');
  try {
    const run = store.create(
      {
        title: 'Wait',
        steps: [{ id: 'choose', title: 'Choose', kind: 'manual' }],
      },
      { role: 'agent', id: 'codex' },
      'wait',
    );
    const client = {
      get: async () => run,
      wait: async () => run,
    } as unknown as HyperionClient;
    const result = await followHumanInput(client, run, () => {}, {
      maxSeconds: 0,
    });
    assert.equal(result.revision, run.revision);
    assert.equal(handoff(result).action, 'wait');
    assert.equal(result.steps[0]!.status, 'waiting');
  } finally {
    store.close();
  }
});

test('new choice forms in a plan revision are checked without changing saved history', () => {
  const store = new Store(':memory:');
  const actor = { role: 'agent' as const, id: 'codex' };
  try {
    const initial = store.create(
      {
        title: choice.title,
        steps: [{ id: 'work', title: 'Use the decision', kind: 'agent' }],
      },
      actor,
      'initial',
    );
    assert.throws(
      () =>
        store.command(
          initial.id,
          {
            type: 'revise',
            plan: choice,
            message: 'Add product selection',
            expectedRevision: initial.revision,
            commandId: 'revise',
          },
          actor,
        ),
      /CHOICES_REQUIRE_OPTIONS/,
    );
    assert.equal(store.get(initial.id).revision, initial.revision);
    const open = structuredClone(choice);
    open.steps[0]!.title = 'Describe project';
    open.steps[0]!.outputs![0]!.form.hint =
      'Escribe un resumen, con objetivos o referencias.';
    assert.equal(
      store.create(open, actor, 'open-description').steps[0]!.status,
      'waiting',
    );
  } finally {
    store.close();
  }
});

test('a response arriving at the wait deadline is read before returning a stale handoff', async () => {
  const { followHumanInput } = await import('../src/adapters/handoff.js');
  const store = new Store(':memory:');
  try {
    const run = store.create(
      {
        title: 'Late answer',
        steps: [
          { id: 'input', title: 'Your answer', kind: 'manual' },
          {
            id: 'work',
            title: 'Use answer',
            kind: 'agent',
            dependencies: ['input'],
          },
        ],
      },
      { role: 'agent', id: 'codex' },
      'create',
    );
    let reads = 0;
    const client = {
      get: async () => {
        if (++reads === 2)
          return store.command(
            run.id,
            {
              type: 'submit',
              stepId: 'input',
              message: 'Saved just before disconnect',
              expectedRevision: 1,
              commandId: 'answer',
            },
            { role: 'human', id: 'user' },
          );
        return run;
      },
    } as unknown as HyperionClient;
    const result = await followHumanInput(client, run, () => {}, {
      maxSeconds: 0,
    });
    assert.equal(result.steps[1]!.status, 'ready');
  } finally {
    store.close();
  }
});

test('an expired guide reports disconnection rather than directing an endless wait loop', async () => {
  const { withGuideResult } = await import('../src/adapters/handoff.js');
  const store = new Store(':memory:');
  try {
    const run = store.create(
      {
        title: 'Waiting',
        steps: [{ id: 'input', title: 'Input', kind: 'manual' }],
      },
      { role: 'agent', id: 'codex' },
      'create',
    );
    const result = withGuideResult(run);
    assert.equal(result.agentNext.action, 'disconnected');
    assert.match(result.agentNext.instruction, /ended|closed/i);
    assert.equal(
      withGuideResult({
        ...run,
        continuation: {
          status: 'waiting',
          connectorId: 'real-bridge',
          harness: 'codex',
          scope: 'managed-session',
          updatedAt: 1,
        },
      }).agentNext.action,
      'suspended',
    );
  } finally {
    store.close();
  }
});
