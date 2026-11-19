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
  { timeoutMs = 2000, killTree = killOwnedElectronTree, log = () => {} } = {},
) {
  if (!app) return;
  const child = app.process();
  try {
    await phase('Electron close', () => app.close(), { timeoutMs, log });
  } catch (error) {
    if (child && !exited(child)) {
      log(`Electron force cleanup: pid=${child.pid}`);
      await killTree(child);
    }
    // Force-cleaning a stuck app is not a successful shutdown assertion.
    throw error;
  }
}
