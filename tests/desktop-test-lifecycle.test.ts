import assert from 'node:assert/strict';
import { EventEmitter, once } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

// Standard-handle inheritance did not retain the pipe in Windows CI. Exercise
// the shutdown contract with an explicit local transport on BOTH platforms:
// Windows named pipe / POSIX domain socket, not a reproduction of Electron's
// inherited stdio. The descendant must connect before its wrapper may exit.
async function runTransportFixture(
  release: boolean,
  {
    listen = (server, endpoint) =>
      new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(endpoint, resolve);
      }),
    removeDirectory = (directory) =>
      rm(directory, { recursive: true, force: true }),
  }: {
    listen?: (
      server: Server,
      endpoint: string,
      directory: string,
    ) => Promise<void>;
    removeDirectory?: (directory: string) => Promise<void>;
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), 'hl-'));
  const endpoint =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\hyperion-lifecycle-${randomUUID()}`
      : join(directory, 'socket');
  let peer: Socket | undefined;
  let eof = false;
  let closed = false;
  let transportError: Error | undefined;
  let finishClose!: () => void;
  const transportClosed = new Promise<void>((resolve) => {
    finishClose = resolve;
  });
  const server = createServer((socket) => {
    peer = socket;
    socket.once('end', () => {
      eof = true;
    });
    socket.once('close', () => {
      closed = true;
      finishClose();
    });
    socket.on('error', (error) => {
      transportError = error;
    });
    socket.resume();
  });
  let ownedWrapper: ChildProcess | undefined;
  let wrapperExited: Promise<unknown> | undefined;
  let descendant: number | undefined;
  let descendantGone = false;
  const failures: unknown[] = [];
  try {
    // The listening phase owns errors. A connection that never arrives must
    // remain pending, not create an unobserved rejection during setup failure.
    const connected = new Promise<void>((resolve) =>
      server.once('connection', () => resolve()),
    );
    await phase(
      'fixture listening',
      () => listen(server, endpoint, directory),
      { timeoutMs: 3000 },
    );
    const descendantScript = `
    const socket = require('node:net').connect(${JSON.stringify(endpoint)}, () => {
      process.send('ready');
    });
    let input = '';
    socket.on('data', (data) => {
      input += data;
      if (input === 'release\\n') socket.end();
    });
    socket.on('error', () => process.exit(1));
    setTimeout(() => process.exit(2), 10000).unref();
  `;
    const script = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendantScript)}],
      { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    process.send({ pid: child.pid });
    child.once('message', (message) => {
      if (message !== 'ready') process.exit(1);
      child.disconnect();
      child.unref();
      process.disconnect();
    });
    child.once('error', () => process.exit(1));
  `;
    const wrapper = spawn(process.execPath, ['-e', script], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    ownedWrapper = wrapper;
    const exited = once(wrapper, 'exit');
    wrapperExited = exited;
    const [message] = await phase(
      'fixture descendant PID',
      () => once(wrapper, 'message'),
      { timeoutMs: 3000 },
    );
    descendant = message.pid;
    assert.ok(Number.isInteger(descendant) && descendant! > 1);
    await phase('fixture descendant connected', () => connected, {
      timeoutMs: 3000,
    });
    await phase('fixture wrapper exit', () => exited, { timeoutMs: 3000 });
    assert.equal(wrapper.exitCode, 0);
    assert.doesNotThrow(() => process.kill(descendant!, 0));
    assert.equal(closed, false, 'real transport must outlive the wrapper');
    assert.equal(eof, false);
    const shutdown = closeDesktop(
      { process: () => wrapper, close: () => transportClosed },
      {
        timeoutMs: release ? 2000 : 50,
        releaseResources: async () => {
          assert.equal(closed, false);
          if (release) peer!.write('release\n');
        },
        verifyResources: async () => {
          if (release) {
            await waitForPidExit(descendant);
            descendantGone = true;
          }
        },
        killTree: async () => assert.fail('the wrapper already exited'),
      },
    );
    if (release) {
      await shutdown;
      assert.equal(eof, true, 'success requires remote EOF, not wrapper exit');
      assert.equal(closed, true, 'success requires actual transport close');
    } else {
      await assert.rejects(shutdown, /Electron close timed out/);
      assert.equal(closed, false, 'the pending transport must not pass');
      assert.equal(eof, false);
      assert.doesNotThrow(() => process.kill(descendant!, 0));
    }
    assert.equal(transportError, undefined);
  } catch (error) {
    failures.push(error);
  } finally {
    const cleanup = async (action: () => Promise<unknown>) => {
      try {
        await action();
      } catch (error) {
        failures.push(error);
      }
    };
    await cleanup(async () => {
      if (!descendant || descendantGone) return;
      try {
        process.kill(descendant, 0);
        process.kill(descendant, 'SIGKILL');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        descendantGone = true;
      }
    });
    await cleanup(async () => {
      if (
        ownedWrapper &&
        ownedWrapper.exitCode === null &&
        ownedWrapper.signalCode === null
      ) {
        ownedWrapper.kill('SIGKILL');
        await phase('fixture wrapper cleanup', () => wrapperExited, {
          timeoutMs: 2000,
        });
      }
    });
    await cleanup(async () => {
      if (descendant && !descendantGone) {
        await waitForPidExit(descendant);
        descendantGone = true;
      }
    });
    peer?.destroy();
    await cleanup(() =>
      phase(
        'fixture server cleanup',
        () =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (
                error &&
                (error as NodeJS.ErrnoException).code !==
                  'ERR_SERVER_NOT_RUNNING'
              )
                reject(error);
              else resolve();
            });
          }),
        { timeoutMs: 2000 },
      ),
    );
    await cleanup(() => removeDirectory(directory));
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length)
    throw new AggregateError(failures, 'fixture failed with cleanup errors');
}

for (const release of [false, true]) {
  test(`real local transport ${release ? 'closes only after releasing the descendant' : 'still fails shutdown without descendant release'}`, () =>
    runTransportFixture(release));
}

for (const cleanupFails of [false, true]) {
  test(`fixture listening failure ${cleanupFails ? 'preserves both setup and cleanup errors' : 'still removes resources and preserves the original error'}`, async () => {
    const setupError = new Error('fixture listen failed');
    const cleanupError = new Error('fixture directory cleanup failed');
    let directory: string | undefined;
    let server: Server | undefined;
    let removed = false;
    try {
      await assert.rejects(
        runTransportFixture(true, {
          listen: async (fixtureServer, _endpoint, fixtureDirectory) => {
            directory = fixtureDirectory;
            server = fixtureServer;
            throw setupError;
          },
          removeDirectory: async (fixtureDirectory) => {
            await rm(fixtureDirectory, { recursive: true, force: true });
            removed = true;
            if (cleanupFails) throw cleanupError;
          },
        }),
        (error) =>
          cleanupFails
            ? error instanceof AggregateError &&
              error.errors.includes(setupError) &&
              error.errors.includes(cleanupError)
            : error === setupError,
      );
      assert.equal(removed, true, 'setup failure must reach fixture cleanup');
      assert.equal(server?.listening, false);
      assert.equal(existsSync(directory!), false);
    } finally {
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  });
}

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
