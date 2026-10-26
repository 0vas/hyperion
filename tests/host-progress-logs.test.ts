import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, transition } from '../src/domain/workflow.js';

const agent = { role: 'agent' as const, id: 'codex' };

test('synthetic host work can log progress then fail on timeout without leaving running', () => {
  let run = createRun(
    {
      title: 'Host scan',
      steps: [{ id: 'scan', title: 'Scan folders', kind: 'agent' }],
    },
    agent.id,
  );
  run = transition(run, { type: 'start', stepId: 'scan' }, agent);
  const attempt = run.steps.find((s) => s.id === 'scan')!.attempt;
  assert.equal(run.steps[0]!.status, 'running');
  assert.ok(attempt >= 1);

  run = transition(
    run,
    {
      type: 'log',
      stepId: 'scan',
      message: 'Opening Documents for size scan',
      attempt,
      trace: { kind: 'action', tool: 'computer_use' },
      commandId: 'scan-log-intent',
    },
    agent,
  );
  run = transition(
    run,
    {
      type: 'log',
      stepId: 'scan',
      message: 'still scanning… 40 folders',
      attempt,
      trace: { kind: 'observation' },
      commandId: 'scan-log-heartbeat',
    },
    agent,
  );
  run = transition(
    run,
    {
      type: 'fail',
      stepId: 'scan',
      message: 'Host tool timed out after 170s',
      attempt,
      commandId: 'scan-fail-timeout',
    },
    agent,
  );

  const step = run.steps.find((s) => s.id === 'scan')!;
  assert.equal(step.status, 'failed');
  assert.match(step.result || '', /timed out/i);
  const logs = run.events.filter(
    (e) => e.stepId === 'scan' && e.type === 'log',
  );
  assert.ok(logs.length >= 2, 'expected material + heartbeat logs');
  assert.ok(
    run.events.some((e) => e.stepId === 'scan' && e.type === 'fail'),
    'expected fail event',
  );
});
