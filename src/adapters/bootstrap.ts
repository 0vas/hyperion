import { VERSION } from '../version.js';
import { spawn } from 'node:child_process';
import { openSync, closeSync } from 'node:fs';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCredentials } from '../server/config.js';
import { HyperionClient } from './client.js';
import {
  olderRuntime,
  replaceOlderRuntime,
  withRuntimeLock,
} from './runtime-upgrade.js';

export const DEFAULT_SERVICE = 'http://127.0.0.1:4317';

/** Spanish source string; Desktop/en.json localize it. Never surface bare UNAUTHORIZED. */
export const FOREIGN_PORT_MESSAGE =
  'Otro Hyperion, otra cuenta de este Mac u otra instalación ya usa este puerto local. Cierra esa app o esa sesión e inténtalo de nuevo. Hyperion no detuvo ese proceso.';

type EnsureOptions = { directory?: string; url?: string; agentId?: string };
type EnsureResult = {
  started: boolean;
  pid?: number;
  upgraded?: boolean;
  backup?: string;
  url: string;
};

function isLoopbackHttp(url: string) {
  try {
    const target = new URL(url);
    return (
      target.protocol === 'http:' &&
      target.hostname === '127.0.0.1' &&
      !target.username &&
      !target.password
    );
  } catch {
    return false;
  }
}

function isUnauthorized(error: unknown) {
  return (
    error instanceof Error &&
    /UNAUTHORIZED|401|Wrong workspace|credential/i.test(error.message)
  );
}

function isForeignInstall(error: unknown) {
  return (
    error instanceof Error &&
    /another installation or process/i.test(error.message)
  );
}

function foreignConflict(cause?: unknown) {
  const error = new Error(FOREIGN_PORT_MESSAGE);
  if (cause !== undefined) (error as Error & { cause?: unknown }).cause = cause;
  return error;
}

async function freeLoopbackPort() {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((done) => server.close(() => done()));
  return port;
}

function serverCommand() {
  return import.meta.url.endsWith('.ts')
    ? [
        '--import',
        import.meta.resolve('tsx'),
        fileURLToPath(new URL('../server/main.ts', import.meta.url)),
      ]
    : [fileURLToPath(new URL('../server/main.js', import.meta.url))];
}

/** Reuses the authenticated instance or starts one loopback service. Never writes to MCP stdout. */
export async function ensureServer(
  options: EnsureOptions = {},
): Promise<EnsureResult> {
  const config = loadCredentials(options.directory);
  const serverArgs = serverCommand();
  const requested = options.url || process.env.HYPERION_URL || DEFAULT_SERVICE;

  // Honor the requested URL. Foreign Hyperion on that loopback port → another free
  // port (never kill the foreign listener). Do not rewrite a free explicit port to
  // :4317 — that broke reserved-port tests and would ignore HYPERION_URL.
  // Preferring :4317 again is Desktop's sticky workspace reopen concern: a live
  // authenticated alternate must stay sticky to avoid two servers on one data dir.
  try {
    return await bindOrReuse(requested, options, config.directory, serverArgs);
  } catch (error) {
    if (
      !(error instanceof Error && error.message === FOREIGN_PORT_MESSAGE) ||
      !isLoopbackHttp(requested)
    )
      throw error;
    const alt = `http://127.0.0.1:${await freeLoopbackPort()}`;
    return bindOrReuse(alt, options, config.directory, serverArgs);
  }
}

async function bindOrReuse(
  url: string,
  options: EnsureOptions,
  directory: string,
  serverArgs: string[],
): Promise<EnsureResult> {
  const client = new HyperionClient({ ...options, url, directory });
  const target = new URL(client.url);
  const probe = async () => {
    let response: Response;
    try {
      response = await fetch(client.url + '/api/health', {
        signal: AbortSignal.timeout(3000),
      });
    } catch (error) {
      // Only an unavailable listener authorizes starting a process; other failures are reported.
      if (
        error instanceof TypeError &&
        (error.cause as { code?: string })?.code === 'ECONNREFUSED'
      )
        return false;
      throw new Error(`Cannot reach Hyperion at ${client.url}`);
    }
    const health = (await response.json()) as {
      ok?: boolean;
      version?: string;
    };
    if (
      !response.ok ||
      health.ok !== true ||
      typeof health.version !== 'string'
    )
      throw new Error(
        'The configured port belongs to another service. No process was stopped.',
      );
    try {
      // Auth only — never GET /api/runs here. A single unreadable snapshot used
      // to surface as INTERNAL and block Desktop openRun entirely.
      await client.authCheck();
    } catch (error) {
      if (isUnauthorized(error)) throw foreignConflict(error);
      if (error instanceof Error && /^INTERNAL:/.test(error.message)) {
        throw new Error(
          `${error.message} Review ${resolve(directory, 'server.log')}.`,
        );
      }
      throw error;
    }
    return health.version;
  };
  return withRuntimeLock(directory, async () => {
    const running = await probe();
    if (running === VERSION) return { started: false, url: client.url };
    let backup: string | undefined;
    if (running) {
      if (!olderRuntime(running, VERSION))
        throw new Error(
          `A newer or unrecognized Hyperion service (${running}) is already running. Open the newer installed app; it was not stopped.`,
        );
      try {
        backup = await replaceOlderRuntime({
          directory,
          url: client.url,
          command: [process.execPath, ...serverArgs],
          authenticate: async () => {
            if ((await probe()) !== running)
              throw new Error('Hyperion changed during update; retry.');
          },
        });
      } catch (error) {
        if (isForeignInstall(error) || isUnauthorized(error))
          throw foreignConflict(error);
        throw error;
      }
    }
    const root = fileURLToPath(new URL('../../', import.meta.url));
    const log = resolve(directory, 'server.log');
    const descriptor = openSync(log, 'a', 0o600);
    const child = spawn(process.execPath, serverArgs, {
      cwd: root,
      detached: true,
      stdio: ['ignore', descriptor, descriptor],
      env: {
        ...process.env,
        ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}),
        HYPERION_DATA_DIR: directory,
        HYPERION_PORT: target.port || '80',
      },
    });
    closeSync(descriptor);
    let spawnError: Error | undefined;
    child.once('error', (error) => {
      spawnError = error;
    });
    child.unref();
    const stopOrphan = () => {
      if (!child.pid) return;
      try {
        process.kill(child.pid, 'SIGTERM');
      } catch {
        /* Already gone. */
      }
    };
    for (let attempt = 0; attempt < 60; attempt++) {
      if (spawnError) {
        stopOrphan();
        throw spawnError;
      }
      if ((await probe()) === VERSION)
        return {
          started: true,
          pid: child.pid,
          url: client.url,
          ...(backup ? { upgraded: true, backup } : {}),
        };
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    stopOrphan();
    throw new Error(`Hyperion did not start. Review ${log}`);
  });
}
