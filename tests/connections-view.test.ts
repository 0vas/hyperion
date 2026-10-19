import assert from 'node:assert/strict';
import test from 'node:test';
import { connectionsSummaryLine } from '../src/client/Connections.js';

test('connections summary distinguishes empty, partial, all-ok and conflict states', () => {
  assert.match(
    connectionsSummaryLine({ configured: 0, conflicts: 0, total: 5 }),
    /0.*5/,
  );
  assert.match(
    connectionsSummaryLine({ configured: 2, conflicts: 0, total: 5 }),
    /2.*5|2 of 5/,
  );
  assert.match(
    connectionsSummaryLine({ configured: 5, conflicts: 0, total: 5 }),
    /5/,
  );
  assert.match(
    connectionsSummaryLine({ configured: 1, conflicts: 2, total: 5 }),
    /conflicto|conflict/,
  );
});

test('configuration counts never imply chat readiness or require a restart', () => {
  for (const configured of [0, 2, 5]) {
    const value = connectionsSummaryLine({
      configured,
      conflicts: 0,
      total: 5,
    });
    assert.doesNotMatch(value, /listas|ready|reinicia|restart/i);
    assert.match(value, /configurad|configured/i);
  }
  assert.match(
    connectionsSummaryLine({ configured: 0, conflicts: 2, total: 5 }),
    /0.*2/,
  );
});
