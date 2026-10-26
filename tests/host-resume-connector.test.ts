import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readHostResumeConnector } from '../src/client/host-resume-connector.js';
import {
  canSendNewBeginningToChat,
  outboundSendConfiguredFromResumeConnector,
} from '../src/client/next-cycle-send.js';

const validConnector = {
  id: 'fixture-bridge',
  harness: 'codex',
  sessionId: 'sess-fixture',
  scope: 'managed-session' as const,
  capabilities: { resume: true as const, idempotentDelivery: true as const },
};

test('readHostResumeConnector never invents a connector', () => {
  assert.equal(readHostResumeConnector(), undefined);
});

test('wake Enviar gate follows host connector + harness match', () => {
  assert.equal(
    canSendNewBeginningToChat({
      resumeConnector: validConnector,
      runHarness: 'codex',
      outboundSendConfigured: outboundSendConfiguredFromResumeConnector(
        validConnector,
        'codex',
      ),
    }),
    true,
  );
  assert.equal(
    canSendNewBeginningToChat({
      resumeConnector: validConnector,
      runHarness: 'cursor',
      outboundSendConfigured: outboundSendConfiguredFromResumeConnector(
        validConnector,
        'cursor',
      ),
    }),
    false,
  );
  assert.equal(
    canSendNewBeginningToChat({
      resumeConnector: undefined,
      runHarness: 'codex',
    }),
    false,
  );
});

test('App wires continuation Enviar to outbound enqueue and keeps new-beginning hidden', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /readHostResumeConnector/);
  assert.match(source, /outboundSendConfiguredFromResumeConnector/);
  assert.match(source, /\/outbound-prompts/);
  assert.match(source, /continuationClipboardBody\(t, run\)/);
  assert.match(source, /kind: 'continuation_prompt'/);
  assert.match(
    source,
    /Continuación encolada para el conector\. Eso no significa que el agente haya ejecutado el trabajo\./,
  );
  assert.match(source, /sendWakeContinuation/);
  // New-beginning / linked_cycle still hard-gated off.
  assert.match(source, /linked_cycle_prompt Enviar is a later cut/);
  assert.doesNotMatch(source, /ADR 0036/);
});
