import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
// @ts-expect-error Desktop test helpers are intentionally plain ESM.
import * as lifecycle from './helpers/desktop-test-lifecycle.mjs';
const { phase, closeDesktop, killOwnedElectronTree, waitForPidExit } =
  lifecycle;

const pending = () => new Promise(() => {});
const deadline = (operation: Promise<unknown>) =>
  Promise.race([
    operation,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('test safety deadline')), 150),
    ),
  ]);

test('a stuck recovery phase fails with its name before the test deadline', async () => {
  await assert.rejects(
    deadline(phase('service returns online', pending, { timeoutMs: 10 })),
    /service returns online timed out/,
  );
});

test('test cancellation unwinds the active recovery phase', async () => {
  const controller = new AbortController();
  const result = phase('first window', pending, {
    timeoutMs: 1000,
    signal: controller.signal,
  });
  controller.abort(new Error('test aborted'));
  await assert.rejects(deadline(result), /first window aborted/);
});

test('Electron close timeout kills only its owned process and still fails the gate', async () => {
  const child = Object.assign(new EventEmitter(), {
    pid: 12345,
    exitCode: null,
    signalCode: null as string | null,
  });
  const killed: number[] = [];
  await assert.rejects(
    deadline(
      closeDesktop(
        { close: pending, process: () => child },
        {
          timeoutMs: 10,
          killTree: async (owned: typeof child) => {
            killed.push(owned.pid);
            child.signalCode = 'SIGTERM';
            child.emit('exit');
          },
        },
      ),
    ),
    /Electron close timed out/,
  );
  assert.deepEqual(killed, [12345]);
});

test('an Electron process already ended by signal is not killed or awaited again', async () => {
  const child = { pid: 12345, exitCode: null, signalCode: 'SIGTERM' };
  let killed = false;
  await deadline(
    closeDesktop(
      { close: async () => {}, process: () => child },
      { killTree: async () => (killed = true), timeoutMs: 10 },
    ),
  );
  assert.equal(killed, false);
});

test('a PID exit poll stops scheduling work after its deadline', async () => {
  let probes = 0;
  await assert.rejects(
    waitForPidExit(12345, { timeoutMs: 10, probe: () => probes++ }),
    /did not exit within 10ms/,
  );
  const finished = probes;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(probes, finished);
});

test('forced Electron cleanup terminates a real owned child without killing a sibling', async () => {
  const options = {
    stdio: 'ignore' as const,
    detached: process.platform !== 'win32',
  };
  const child = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    options,
  );
  const sibling = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1000)'],
    options,
  );
  try {
    await Promise.all([once(child, 'spawn'), once(sibling, 'spawn')]);
    await killOwnedElectronTree(child);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
    assert.doesNotThrow(() => process.kill(sibling.pid!, 0));
  } finally {
    for (const owned of [child, sibling]) {
      if (owned.exitCode === null && owned.signalCode === null) {
        const exit = once(owned, 'exit');
        owned.kill('SIGKILL');
        await exit;
      }
    }
  }
});
