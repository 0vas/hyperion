import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  showResultadoWakeContinuationCta,
  showWakeContinuationCta,
} from '../src/client/wake-continuation-cta.js';

test('wake CTA shows only when agentWaiting is false and readyAgentCount ≥ 1', () => {
  assert.equal(
    showWakeContinuationCta({
      live: true,
      agentWaiting: false,
      readyAgentCount: 2,
    }),
    true,
  );
  // Live wait open → no nag CTA (case A).
  assert.equal(
    showWakeContinuationCta({
      live: true,
      agentWaiting: true,
      readyAgentCount: 2,
    }),
    false,
  );
  // Approval/manual ready alone must pass readyAgentCount 0 from the caller.
  assert.equal(
    showWakeContinuationCta({
      live: true,
      agentWaiting: false,
      readyAgentCount: 0,
    }),
    false,
  );
  assert.equal(
    showWakeContinuationCta({
      live: false,
      agentWaiting: false,
      readyAgentCount: 1,
    }),
    false,
  );
});

test('wake CTA yields to human forms and durable continuation', () => {
  assert.equal(
    showWakeContinuationCta({
      live: true,
      agentWaiting: false,
      readyAgentCount: 1,
      humanWaitingCount: 1,
    }),
    false,
  );
  assert.equal(
    showWakeContinuationCta({
      live: true,
      agentWaiting: false,
      readyAgentCount: 1,
      hasDurableContinuation: true,
    }),
    false,
  );
});

test('Resultado wake CTA only on ready agent while wait closed', () => {
  assert.equal(
    showResultadoWakeContinuationCta({
      live: true,
      agentWaiting: false,
      stepKind: 'agent',
      stepStatus: 'ready',
    }),
    true,
  );
  assert.equal(
    showResultadoWakeContinuationCta({
      live: true,
      agentWaiting: true,
      stepKind: 'agent',
      stepStatus: 'ready',
    }),
    false,
  );
  assert.equal(
    showResultadoWakeContinuationCta({
      live: true,
      agentWaiting: false,
      stepKind: 'manual',
      stepStatus: 'ready',
    }),
    false,
  );
});
