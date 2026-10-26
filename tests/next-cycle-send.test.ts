import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canSendNewBeginningToChat } from '../src/client/next-cycle-send.js';

test('Enviar stays off without an explicit outbound send path', () => {
  assert.equal(canSendNewBeginningToChat(), false);
  assert.equal(canSendNewBeginningToChat({}), false);
  assert.equal(
    canSendNewBeginningToChat({
      continuation: {
        status: 'waiting',
        connectorId: 'local-bridge',
        harness: 'claude-code',
        scope: 'managed-session',
        updatedAt: 1,
      },
    }),
    false,
    'resume binding alone must not invent linked-cycle send',
  );
  assert.equal(
    canSendNewBeginningToChat({ outboundSendConfigured: true }),
    true,
  );
});

test('next-cycle UI keeps Copiar primary and Enviar gated', () => {
  const source = readFileSync(resolve('src/client/App.tsx'), 'utf8');
  assert.match(source, /canSendNewBeginningToChat/);
  assert.match(source, /Copiar petición para el chat/);
  assert.match(source, /Enviar al chat/);
  assert.match(source, /className="primary full"/);
  assert.match(source, /disabled=\{!canSend \|\| !nextRequest\.trim\(\)\}/);
  assert.match(source, /Copiar no equivale a entregar/);
  assert.match(source, /Hyperion no avisó al agente/);
  assert.doesNotMatch(source, /ADR 0036/);
});
