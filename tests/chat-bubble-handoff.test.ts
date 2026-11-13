import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bubbleSendBlockedReason,
  buildBubbleHandoffText,
  canBubbleCopy,
  canBubbleSend,
} from '../src/client/chat-bubble-handoff.js';

const connector = {
  id: 'local-bridge',
  harness: 'cursor',
  sessionId: 'sess-1',
  scope: 'managed-session' as const,
  capabilities: { resume: true as const, idempotentDelivery: true as const },
};

test('Copiar needs prompt + selected client; Enviar needs configured + matching ResumeConnector + run', () => {
  assert.equal(canBubbleCopy('', 'cursor'), false);
  assert.equal(canBubbleCopy('usa hyperion', ''), false);
  assert.equal(canBubbleCopy('usa hyperion', 'cursor'), true);

  assert.equal(
    canBubbleSend({
      prompt: 'usa hyperion',
      selectedClientId: 'cursor',
      selectedStatus: 'configured',
      resumeConnector: connector,
      runId: 'run-1',
      runCoordinator: 'cursor',
    }),
    true,
  );
  assert.equal(
    canBubbleSend({
      prompt: 'usa hyperion',
      selectedClientId: 'cursor',
      selectedStatus: 'configured',
      resumeConnector: connector,
      runId: 'run-1',
      runCoordinator: 'codex',
    }),
    false,
    'selected client must match run coordinator',
  );
  assert.equal(
    canBubbleSend({
      prompt: 'usa hyperion',
      selectedClientId: 'cursor',
      selectedStatus: 'configured',
      resumeConnector: connector,
    }),
    false,
    'no run → no Enviar',
  );
  assert.equal(
    canBubbleSend({
      prompt: 'usa hyperion',
      selectedClientId: 'cursor',
      selectedStatus: 'conflict',
      resumeConnector: connector,
      runId: 'run-1',
    }),
    false,
    'conflict stays non-sendable',
  );
  assert.equal(
    canBubbleSend({
      prompt: 'usa hyperion',
      selectedClientId: 'cursor',
      selectedStatus: 'missing',
      resumeConnector: connector,
      runId: 'run-1',
    }),
    false,
  );
  assert.equal(
    canBubbleSend({
      prompt: 'usa hyperion',
      selectedClientId: 'codex',
      selectedStatus: 'configured',
      resumeConnector: connector,
      runId: 'run-1',
    }),
    false,
    'harness mismatch',
  );
  assert.equal(
    canBubbleSend({
      prompt: 'usa hyperion',
      selectedClientId: 'cursor',
      selectedStatus: 'configured',
      resumeConnector: undefined,
      runId: 'run-1',
    }),
    false,
  );
});

test('blocked reasons stay honest (no tools-loaded / wake claim)', () => {
  const reason = bubbleSendBlockedReason({
    prompt: 'x',
    selectedClientId: 'cursor',
    selectedStatus: 'configured',
    resumeConnector: undefined,
    runId: 'run-1',
  });
  assert.match(reason, /conector de reanudación|Copiar no equivale/i);
  assert.doesNotMatch(reason, /conectado|connected|tools loaded/i);

  const conflict = bubbleSendBlockedReason({
    prompt: 'x',
    selectedClientId: 'codex',
    selectedStatus: 'conflict',
    resumeConnector: connector,
    runId: 'run-1',
  });
  assert.match(conflict, /configurada localmente/i);
});

test('handoff text includes request and optional canvas URL without wake claims', () => {
  const text = buildBubbleHandoffText({
    prompt: 'preparar una guía',
    runUrl: 'http://127.0.0.1:4318/?run=abc',
    translate: (message, values) =>
      message.replace('{0}', String(values?.[0] ?? '')),
  });
  assert.match(text, /preparar una guía/);
  assert.match(text, /http:\/\/127\.0\.0\.1:4318\/\?run=abc/);
  assert.doesNotMatch(text, /despierta|wake|tools loaded/i);
});
