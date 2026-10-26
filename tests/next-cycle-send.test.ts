import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  canSendNewBeginningToChat,
  outboundSendConfiguredFromResumeConnector,
} from '../src/client/next-cycle-send.js';

const validConnector = {
  id: 'local-bridge',
  harness: 'claude-code',
  sessionId: 'sess-1',
  scope: 'managed-session' as const,
  capabilities: { resume: true as const, idempotentDelivery: true as const },
};

test('outbound send requires a real ResumeConnector, not continuation or inventory cues', () => {
  assert.equal(outboundSendConfiguredFromResumeConnector(undefined), false);
  assert.equal(outboundSendConfiguredFromResumeConnector({}), false);
  assert.equal(
    outboundSendConfiguredFromResumeConnector({
      id: 'x',
      harness: 'claude-code',
      sessionId: 's',
      scope: 'managed-session',
      capabilities: { resume: true },
    }),
    false,
    'missing idempotentDelivery',
  );
  assert.equal(outboundSendConfiguredFromResumeConnector(validConnector), true);
  assert.equal(
    outboundSendConfiguredFromResumeConnector(validConnector, 'cursor'),
    false,
    'harness must match the run',
  );
  assert.equal(
    outboundSendConfiguredFromResumeConnector(validConnector, 'claude-code'),
    true,
  );
});

test('Enviar stays off without outboundSendConfigured (Phase 0)', () => {
  assert.equal(canSendNewBeginningToChat(), false);
  assert.equal(
    canSendNewBeginningToChat({ outboundSendConfigured: false }),
    false,
  );
  assert.equal(
    canSendNewBeginningToChat({ outboundSendConfigured: true }),
    true,
  );
  assert.equal(
    canSendNewBeginningToChat({ resumeConnector: validConnector }),
    true,
  );
});

test('next-cycle UI hides linked-cycle Enviar and shows Designer helper', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /canSendNewBeginningToChat/);
  assert.match(source, /linked_cycle_prompt Enviar is a later cut/);
  assert.match(source, /outboundSendConfigured: false/);
  assert.match(source, /Copiar petición para el chat/);
  assert.match(
    source,
    /Pega la petición en el chat conectado\. El envío automático al chat requiere un conector de envío; MCP solo no despierta el chat\./,
  );
  assert.match(source, /Pega la petición en tu chat/);
  assert.doesNotMatch(source, /continuation: run\.continuation/);
  assert.doesNotMatch(source, /Continuar con Claude/);
  assert.doesNotMatch(source, /ADR 0036/);
});
