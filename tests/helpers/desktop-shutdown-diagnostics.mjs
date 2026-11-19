import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { phase, killOwnedElectronTree } from './desktop-test-lifecycle.mjs';

const marker = 'HYPERION_QUIT_DIAGNOSTIC ';
const events = new Set([
  'observers-installed',
  'before-quit',
  'will-quit',
  'quit',
  'window-all-closed',
  'browser-window-created',
  'node-exit',
]);
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const safely = (emit, event) => {
  try {
    emit(event);
  } catch {}
};

export function filterShutdownLine(line) {
  if (line.length > 4096) return null;
  if (line === 'Debugger attached.') return { event: 'debugger-attached' };
  if (line.startsWith('Debugger ending on ws://'))
    return { event: 'debugger-ending' };
  if (line === 'Waiting for the debugger to disconnect...')
    return { event: 'debugger-disconnect-wait' };
  if (!line.startsWith(marker)) return null;
  try {
    const data = JSON.parse(line.slice(marker.length));
    if (
      !events.has(data.event) ||
      !integer(data.pid) ||
      data.pid <= 1 ||
      !integer(data.windows) ||
      data.windows > 1000 ||
      !integer(data.timestamp)
    )
      return null;
    return {
      event: data.event,
      pid: data.pid,
      windows: data.windows,
      timestamp: data.timestamp,
    };
  } catch {
    return null;
  }
}

export function observeShutdownStderr(stream, emit) {
  let buffer = '';
  let oversized = false;
  const listener = (chunk) => {
    // Bound retained state even if stderr never emits a newline.
    for (const character of chunk.toString()) {
      if (character === '\n') {
        if (!oversized) {
          const event = filterShutdownLine(buffer.replace(/\r$/, ''));
          if (event) safely(emit, event);
        }
        buffer = '';
        oversized = false;
      } else if (!oversized) {
        buffer += character;
        if (buffer.length > 4096) {
          buffer = '';
          oversized = true;
        }
      }
    }
  };
  stream?.on('data', listener);
  return () => {
    stream?.removeListener('data', listener);
    buffer = '';
  };
}

// The caller is already failing the gate. Diagnostic errors cannot replace that
// failure or prevent the existing owned-process cleanup from running.
export function diagnosticCleanup({
  capture,
  cleanup = killOwnedElectronTree,
  emit,
}) {
  return async (child) => {
    safely(emit, { event: 'gate-failed-before-capture' });
    try {
      await capture(child);
    } catch {
      safely(emit, { event: 'capture-failed' });
    } finally {
      await cleanup(child);
    }
  };
}

export async function captureOwnedProcesses({
  child,
  ownedPids,
  platform = process.platform,
  sample = false,
  samplePath,
  emit,
  execute = promisify(execFile),
}) {
  // Windows still gets portable native quit/inspector events; no Unix commands.
  if (platform !== 'darwin') return;
  const { stdout } = await execute('/bin/ps', ['-axo', 'pid=,ppid=,stat='], {
    timeout: 1000,
    killSignal: 'SIGKILL',
    maxBuffer: 1024 * 1024,
  });
  const rows = stdout
    .split('\n')
    .map((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+([A-Za-z+<>N-]{1,8})\s*$/.exec(line);
      return (
        match && {
          pid: Number(match[1]),
          ppid: Number(match[2]),
          state: match[3],
        }
      );
    })
    .filter(Boolean);
  const selected = new Set(
    [...ownedPids].filter((pid) => integer(pid) && pid > 1),
  );
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows)
      if (selected.has(row.ppid) && !selected.has(row.pid)) {
        selected.add(row.pid);
        changed = true;
      }
  }
  safely(emit, {
    event: 'owned-processes',
    processes: rows.filter((row) => selected.has(row.pid)).slice(0, 100),
  });
  if (
    sample &&
    integer(child.pid) &&
    child.pid > 1 &&
    child.pid !== process.pid &&
    child.exitCode === null &&
    child.signalCode === null
  ) {
    safely(emit, { event: 'sample-start', pid: child.pid });
    await execute(
      '/usr/bin/sample',
      [String(child.pid), '1', '10', '-file', samplePath],
      { timeout: 2500, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024 },
    );
    safely(emit, { event: 'sample-complete', pid: child.pid });
  }
}

export function createShutdownDiagnostics({
  enabled = false,
  sample = false,
  id,
  directory = 'test-results',
}) {
  const ownedPids = new Set();
  const remove = [];
  const started = Date.now();
  const path = join(directory, `${id}.events.jsonl`);
  const samplePath = join(directory, `${id}.sample.txt`);
  let writable = enabled;
  if (enabled) {
    try {
      mkdirSync(directory, { recursive: true });
      writeFileSync(path, '', { flag: 'wx', mode: 0o600 });
    } catch {
      writable = false;
    }
  }
  const emit = (event) => {
    if (!writable) return;
    try {
      appendFileSync(
        path,
        JSON.stringify({ elapsedMs: Date.now() - started, ...event }) + '\n',
      );
    } catch {
      writable = false;
    }
  };
  return {
    recordPid(pid) {
      if (integer(pid) && pid > 1) ownedPids.add(pid);
    },
    async install(app) {
      if (!enabled) return;
      const child = app.process();
      ownedPids.add(child.pid);
      remove.push(observeShutdownStderr(child.stderr, emit));
      for (const [target, name, event] of [
        [child, 'exit', 'child-exit'],
        [child, 'close', 'child-close'],
        [child.stdout, 'end', 'stdout-eof'],
        [child.stderr, 'end', 'stderr-eof'],
      ]) {
        const listener = () => emit({ event, pid: child.pid });
        target?.on(name, listener);
        remove.push(() => target?.removeListener(name, listener));
      }
      try {
        await phase(
          'install diagnostic observers',
          () =>
            app.evaluate(({ app, BrowserWindow }) => {
              const emit = (event) => {
                try {
                  process.stderr.write(
                    'HYPERION_QUIT_DIAGNOSTIC ' +
                      JSON.stringify({
                        event,
                        timestamp: Date.now(),
                        pid: process.pid,
                        windows: BrowserWindow.getAllWindows().length,
                      }) +
                      '\n',
                  );
                } catch {}
              };
              for (const name of [
                'before-quit',
                'will-quit',
                'quit',
                'window-all-closed',
                'browser-window-created',
              ])
                app.on(name, () => emit(name));
              process.on('exit', () => emit('node-exit'));
              emit('observers-installed');
            }),
          { timeoutMs: 1000 },
        );
      } catch {
        emit({ event: 'observer-install-failed' });
      }
    },
    killTree: enabled
      ? diagnosticCleanup({
          emit,
          capture: async (child) => {
            if (sample && process.platform === 'darwin')
              writeFileSync(samplePath, '', { flag: 'wx', mode: 0o600 });
            await captureOwnedProcesses({
              child,
              ownedPids,
              sample,
              samplePath,
              emit,
            });
          },
        })
      : killOwnedElectronTree,
    dispose() {
      for (const detach of remove) {
        try {
          detach();
        } catch {}
      }
    },
  };
}
