import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasOrphanRunning,
  hasPermissionStall,
  latestStepEvidence,
  looksLikePermissionDenial,
  stuckRunningKind,
} from '../src/client/stuck-running.js';

test('permission denial heuristics match host access blocks without inventing failures', () => {
  assert.equal(looksLikePermissionDenial('Documents access denied'), true);
  assert.equal(looksLikePermissionDenial('Acceso denegado a Documentos'), true);
  assert.equal(looksLikePermissionDenial('EACCES reading folder'), true);
  assert.equal(looksLikePermissionDenial('Scanned 12 folders'), false);
});

test('stuckRunningKind is honest when the chat is not waiting', () => {
  assert.equal(
    stuckRunningKind({ agentWaiting: true, permissionLike: true }),
    'active-wait',
  );
  assert.equal(
    stuckRunningKind({ agentWaiting: false, permissionLike: true }),
    'permission',
  );
  assert.equal(
    stuckRunningKind({ agentWaiting: false, permissionLike: false }),
    'stuck',
  );
});

test('orphan running detection ignores active waits and non-agent steps', () => {
  const steps = [
    { kind: 'agent', status: 'running' },
    { kind: 'manual', status: 'waiting' },
  ];
  assert.equal(hasOrphanRunning(steps, false), true);
  assert.equal(hasOrphanRunning(steps, true), false);
  assert.equal(
    hasOrphanRunning([{ kind: 'manual', status: 'running' }], false),
    false,
  );
});

test('latestStepEvidence reads the newest message for the step', () => {
  assert.equal(
    latestStepEvidence(
      [
        { stepId: 'scan', message: 'started' },
        { stepId: 'other', message: 'noise' },
        { stepId: 'scan', message: 'Documents access denied' },
      ],
      'scan',
    ),
    'Documents access denied',
  );
  assert.equal(latestStepEvidence([], 'scan'), '');
});

test('permission stall banner fixture: running + denied log + no wait', () => {
  const steps = [
    { id: 'scan', kind: 'agent', status: 'running' },
    { id: 'ask', kind: 'manual', status: 'completed' },
  ];
  const denied = [{ stepId: 'scan', message: 'Documents access denied' }];
  assert.equal(hasPermissionStall(steps, denied, false), true);
  assert.equal(hasPermissionStall(steps, denied, true), false);
  assert.equal(
    hasPermissionStall(steps, [{ stepId: 'scan', message: 'Scanning…' }], false),
    false,
  );
  assert.equal(
    hasPermissionStall(
      [{ id: 'scan', kind: 'agent', status: 'ready' }],
      denied,
      false,
    ),
    false,
  );
});
