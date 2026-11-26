import assert from 'node:assert/strict';
import test from 'node:test';
// @ts-expect-error Desktop modules are exercised directly by Node.
import { LiveAcpChat } from '../desktop/live-acp-chat.mjs';
import { createRun, transition } from '../src/domain/workflow.js';
import {
  ORPHAN_RUNNING_LEASE_MS,
  reconcileOrphanRunning,
} from '../src/domain/orphan-running.js';

test('a pending Desktop permission is not an HTTP wait or workflow progress', async () => {
  const principal = { role: 'agent' as const, id: 'codex' };
  let run = createRun(
    {
      title: 'Synthetic permission wait',
      steps: [{ id: 'work', title: 'Work', kind: 'agent', dependencies: [] }],
    },
    principal.id,
  );
  run = transition(run, { type: 'start', stepId: 'work' }, principal);
  const start = Date.parse(run.steps[0]!.startedAt!);
  const before = structuredClone(run);
  const chat = new LiveAcpChat({ harness: 'codex', onEvent() {} });
  chat.runId = run.id;
  chat.threadId = 'synthetic-session';
  chat.turnId = 'synthetic-turn';
  const permission = chat.requestPermission({
    sessionId: chat.threadId,
    toolCall: { toolCallId: 'tool-1', title: 'Permission needed' },
    options: [{ kind: 'allow_once', optionId: 'once' }],
  });
  try {
    assert.equal(chat.pendingApprovals.size, 1);
    assert.deepEqual(run, before, 'The permission did not record progress');
    const readAfterWait = reconcileOrphanRunning(run, {
      now: start + ORPHAN_RUNNING_LEASE_MS + 1,
      agentWaiting: false,
    });
    assert.equal(readAfterWait.steps[0]!.status, 'failed');
    assert.equal(readAfterWait.events.at(-1)!.type, 'abandon');
    assert.equal(chat.pendingApprovals.size, 1);
    assert.equal(chat.turnId, 'synthetic-turn');
  } finally {
    chat.dispose();
    assert.deepEqual(await permission, { outcome: { outcome: 'cancelled' } });
  }
});
