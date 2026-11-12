import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, transition } from '../src/domain/workflow.js';

const agent = { role: 'agent' as const, id: 'codex' };
const human = { role: 'human' as const, id: 'local-user' };

const plan = {
  title: 'Amend a saved answer',
  steps: [
    {
      id: 'answer',
      title: 'Decide',
      kind: 'manual',
      outputs: [{ name: 'choice', type: 'string', required: true }],
    },
    {
      id: 'work',
      title: 'Work',
      kind: 'agent',
      dependencies: ['answer'],
      inputs: [
        {
          name: 'choice',
          type: 'string',
          required: true,
          source: { stepId: 'answer', output: 'choice' },
        },
      ],
    },
    {
      id: 'review',
      title: 'Review',
      kind: 'approval',
      dependencies: ['work'],
    },
  ],
};

function submitted() {
  let run = createRun(plan, agent.id);
  run = transition(
    run,
    {
      type: 'submit',
      stepId: 'answer',
      outputs: { choice: 'first' },
      expectedRevision: run.revision,
    },
    human,
  );
  return run;
}

test('amend happy path without irreversible descendants does not require acknowledge', () => {
  let run = submitted();
  const before = run.revision;
  run = transition(
    run,
    {
      type: 'amend',
      stepId: 'answer',
      outputs: { choice: 'corrected' },
      message: 'Typo fix',
      expectedRevision: run.revision,
      commandId: 'amend-1',
    },
    human,
  );
  assert.equal(run.revision, before + 1);
  assert.deepEqual(run.steps[0]!.outputValues, { choice: 'corrected' });
  assert.equal(run.steps[0]!.status, 'completed');
  assert.equal(run.steps[1]!.status, 'ready');
  const amend = run.events.find((e) => e.type === 'amend');
  assert.ok(amend);
  assert.match(amend!.message, /Typo fix/);
  assert.match(amend!.message, /first/);
});

test('amend is human-only and rejects agents', () => {
  const run = submitted();
  assert.throws(
    () =>
      transition(
        run,
        {
          type: 'amend',
          stepId: 'answer',
          outputs: { choice: 'nope' },
          message: 'Agent must not amend',
          expectedRevision: run.revision,
          commandId: 'agent-amend',
        },
        agent,
      ),
    /human/i,
  );
});

test('amend requires expectedRevision and rejects stale revision', () => {
  const run = submitted();
  assert.throws(
    () =>
      transition(
        run,
        {
          type: 'amend',
          stepId: 'answer',
          outputs: { choice: 'x' },
          message: 'Missing revision',
          commandId: 'amend-rev',
        },
        human,
      ),
    /revision/i,
  );
  assert.throws(
    () =>
      transition(
        run,
        {
          type: 'amend',
          stepId: 'answer',
          outputs: { choice: 'x' },
          message: 'Stale',
          expectedRevision: run.revision - 1,
          commandId: 'amend-stale',
        },
        human,
      ),
    /revision/i,
  );
});

test('amend requires commandId', () => {
  const run = submitted();
  assert.throws(
    () =>
      transition(
        run,
        {
          type: 'amend',
          stepId: 'answer',
          outputs: { choice: 'x' },
          message: 'No command id',
          expectedRevision: run.revision,
        },
        human,
      ),
    /commandId|command id/i,
  );
});

test('amend rejects terminal runs', () => {
  let run = submitted();
  run = transition(run, { type: 'start', stepId: 'work' }, agent);
  run = transition(
    run,
    { type: 'complete', stepId: 'work', message: 'Done', attempt: 1 },
    agent,
  );
  run = transition(run, { type: 'approve', stepId: 'review' }, human);
  assert.equal(run.status, 'completed');
  assert.throws(
    () =>
      transition(
        run,
        {
          type: 'amend',
          stepId: 'answer',
          outputs: { choice: 'too-late' },
          message: 'After complete',
          expectedRevision: run.revision,
          commandId: 'amend-terminal',
          acknowledgeIrreversible: true,
        },
        human,
      ),
    /terminal/i,
  );
});

test('policy C: non-empty irreversible list requires acknowledgeIrreversible', () => {
  let run = submitted();
  run = transition(run, { type: 'start', stepId: 'work' }, agent);
  run = transition(
    run,
    {
      type: 'complete',
      stepId: 'work',
      message: 'External effect',
      attempt: 1,
    },
    agent,
  );
  assert.throws(
    () =>
      transition(
        run,
        {
          type: 'amend',
          stepId: 'answer',
          outputs: { choice: 'second' },
          message: 'Fix after agent work',
          expectedRevision: run.revision,
          commandId: 'amend-need-ack',
        },
        human,
      ),
    /irreversible|acknowledge/i,
  );
  run = transition(
    run,
    {
      type: 'amend',
      stepId: 'answer',
      outputs: { choice: 'second' },
      message: 'Fix after agent work',
      expectedRevision: run.revision,
      commandId: 'amend-acked',
      acknowledgeIrreversible: true,
    },
    human,
  );
  assert.deepEqual(run.steps[0]!.outputValues, { choice: 'second' });
  assert.equal(run.steps[1]!.status, 'ready');
  assert.ok(run.events.some((e) => e.type === 'complete'));
  assert.ok(run.events.some((e) => e.type === 'amend'));
});

test('amend refuses while a descendant agent step is running', () => {
  let run = submitted();
  run = transition(run, { type: 'start', stepId: 'work' }, agent);
  assert.throws(
    () =>
      transition(
        run,
        {
          type: 'amend',
          stepId: 'answer',
          outputs: { choice: 'during-run' },
          message: 'Too soon',
          expectedRevision: run.revision,
          commandId: 'amend-running',
          acknowledgeIrreversible: true,
        },
        human,
      ),
    /running/i,
  );
});

test('amend is not retry or revise: cannot amend via retry on manual', () => {
  const run = submitted();
  assert.throws(
    () => transition(run, { type: 'retry', stepId: 'answer' }, human),
    /agent/i,
  );
});

test('store deduplicates identical amend commandId and MCP step actions omit amend', async () => {
  const { mkdtempSync, rmSync, readFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Store } = await import('../src/server/store.js');
  const dir = mkdtempSync(join(tmpdir(), 'hyperion-amend-'));
  const db = new Store(join(dir, 'db.sqlite'));
  try {
    let run = db.create(plan, agent, 'create-amend');
    run = db.command(
      run.id,
      {
        type: 'submit',
        stepId: 'answer',
        outputs: { choice: 'first' },
        expectedRevision: run.revision,
        commandId: 'submit-1',
      },
      human,
    );
    const amend = {
      type: 'amend' as const,
      stepId: 'answer',
      outputs: { choice: 'second' },
      message: 'Fix',
      expectedRevision: run.revision,
      commandId: 'amend-dup',
    };
    const once = db.command(run.id, amend, human);
    assert.deepEqual(db.command(run.id, amend, human), once);
    assert.equal(once.events.filter((e) => e.type === 'amend').length, 1);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
  const mcp = readFileSync(
    new URL('../src/adapters/mcp.ts', import.meta.url),
    'utf8',
  );
  assert.match(
    mcp,
    /action: z\.enum\(\['start', 'complete', 'fail', 'log', 'retry'\]\)/,
  );
  assert.doesNotMatch(
    mcp.slice(
      mcp.indexOf("'hyperion_step'"),
      mcp.indexOf("'hyperion_revise_plan'"),
    ),
    /\bamend\b/,
  );
});
