import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendHarnessLog } from '../src/adapters/harness-log.js';

test('harness log appends JSONL events without secrets or full plans', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hyperion-harness-'));
  try {
    appendHarnessLog(
      'create_rejected',
      {
        reason:
          'INVALID_PLAN: Required input build_excel.folder_sizes needs required source output scan_folders.folder_sizes',
        commandId: 'create-folder-size-xlsx-001',
        ...({ plan: 'should-be-dropped', token: 'secret' } as Record<
          string,
          string
        >),
      },
      directory,
    );
    appendHarnessLog(
      'wait_armed',
      {
        runId: '11111111-1111-4111-8111-111111111111',
        afterRevision: 2,
        timeoutSeconds: 30,
      },
      directory,
    );
    appendHarnessLog(
      'wait_expired',
      {
        runId: '11111111-1111-4111-8111-111111111111',
        afterRevision: 2,
        revision: 2,
      },
      directory,
    );
    appendHarnessLog(
      'connector_absent',
      { runId: '11111111-1111-4111-8111-111111111111', context: 'guide_ended' },
      directory,
    );
    const lines = readFileSync(join(directory, 'harness.log'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(lines.length, 4);
    assert.equal(lines[0]!.event, 'create_rejected');
    assert.equal(lines[0]!.commandId, 'create-folder-size-xlsx-001');
    assert.equal(lines[0]!.plan, undefined);
    assert.equal(lines[0]!.token, undefined);
    assert.match(String(lines[0]!.reason), /build_excel\.folder_sizes/);
    assert.equal(lines[1]!.event, 'wait_armed');
    assert.equal(lines[2]!.event, 'wait_expired');
    assert.equal(lines[3]!.event, 'connector_absent');
    assert.ok(typeof lines[0]!.ts === 'string');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('harness log failures are best-effort and do not throw', () => {
  assert.doesNotThrow(() =>
    appendHarnessLog('create_rejected', { reason: 'x' }, '/dev/null/not-a-dir'),
  );
});
