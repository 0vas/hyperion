import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function phase(
  label,
  action,
  { timeoutMs = 10000, signal, log = () => {} } = {},
) {
  log(`${label}: start`);
  let timer;
  let onAbort;
  try {
    return await Promise.race([
      new Promise((_, reject) => {
        onAbort = () =>
          reject(new Error(`${label} aborted`, { cause: signal.reason }));
        if (signal?.aborted) return onAbort();
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
      Promise.resolve().then(() => {
        if (signal?.aborted) throw new Error(`${label} aborted`);
        return action();
      }),
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    log(`${label}: settled`);
  }
}

const exited = (child) => child.exitCode !== null || child.signalCode !== null;

export async function waitForPidExit(
  pid,
  { timeoutMs = 2000, probe = process.kill } = {},
) {
  const end = Date.now() + timeoutMs;
  do {
    try {
      probe(pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    await new Promise((done) => setTimeout(done, Math.min(50, timeoutMs)));
  } while (Date.now() < end);
  throw new Error(`Owned process ${pid} did not exit within ${timeoutMs}ms`);
}

// Only accepts the ChildProcess owned by Playwright. On POSIX, Playwright
// creates a separate process group; on Windows, /T includes its cmd wrapper.
export async function killOwnedElectronTree(child) {
  if (exited(child)) return;
  if (
    !Number.isInteger(child.pid) ||
    child.pid <= 1 ||
    child.pid === process.pid
  )
    throw new Error('Refusing to terminate an invalid Electron test PID');
  let onExit;
  const exit = new Promise((resolve) => {
    onExit = resolve;
    child.once('exit', onExit);
  });
  try {
    if (process.platform === 'win32') {
      await promisify(execFile)(
        'taskkill.exe',
        ['/PID', String(child.pid), '/T', '/F'],
        {
          timeout: 3000,
          windowsHide: true,
        },
      ).catch((error) => {
        if (!exited(child)) throw error;
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    }
    if (!exited(child))
      await phase('Electron process exit', () => exit, { timeoutMs: 2000 });
  } finally {
    child.removeListener('exit', onExit);
  }
}

export async function closeDesktop(
  app,
  {
    timeoutMs = 2000,
    killTree = killOwnedElectronTree,
    releaseResources = async () => {},
    verifyResources = async () => {},
    log = () => {},
  } = {},
) {
  if (!app) {
    await phase('release Desktop resources', releaseResources, {
      timeoutMs: 15000,
      log,
    });
    return phase('Desktop resources exited', verifyResources, {
      timeoutMs,
      log,
    });
  }
  const child = app.process();
  const failures = [];
  const listeners = [];
  const listen = (target, event, label) => {
    if (!target?.on) return;
    const listener = (...values) => log(`${label}: ${values.join(',')}`);
    target.on(event, listener);
    listeners.push(() => target.removeListener(event, listener));
  };
  listen(child, 'exit', 'Electron wrapper exit');
  listen(child, 'close', 'Electron wrapper close');
  listen(child?.stdout, 'end', 'Electron stdout EOF');
  listen(child?.stderr, 'end', 'Electron stderr EOF');
  log(
    `Electron shutdown: pid=${child?.pid} exitCode=${child?.exitCode} signalCode=${child?.signalCode}`,
  );
  const capture = async (action) => {
    try {
      await action();
    } catch (error) {
      failures.push(error);
    }
  };
  const forceCleanup = async () => {
    if (child && !exited(child)) {
      log(`Electron force cleanup: pid=${child.pid}`);
      await killTree(child);
    }
  };
  // Arm window listeners before quit. Closing the renderer prevents another
  // automatic recovery while we release this fixture's detached service.
  const renderersClosed = Promise.all(
    (app.windows?.() || []).map((page) =>
      page.isClosed()
        ? undefined
        : page.waitForEvent('close', { timeout: timeoutMs }),
    ),
  ).then(
    () => null,
    (error) => error,
  );
  // Observe rejection immediately, but do not wait for transport EOF before
  // releasing resources: on Windows the wrapper can exit before its pipes close.
  const closing = Promise.resolve()
    .then(() => app.close())
    .then(
      () => {
        log('Electron app.close: resolved');
        return null;
      },
      (error) => error,
    );
  try {
    await capture(() =>
      phase(
        'Electron renderers closed',
        async () => {
          const error = await renderersClosed;
          if (error) throw error;
        },
        { timeoutMs, log },
      ),
    );
    if (failures.length) await capture(forceCleanup);
    await capture(() =>
      phase('release Desktop resources', releaseResources, {
        timeoutMs: 15000,
        log,
      }),
    );
    await capture(() =>
      phase(
        'Electron close',
        async () => {
          const error = await closing;
          if (error) throw error;
          if (child && !exited(child))
            throw new Error('Electron close resolved before process exit');
        },
        { timeoutMs, log },
      ),
    );
    if (failures.length) await capture(forceCleanup);
    // A killed descendant may remain visible until its parent exits/reaps it.
    // Confirm its disappearance only after closing the Electron transport.
    await capture(() =>
      phase('Desktop resources exited', verifyResources, { timeoutMs, log }),
    );
    if (failures.length === 1) throw failures[0];
    if (failures.length)
      throw new AggregateError(
        failures,
        failures.map((error) => error.message).join('; '),
      );
  } finally {
    for (const remove of listeners) remove();
  }
}
