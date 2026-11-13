import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESKTOP_CLIENTS } from '../src/adapters/connection-status.js';
import type { ConnectionInventory } from '../src/client/Connections.js';
import {
  bubbleConnectionOptionLabel,
  bubbleConnectionOptions,
  bubbleOptionClaimsLiveConnection,
  bubbleStatusIsHonest,
} from '../src/client/chat-bubble-picker.js';
import { connectionStatusLabel } from '../src/client/Connections.js';

const inventory: ConnectionInventory = {
  version: '2026.11.12.0000',
  channel: 'preview',
  serviceUrl: 'http://127.0.0.1:4318',
  summary: { configured: 1, conflicts: 1, total: 5 },
  integrations: [
    { id: 'codex', name: 'Codex', status: 'conflict' },
    { id: 'cursor', name: 'Cursor', status: 'configured' },
    { id: 'claude-desktop', name: 'Claude Desktop', status: 'missing' },
    { id: 'claude-code', name: 'Claude Code', status: 'unknown' },
    { id: 'antigravity', name: 'Antigravity', status: 'missing' },
  ],
};

test('bubble picker lists DESKTOP_CLIENTS rows with honest Conexiones statuses', () => {
  const rows = bubbleConnectionOptions(inventory);
  assert.deepEqual(
    rows.map((row) => row.id),
    [...DESKTOP_CLIENTS],
  );
  for (const row of rows) {
    assert.equal(bubbleStatusIsHonest(row.status), true);
    const label = bubbleConnectionOptionLabel(row);
    assert.match(label, new RegExp(`^${row.name} — `));
    assert.equal(bubbleOptionClaimsLiveConnection(label), false);
    assert.ok(
      label.includes(connectionStatusLabel(row.status)),
      `expected ${label} to include ${connectionStatusLabel(row.status)}`,
    );
  }
  assert.match(
    bubbleConnectionOptionLabel({ name: 'Cursor', status: 'configured' }),
    /Configurada localmente/,
  );
  assert.doesNotMatch(
    bubbleConnectionOptionLabel({ name: 'Cursor', status: 'configured' }),
    /conectado|connected/i,
  );
});

test('empty or missing inventory yields no picker rows (no fake connected)', () => {
  assert.deepEqual(bubbleConnectionOptions(null), []);
  assert.deepEqual(bubbleConnectionOptions(undefined), []);
  assert.deepEqual(
    bubbleConnectionOptions({
      ...inventory,
      integrations: [],
      summary: { configured: 0, conflicts: 0, total: 0 },
    }),
    [],
  );
});

test('connectionStatusLabel never claims live chat connection', () => {
  for (const status of [
    'configured',
    'missing',
    'conflict',
    'unknown',
  ] as const) {
    const label = connectionStatusLabel(status);
    assert.equal(bubbleOptionClaimsLiveConnection(label), false);
  }
});
