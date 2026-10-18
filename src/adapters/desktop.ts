import { spawn } from 'node:child_process';
import type { HyperionClient } from './client.js';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, resolve, sep } from 'node:path';
import { DEFAULT_SERVICE } from './bootstrap.js';
import { defaultDirectory } from './install.js';

export type DesktopServiceSource = 'arg' | 'env' | 'workspace' | 'default';

/** Electron ignores a remembered portable/temp data dir; sticky home wins. */
export function rememberedWorkspaceDirectory(
  previous: { directory?: string },
  home: string,
): string | undefined {
  if (!previous.directory || !isAbsolute(previous.directory)) return undefined;
  if (!process.versions.electron) return previous.directory;
  const sticky = defaultDirectory(home);
  const remembered = resolve(previous.directory);
  if (remembered === sticky) return remembered;
  if (remembered.startsWith(sticky + sep)) return remembered;
  return undefined;
}

export function desktopTarget(
  args: string[],
  home = process.env.HYPERION_HOME || homedir(),
) {
  let previous: { directory?: string; service?: string } = {};
  try {
    previous = JSON.parse(
      readFileSync(resolve(home, '.hyperion/workspace.json'), 'utf8'),
    );
  } catch {
    /* First launch has no workspace. */
  }
  if (previous.directory && !isAbsolute(previous.directory)) previous = {};
  const option = (name: string) =>
    args
      .find((a) => a.startsWith(`--hyperion-${name}=`))
      ?.split('=')
      .slice(1)
      .join('=');
  const run = option('run') || '';
  if (run && !/^[a-zA-Z0-9_-]{1,80}$/.test(run))
    throw new Error('Invalid run ID');
  const fromArg = option('url');
  const fromEnv = process.env.HYPERION_URL;
  const serviceSource: DesktopServiceSource = fromArg
    ? 'arg'
    : fromEnv
      ? 'env'
      : previous.service
        ? 'workspace'
        : 'default';
  const service = new URL(
    fromArg || fromEnv || previous.service || DEFAULT_SERVICE,
  );
  if (
    service.protocol !== 'http:' ||
    service.hostname !== '127.0.0.1' ||
    service.username ||
    service.password ||
    service.pathname !== '/' ||
    service.search ||
    service.hash
  )
    throw new Error('Desktop requires a local loopback service');
  const directory = resolve(
    option('directory') ||
      process.env.HYPERION_DATA_DIR ||
      rememberedWorkspaceDirectory(previous, home) ||
      defaultDirectory(home),
  );
  return {
    run,
    service: service.origin,
    serviceSource,
    directory,
    url: desktopWindowUrl({ run }, service.origin),
  };
}

/** Browser URL for the resolved loopback service (never a stale remembered port). */
export function desktopWindowUrl(
  target: { run?: string },
  service: string,
): string {
  return `${service}/${target.run ? `?run=${target.run}` : ''}`;
}

/** Prefer :4317 when a remembered alternate is no longer ours; keep a live authenticated alternate sticky. */
export async function resolveWorkspaceService(
  target: {
    service: string;
    directory: string;
    serviceSource: DesktopServiceSource;
  },
  probe: (url: string, directory: string) => Promise<'ours' | 'dead'> = async (
    url,
    directory,
  ) => {
    try {
      const health = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!health.ok) return 'dead';
      const body = (await health.json()) as { ok?: boolean };
      if (body.ok !== true) return 'dead';
      const { HyperionClient } = await import('./client.js');
      await new HyperionClient({ url, directory }).list();
      return 'ours';
    } catch {
      return 'dead';
    }
  },
) {
  if (target.serviceSource === 'arg' || target.serviceSource === 'env')
    return target.service;
  if (target.service === DEFAULT_SERVICE) return target.service;
  if ((await probe(target.service, target.directory)) === 'ours')
    return target.service;
  return DEFAULT_SERVICE;
}
type Installation = { executable: string; args: string[] };
export function rememberDesktop(
  installation: Installation,
  home = process.env.HYPERION_HOME || homedir(),
) {
  const folder = resolve(home, '.hyperion');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = resolve(folder, 'desktop.json');
  const temp = file + `.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(installation), { mode: 0o600 });
  renameSync(temp, file);
}
export function desktopLaunch(
  target: ReturnType<typeof desktopTarget>,
  home = process.env.HYPERION_HOME || homedir(),
) {
  let installation: Installation;
  try {
    installation = JSON.parse(
      readFileSync(resolve(home, '.hyperion/desktop.json'), 'utf8'),
    );
  } catch {
    throw new Error(
      'Instala y abre Hyperion Desktop una vez; mientras tanto usa el enlace en vista dividida.',
    );
  }
  if (
    !isAbsolute(installation.executable) ||
    !existsSync(installation.executable) ||
    !Array.isArray(installation.args) ||
    !installation.args.every((a) => typeof a === 'string')
  )
    throw new Error(
      'La instalación de Hyperion Desktop cambió. Abre la aplicación de nuevo.',
    );
  return {
    executable: installation.executable,
    args: [
      ...installation.args,
      `--hyperion-run=${target.run}`,
      `--hyperion-url=${target.service}`,
      `--hyperion-directory=${target.directory}`,
    ],
  };
}

/** A presentation request never changes workflow state or coordinator. */
export async function openPresentation(
  client: HyperionClient,
  runId: string,
  presentation: 'split' | 'desktop',
) {
  const run = await client.get(runId);
  if (presentation === 'desktop') {
    const target = desktopTarget([
      `--hyperion-run=${run.id}`,
      `--hyperion-url=${client.url}`,
      `--hyperion-directory=${process.env.HYPERION_DATA_DIR || defaultDirectory()}`,
    ]);
    const launch = desktopLaunch(target);
    const child = spawn(launch.executable, launch.args, {
      detached: true,
      stdio: 'ignore',
      shell: false,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined },
    });
    await new Promise<void>((resolve, reject) => {
      child.once('spawn', () => resolve());
      child.once('error', reject);
    });
    child.unref();
  }
  return { url: client.link(run), presentation, runId: run.id };
}

/** Persist a working loopback service (including alternate ports) for the next Desktop open. */
export function rememberWorkspace(
  target: { service: string; directory: string },
  home = process.env.HYPERION_HOME || homedir(),
) {
  let service: URL;
  try {
    service = new URL(target.service);
  } catch {
    return;
  }
  if (
    service.protocol !== 'http:' ||
    service.hostname !== '127.0.0.1' ||
    service.username ||
    service.password ||
    service.pathname !== '/' ||
    service.search ||
    service.hash
  )
    return;
  const folder = resolve(home, '.hyperion');
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = resolve(folder, 'workspace.json');
  const temporary = file + `.${process.pid}.tmp`;
  writeFileSync(
    temporary,
    JSON.stringify({
      service: service.origin,
      directory: resolve(target.directory),
    }),
    { mode: 0o600 },
  );
  renameSync(temporary, file);
}
