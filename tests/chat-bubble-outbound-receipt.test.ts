import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isOutboundReceiptStatus,
  outboundReceiptKey,
  outboundReceiptMessage,
} from '../src/client/chat-bubble-outbound-receipt.js';

test('only terminal outbound statuses become thread receipts', () => {
  assert.equal(isOutboundReceiptStatus('delivered'), true);
  assert.equal(isOutboundReceiptStatus('failed'), true);
  assert.equal(isOutboundReceiptStatus('uncertain'), true);
  assert.equal(isOutboundReceiptStatus('queued'), false);
  assert.equal(isOutboundReceiptStatus('leased'), false);
});

test('receipt messages stay delivery-ack honest', () => {
  assert.match(
    outboundReceiptMessage({ status: 'delivered', harness: 'codex' }),
    /aceptada|accepted/i,
  );
  assert.match(
    outboundReceiptMessage({ status: 'delivered', harness: 'codex' }),
    /no prueba|MCP/,
  );
  assert.match(
    outboundReceiptMessage({ status: 'failed', harness: 'cursor' }),
    /falló|no inventa/,
  );
  assert.match(
    outboundReceiptMessage({ status: 'uncertain', harness: 'cursor' }),
    /ambigua|reconciliar/,
  );
});

test('receipt keys dedupe by job and status', () => {
  assert.equal(
    outboundReceiptKey({
      status: 'delivered',
      kind: 'continuation_prompt',
      connectorId: 'c',
      harness: 'codex',
      updatedAt: 1,
      jobId: 'job-1',
    }),
    'job-1:delivered',
  );
});
