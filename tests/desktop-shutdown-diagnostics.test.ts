import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// @ts-expect-error Desktop test helpers are intentionally plain ESM.
import * as diagnostics from './helpers/desktop-shutdown-diagnostics.mjs';
const {
  filterShutdownLine,
  observeShutdownStderr,
  diagnosticCleanup,
  captureOwnedProcesses,
  createShutdownDiagnostics,
} = diagnostics;
// @ts-expect-error Desktop test helpers are intentionally plain ESM.
import { closeDesktop } from './helpers/desktop-test-lifecycle.mjs';

test('disabled diagnostics never attach observers or create evidence', async () => {
  const directory = mkdtempSync(
    join(tmpdir(), 'hyperion-diagnostic-disabled-'),
  );
  try {
    const diagnostic = createShutdownDiagnostics({ directory, id: 'disabled' });
    await diagnostic.install({
      process: () => assert.fail('must stay disabled'),
    });
    diagnostic.dispose();
    assert.equal(existsSync(join(directory, 'disabled.events.jsonl')), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('observer installation errors are redacted, listeners detach and evidence is never overwritten', async () => {
  const directory = mkdtempSync(
    join(tmpdir(), 'hyperion-diagnostic-observers-'),
  );
  const child = Object.assign(new EventEmitter(), {
    pid: 123,
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
  });
  const app = {
    process: () => child,
    evaluate: async () => {
      throw new Error('Bearer SECRET https://private.example');
    },
  };
  const diagnostic = createShutdownDiagnostics({
    enabled: true,
    directory,
    id: 'unique',
  });
  try {
    await diagnostic.install(app);
    child.stderr.emit('data', Buffer.from('Debugger ending on ws://SECRET\n'));
    diagnostic.dispose();
    assert.equal(child.stderr.listenerCount('data'), 0);
    assert.equal(child.listenerCount('exit'), 0);
    assert.equal(child.stdout.listenerCount('end'), 0);
    const path = join(directory, 'unique.events.jsonl');
    const original = readFileSync(path, 'utf8');
    assert.equal(original.includes('SECRET'), false);
    assert.equal(original.includes('private.example'), false);
    assert.ok(original.includes('observer-install-failed'));
    const collision = createShutdownDiagnostics({
      enabled: true,
      directory,
      id: 'unique',
    });
    await collision.install(app);
    collision.dispose();
    assert.equal(readFileSync(path, 'utf8'), original);
  } finally {
    diagnostic.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('shutdown diagnostics allow only bounded structured fields, never stderr or error text', () => {
  const secret = 'Bearer SECRET https://private.example/session';
  assert.equal(filterShutdownLine(secret), null);
  assert.deepEqual(filterShutdownLine('Debugger ending on ws://SECRET'), {
    event: 'debugger-ending',
  });
  assert.equal(filterShutdownLine('prefix Debugger ending SECRET'), null);
  assert.equal(
    filterShutdownLine('HYPERION_QUIT_DIAGNOSTIC {bad SECRET'),
    null,
  );
  assert.deepEqual(
    filterShutdownLine(
      'HYPERION_QUIT_DIAGNOSTIC ' +
        JSON.stringify({
          event: 'before-quit',
          pid: 123,
          windows: 1,
          timestamp: 100,
          extra: secret,
        }),
    ),
    { event: 'before-quit', pid: 123, windows: 1, timestamp: 100 },
  );
  for (const event of ['SECRET', 'before-quit']) {
    assert.equal(
      filterShutdownLine(
        'HYPERION_QUIT_DIAGNOSTIC ' +
          JSON.stringify({ event, pid: secret, windows: 1, timestamp: 100 }),
      ),
      null,
    );
  }
});

test('stderr framing handles split lines, drops oversized lines, and detaches', () => {
  const stream = new EventEmitter();
  const events: unknown[] = [];
  const detach = observeShutdownStderr(stream, (event: unknown) =>
    events.push(event),
  );
  stream.emit('data', Buffer.from('Debugger end'));
  stream.emit('data', Buffer.from('ing on ws://SECRET\n'));
  stream.emit('data', Buffer.from('x'.repeat(5000)));
  stream.emit(
    'data',
    Buffer.from('Debugger ending on ws://SECRET\nDebugger attached.\n'),
  );
  detach();
  stream.emit('data', Buffer.from('Debugger attached.\n'));
  assert.deepEqual(events, [
    { event: 'debugger-ending' },
    { event: 'debugger-attached' },
  ]);
  assert.equal(stream.listenerCount('data'), 0);
});

test('failed diagnostics cannot hide a close timeout or prevent owned cleanup', async () => {
  const child = {
    pid: 12345,
    exitCode: null,
    signalCode: null as string | null,
  };
  const events: unknown[] = [];
  let cleaned = false;
  const killTree = diagnosticCleanup({
    capture: async () => {
      throw new Error('Bearer SECRET');
    },
    cleanup: async (actual: typeof child) => {
      assert.equal(actual, child);
      cleaned = true;
      child.signalCode = 'SIGKILL';
    },
    emit: (event: unknown) => events.push(event),
  });
  await assert.rejects(
    closeDesktop(
      { process: () => child, close: () => new Promise(() => {}) },
      { timeoutMs: 10, killTree },
    ),
    /Electron close timed out/,
  );
  assert.equal(cleaned, true);
  assert.equal(JSON.stringify(events).includes('SECRET'), false);
  assert.deepEqual(events, [
    { event: 'gate-failed-before-capture' },
    { event: 'capture-failed' },
  ]);
});

test('even a broken diagnostic sink cannot prevent cleanup or replace its error', async () => {
  const original = new Error('cleanup failure');
  const cleanup = diagnosticCleanup({
    emit: () => {
      throw new Error('SECRET');
    },
    capture: async () => {
      throw new Error('SECRET');
    },
    cleanup: async () => {
      throw original;
    },
  });
  await assert.rejects(cleanup({}), (error: unknown) => error === original);
});

test('Windows diagnostics never invoke ps or sample', async () => {
  await captureOwnedProcesses({
    platform: 'win32',
    sample: true,
    child: { pid: 123 },
    ownedPids: new Set([123]),
    emit: () => {},
    execute: () => assert.fail('native command on Windows'),
  });
});

test('macOS snapshot exposes only owned PID fields and sample has a hard deadline', async () => {
  const events: unknown[] = [];
  const commands: unknown[] = [];
  await captureOwnedProcesses({
    platform: 'darwin',
    sample: true,
    samplePath: '/synthetic/sample.txt',
    child: { pid: 123, exitCode: null, signalCode: null },
    ownedPids: new Set([123, 456]),
    emit: (event: unknown) => events.push(event),
    execute: async (command: string, args: string[], options: object) => {
      commands.push({ command, args, options });
      return { stdout: '123 1 S\n124 123 S\n456 1 Z\n999 1 S\n' };
    },
  });
  assert.deepEqual(events[0], {
    event: 'owned-processes',
    processes: [
      { pid: 123, ppid: 1, state: 'S' },
      { pid: 124, ppid: 123, state: 'S' },
      { pid: 456, ppid: 1, state: 'Z' },
    ],
  });
  const sample = commands[1] as {
    command: string;
    args: string[];
    options: { timeout: number; killSignal: string };
  };
  assert.equal(sample.command, '/usr/bin/sample');
  assert.deepEqual(sample.args.slice(0, 3), ['123', '1', '10']);
  assert.equal(sample.options.timeout, 2500);
  assert.equal(sample.options.killSignal, 'SIGKILL');
});
