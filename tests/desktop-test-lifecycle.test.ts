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

test('an exited wrapper still requires transport closure after its service is released', async () => {
  const child = { pid: 12345, exitCode: 0, signalCode: null };
  const order: string[] = [];
  let finishClose!: () => void;
  let rendererClosed!: () => void;
  const renderer = new Promise<void>((resolve) => (rendererClosed = resolve));
  await deadline(
    closeDesktop(
      {
        process: () => child,
        windows: () => [
          { isClosed: () => false, waitForEvent: () => renderer },
        ],
        close: () => {
          order.push('quit requested');
          rendererClosed();
          return new Promise<void>((resolve) => (finishClose = resolve));
        },
      },
      {
        timeoutMs: 10,
        releaseResources: async () => {
          await renderer;
          order.push('service released');
          finishClose();
        },
        killTree: async () => assert.fail('must not kill an exited wrapper'),
      },
    ),
  );
  assert.deepEqual(order, ['quit requested', 'service released']);
});

test('an exited wrapper with a permanently pending transport still fails shutdown', async () => {
  let released = false;
  await assert.rejects(
    closeDesktop(
      {
        process: () => ({ pid: 12345, exitCode: 0, signalCode: null }),
        close: pending,
      },
      {
        timeoutMs: 10,
        releaseResources: async () => {
          released = true;
        },
        killTree: async () => assert.fail('must not kill an exited wrapper'),
      },
    ),
    /Electron close timed out/,
  );
  assert.equal(released, true);
});

test('a service cleanup failure is not hidden by a successful Electron close', async () => {
  await assert.rejects(
    closeDesktop(
      {
        process: () => ({ pid: 12345, exitCode: 0, signalCode: null }),
        close: async () => {},
      },
      {
        releaseResources: async () => {
          throw new Error('service still alive');
        },
      },
    ),
    /service still alive/,
  );
});

test('detached service exit is verified after Electron transport closes', async () => {
  const order: string[] = [];
  let finishClose!: () => void;
  await closeDesktop(
    {
      process: () => ({ pid: 12345, exitCode: 0, signalCode: null }),
      close: () =>
        new Promise<void>((resolve) => {
          finishClose = resolve;
        }),
    },
    {
      releaseResources: async () => {
        order.push('service signalled');
        finishClose();
      },
      verifyResources: async () => {
        order.push('service exit verified');
      },
      log: (line: string) => {
        if (line === 'Electron app.close: resolved')
          order.push('transport closed');
      },
    },
  );
  assert.deepEqual(order, [
    'service signalled',
    'transport closed',
    'service exit verified',
  ]);
});

test('real inherited pipes close only after releasing the descendant, not on wrapper exit', async () => {
  const script = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'],
      { stdio: ['ignore', process.stdout, process.stderr] });
    console.log(child.pid);
    child.unref();
  `;
  const wrapper = spawn(process.execPath, ['-e', script], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exited = once(wrapper, 'exit');
  let closed = false;
  const transportClosed = once(wrapper, 'close').then(() => {
    closed = true;
  });
  let descendant: number | undefined;
  try {
    const [data] = await phase(
      'fixture descendant PID',
      () => once(wrapper.stdout!, 'data'),
      { timeoutMs: 3000 },
    );
    descendant = Number(String(data).trim());
    assert.ok(Number.isInteger(descendant) && descendant! > 1);
    await phase('fixture wrapper exit', () => exited, { timeoutMs: 3000 });
    assert.equal(wrapper.exitCode, 0);
    assert.equal(closed, false, 'inherited pipe must outlive the wrapper');
    await closeDesktop(
      { process: () => wrapper, close: () => transportClosed },
      {
        releaseResources: async () => {
          assert.equal(closed, false);
          process.kill(descendant!, 'SIGKILL');
          await waitForPidExit(descendant);
        },
        killTree: async () => assert.fail('the wrapper already exited'),
      },
    );
    assert.equal(closed, true, 'success requires actual transport EOF');
  } finally {
    if (descendant) {
      try {
        process.kill(descendant, 'SIGKILL');
      } catch {}
    }
    if (wrapper.exitCode === null && wrapper.signalCode === null) {
      wrapper.kill('SIGKILL');
      await exited;
    }
  }
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
