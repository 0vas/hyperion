import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import {
  chmodSync,
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const exec = promisify(execFile);
const delay = (ms: number) => new Promise((done) => setTimeout(done, ms));

/** Unknown identities and downgrades never authorize stopping a process. */
export function olderRuntime(running: string, installed: string) {
  const calendar = (value: string) => {
    const m = /^(20\d{2})\.(\d{2})\.(\d{2})\.(\d{2})(\d{2})$/.exec(value);
    if (!m) return null;
    const [y, mo, d, h, mi] = m.slice(1).map(Number) as [
      number,
      number,
      number,
      number,
      number,
    ];
    const n = Date.UTC(y, mo - 1, d, h, mi),
      date = new Date(n);
    return date.getUTCFullYear() === y &&
      date.getUTCMonth() === mo - 1 &&
      date.getUTCDate() === d &&
      h < 24 &&
      mi < 60
      ? n
      : null;
  };
  const next = calendar(installed),
    old = calendar(running);
  if (next === null) return false;
  // The only pre-CalVer server family shipped by this application.
  if (/^0\.[45]\.\d+(?:-preview\.\d+)?$/.test(running)) return true;
  return old !== null && old < next;
}

/** Serialize cross-process startup/replacement; recover locks left by dead launchers. */
export async function withRuntimeLock<T>(
  directory: string,
  work: () => Promise<T>,
): Promise<T> {
  const file = resolve(directory, 'runtime-start.lock');
  const owner = JSON.stringify({ pid: process.pid, nonce: randomUUID() });
  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const fd = openSync(file, 'wx', 0o600);
      try {
        writeFileSync(fd, owner);
      } finally {
        closeSync(fd);
      }
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      try {
        const previous = readFileSync(file, 'utf8');
        const pid = JSON.parse(previous).pid;
        if (Number.isInteger(pid) && pid > 0) {
          try {
            process.kill(pid, 0);
          } catch (e) {
            if (
              (e as NodeJS.ErrnoException).code === 'ESRCH' &&
              readFileSync(file, 'utf8') === previous
            )
              rmSync(file);
          }
        }
      } catch {
        // A launcher can die between creating and writing the lock. Never evict a fresh one.
        try {
          if (
            statSync(file).mtimeMs < Date.now() - 30000 &&
            !readFileSync(file, 'utf8')
          )
            rmSync(file);
        } catch {}
      }
      if (Date.now() >= deadline)
        throw new Error(
          'Another Hyperion launcher is updating the local service. Retry shortly.',
        );
      await delay(100);
    }
  }
  try {
    return await work();
  } finally {
    if (readFileSync(file, 'utf8') === owner) rmSync(file);
  }
}

type Owner = { pid: number; stamp: string; command: string; owned: boolean };

/** Spanish source; Desktop/en.json localizes it. Prefer this over opaque INTERNAL. */
export const DATA_DIR_BUSY_MESSAGE =
  'Otro Hyperion ya está usando esta carpeta de datos. Cierra las otras ventanas o procesos de Hyperion de esta cuenta e inténtalo de nuevo. Tus flujos no se han borrado.';

function isLivePid(pid: number) {
  return Number.isInteger(pid) && pid > 0 && pid !== process.pid;
}

function emptyLsof(error: NodeJS.ErrnoException & { stdout?: string }) {
  // lsof exits 1 when nothing matched; Node types `code` as string.
  if (String(error.code) === '1') return { stdout: error.stdout || '' };
  throw error;
}

/** Loopback TCP listen ports on 127.0.0.1 (Hyperion candidate peers). */
export async function loopbackListenPorts(): Promise<number[]> {
  if (process.platform === 'win32') {
    const script = `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; @(Get-NetTCPConnection -State Listen -LocalAddress 127.0.0.1 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty LocalPort -Unique) | ConvertTo-Json -Compress`;
    const { stdout } = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { timeout: 10000, windowsHide: true },
    );
    const parsed = JSON.parse(stdout.trim() || '[]') as number | number[];
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(
      (p) => Number.isInteger(p) && p > 0 && p <= 65535,
    );
  }
  const { stdout } = await exec(
    process.platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof',
    ['-nP', '-iTCP@127.0.0.1', '-sTCP:LISTEN', '-Fpn'],
    { timeout: 5000 },
  ).catch(emptyLsof);
  const ports = new Set<number>();
  for (const block of stdout.trim().split(/\np/)) {
    for (const line of block.replace(/^p/, '').split('\n')) {
      const m = /^n127\.0\.0\.1:(\d+)$/.exec(line);
      if (m) ports.add(Number(m[1]));
    }
  }
  return [...ports];
}

/** Processes that currently hold hyperion.sqlite (or its WAL/SHM) for this data directory. */
export async function dataDirHolders(directory: string): Promise<Owner[]> {
  if (process.platform === 'win32') {
    // No portable lsof; peer discovery uses credential-matched listeners instead.
    return [];
  }
  const root = resolve(directory);
  const paths = [
    resolve(root, 'hyperion.sqlite'),
    resolve(root, 'hyperion.sqlite-wal'),
    resolve(root, 'hyperion.sqlite-shm'),
  ];
  const byPid = new Map<number, Owner>();
  for (const path of paths) {
    try {
      for (const owner of await holdersOfPath(path)) {
        if (!isLivePid(owner.pid)) continue;
        byPid.set(owner.pid, owner);
      }
    } catch {
      /* Path may be absent before first start. */
    }
  }
  return [...byPid.values()];
}

async function holdersOfPath(path: string): Promise<Owner[]> {
  const { stdout } = await exec(
    process.platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof',
    ['-nP', '-Fpn', path],
    { timeout: 5000 },
  ).catch(emptyLsof);
  const ids = [
    ...new Set(
      stdout
        .trim()
        .split(/\np/)
        .map((s) => Number(s.replace(/^p/, '').split('\n')[0]))
        .filter((pid) => Number.isInteger(pid) && pid > 0),
    ),
  ];
  const owners: Owner[] = [];
  for (const pid of ids) {
    try {
      owners.push(await processDetail(pid));
    } catch {
      /* Process exited between lsof and ps. */
    }
  }
  return owners;
}

async function processDetail(pid: number): Promise<Owner> {
  if (process.platform === 'win32') {
    const script = `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter ('ProcessId = ${pid}'); if(-not $p){throw 'gone'}; $sid=(Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid).Sid; @{pid=[int]$p.ProcessId; stamp=$p.CreationDate.ToUniversalTime().ToString('o'); command=$p.CommandLine; owned=($sid -eq [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value)} | ConvertTo-Json -Compress`;
    const { stdout } = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { timeout: 10000, windowsHide: true },
    );
    return JSON.parse(stdout) as Owner;
  }
  const query = async (field: string) =>
    (
      await exec('ps', ['-p', String(pid), '-o', `${field}=`], {
        timeout: 5000,
      })
    ).stdout.trim();
  const [uid, stamp, command] = await Promise.all([
    query('uid'),
    query('lstart'),
    query('command'),
  ]);
  return {
    pid,
    stamp,
    command,
    owned: Number(uid) === process.getuid?.(),
  };
}

function matchesServerCommand(actual: string, command: string[]) {
  return (
    sameServerCommand(actual, [process.execPath, ...command]) ||
    sameServerCommand(actual, command)
  );
}

/**
 * Stop owned same-install Hyperion servers that still hold this data directory,
 * except keepPids (e.g. the authenticated listener we are about to reuse).
 * Never kills foreign users or unmatched commands.
 */
export async function stopOwnedDataDirServers(options: {
  directory: string;
  command: string[];
  keepPids?: Iterable<number>;
  /** Extra owned PIDs already verified as this install (e.g. credential-matched listeners). */
  extraOwnedPids?: Iterable<number>;
}): Promise<number[]> {
  const keep = new Set(options.keepPids || []);
  const trusted = new Set(
    [...(options.extraOwnedPids || [])].filter((pid) => isLivePid(pid)),
  );
  const stopped: number[] = [];
  const candidates = new Map<number, Owner>();
  for (const holder of await dataDirHolders(options.directory)) {
    candidates.set(holder.pid, holder);
  }
  for (const pid of trusted) {
    if (candidates.has(pid)) continue;
    try {
      candidates.set(pid, await processDetail(pid));
    } catch {
      /* Gone. */
    }
  }
  for (const holder of candidates.values()) {
    if (!holder.owned || keep.has(holder.pid)) continue;
    // Credential-matched peers already proved same data directory; file holders
    // still require a Hyperion server command (never kill foreign tools).
    const trustedPeer = trusted.has(holder.pid);
    if (
      !trustedPeer &&
      !matchesServerCommand(holder.command, options.command) &&
      !/server\/main\.(js|ts)|[\\/]Hyperion(\.exe)?\b/i.test(holder.command)
    )
      continue;
    try {
      process.kill(holder.pid, 'SIGTERM');
      stopped.push(holder.pid);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  if (!stopped.length) return stopped;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const remaining = (await dataDirHolders(options.directory)).filter((h) =>
      stopped.includes(h.pid),
    );
    const stillAlive = [];
    for (const pid of stopped) {
      try {
        process.kill(pid, 0);
        stillAlive.push(pid);
      } catch {
        /* ESRCH */
      }
    }
    if (!remaining.length && !stillAlive.length) return stopped;
    await delay(100);
  }
  throw new Error(DATA_DIR_BUSY_MESSAGE);
}

/** Refuse boot when a non-reapable process still holds this data directory. */
export async function assertDataDirWritable(
  directory: string,
  keepPids?: Iterable<number>,
) {
  const keep = new Set(keepPids || []);
  const holders = (await dataDirHolders(directory)).filter(
    (h) => !keep.has(h.pid),
  );
  if (!holders.length) return;
  throw new Error(DATA_DIR_BUSY_MESSAGE);
}

export async function listenerPid(port: number): Promise<number | undefined> {
  try {
    return (await listener(port)).pid;
  } catch {
    return undefined;
  }
}

async function listener(port: number): Promise<Owner> {
  if (process.platform === 'win32') {
    // Numeric port only; no paths or credentials are interpolated into PowerShell.
    const script = `[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); $ErrorActionPreference='Stop'; $ids=@(Get-NetTCPConnection -State Listen -LocalPort ${port} | Where-Object { $_.LocalAddress -eq '127.0.0.1' } | Select-Object -ExpandProperty OwningProcess -Unique); if($ids.Count -ne 1){throw 'Ambiguous listener'}; $p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+$ids[0]); $sid=(Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid).Sid; @{pid=[int]$p.ProcessId; stamp=$p.CreationDate.ToUniversalTime().ToString('o'); command=$p.CommandLine; owned=($sid -eq [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value)} | ConvertTo-Json -Compress`;
    const { stdout } = await exec(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-EncodedCommand',
        Buffer.from(script, 'utf16le').toString('base64'),
      ],
      { timeout: 10000, windowsHide: true },
    );
    return JSON.parse(stdout) as Owner;
  }
  const { stdout } = await exec(
    process.platform === 'darwin' ? '/usr/sbin/lsof' : 'lsof',
    ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fpn'],
    { timeout: 5000 },
  );
  const processes = stdout
    .trim()
    .split(/\np/)
    .map((s) => s.replace(/^p/, ''));
  const ids = processes
    .filter((s) => s.split('\n').includes(`n127.0.0.1:${port}`))
    .map((s) => Number(s.split('\n')[0]));
  if (ids.length !== 1 || !Number.isInteger(ids[0]))
    throw new Error('Cannot identify one local Hyperion listener');
  return processDetail(ids[0]!);
}

export function sameServerCommand(
  actual: string,
  expected: string[],
  windows = process.platform === 'win32',
) {
  // Windows quotes paths containing spaces; quotes cannot occur in Windows filenames.
  const normalize = (s: string) =>
    windows ? s.replaceAll('"', '').trim().toLowerCase() : s.trim();
  return normalize(actual) === normalize(expected.join(' '));
}

function backupDatabase(directory: string) {
  const folder = resolve(directory, 'backups');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = resolve(
    folder,
    `before-upgrade-${Date.now()}-${randomUUID()}.sqlite`,
  );
  const db = new DatabaseSync(resolve(directory, 'hyperion.sqlite'), {
    readOnly: true,
  });
  try {
    db.exec('PRAGMA busy_timeout=5000');
    // Includes committed WAL contents, artifacts, receipts and continuation state.
    db.prepare('VACUUM INTO ?').run(file);
  } finally {
    db.close();
  }
  chmodSync(file, 0o600);
  const copy = new DatabaseSync(file, { readOnly: true });
  try {
    const result = copy.prepare('PRAGMA integrity_check').all();
    if (result.length !== 1 || Object.values(result[0]!)[0] !== 'ok')
      throw new Error(
        'Hyperion backup integrity check failed; the old service was not stopped.',
      );
  } finally {
    copy.close();
  }
  return file;
}

/** Caller must first authenticate the older service. Never kills by port alone. */
export async function replaceOlderRuntime(options: {
  directory: string;
  url: string;
  command: string[];
  authenticate: () => Promise<void>;
}) {
  const port = Number(new URL(options.url).port || 80);
  const before = await listener(port);
  if (!before.owned || !sameServerCommand(before.command, options.command))
    throw new Error(
      'The older service belongs to another installation or process. It was not stopped. Close that installation before retrying.',
    );
  const backup = backupDatabase(options.directory);
  await options.authenticate();
  const current = await listener(port);
  if (JSON.stringify(current) !== JSON.stringify(before))
    throw new Error(
      'The local service changed during the update. Retry; no process was stopped.',
    );
  // SIGTERM drains the POSIX HTTP server. Windows terminates this verified process;
  // SQLite WAL recovery retains committed transactions in the same data directory.
  process.kill(current.pid, 'SIGTERM');
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(options.url + '/api/health', {
        signal: AbortSignal.timeout(500),
      });
    } catch (error) {
      if (
        error instanceof TypeError &&
        (error.cause as { code?: string })?.code === 'ECONNREFUSED'
      )
        return backup;
    }
    await delay(100);
  }
  throw new Error(
    'The previous Hyperion service has not released its port. Your backup and workflows are preserved; retry after it closes.',
  );
}
