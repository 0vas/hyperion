import { spawn as defaultSpawn } from 'node:child_process';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import {
  access,
  constants,
  cp,
  mkdir,
  readdir,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const defaultExecFile = promisify(execFileCallback);

/** Resolve Hyperion.app from this process's Electron executable. */
export function resolveAppBundle(executablePath = process.execPath) {
  const macos = dirname(executablePath);
  const contents = dirname(macos);
  const appBundle = dirname(contents);
  if (
    basename(macos) !== 'MacOS' ||
    basename(contents) !== 'Contents' ||
    basename(appBundle) !== 'Hyperion.app'
  )
    throw new Error(
      'La instalación actual no es un Hyperion.app reconocible. No se reemplazó nada.',
    );
  return appBundle;
}

function assertWritableParent(directory) {
  return access(directory, constants.W_OK);
}

async function findMountedApp(mountPoint) {
  const entries = await readdir(mountPoint);
  const name = entries.find((entry) => entry === 'Hyperion.app');
  if (!name)
    throw new Error(
      'El DMG no contiene Hyperion.app. No se reemplazó la instalación.',
    );
  const appPath = join(mountPoint, name);
  const info = await stat(appPath);
  if (!info.isDirectory())
    throw new Error('Hyperion.app en el DMG no es un directorio válido.');
  return appPath;
}

/**
 * Mount a verified DMG read-only, codesign-check Hyperion.app, replace this
 * process's bundle. Does not relaunch: the caller must quit first so
 * requestSingleInstanceLock is released, then start the new binary (e.g.
 * app.relaunch()). Restores the previous bundle if replacement fails. Never
 * kills foreign processes.
 */
export async function applyMacDmg(
  installerPath,
  {
    executablePath = process.execPath,
    execFile = defaultExecFile,
    mountPoint = join(tmpdir(), `hyperion-update-${randomUUID()}`),
    ensureWritable = assertWritableParent,
  } = {},
) {
  if (!installerPath.endsWith('.dmg'))
    throw new Error('El instalador de macOS debe ser un DMG verificado.');
  const currentApp = resolveAppBundle(executablePath);
  const parent = dirname(currentApp);
  try {
    await ensureWritable(parent);
  } catch {
    throw new Error(
      'No hay permiso de escritura para reemplazar Hyperion.app. No se modificó la instalación.',
    );
  }
  await mkdir(mountPoint, { recursive: true, mode: 0o700 });
  let attached = false;
  const backup = `${currentApp}.updating-backup`;
  let renamed = false;
  try {
    await execFile(
      'hdiutil',
      [
        'attach',
        '-readonly',
        '-nobrowse',
        '-mountpoint',
        mountPoint,
        installerPath,
      ],
      { timeout: 120000 },
    );
    attached = true;
    const incoming = await findMountedApp(mountPoint);
    await execFile('codesign', ['--verify', '--deep', '--strict', incoming], {
      timeout: 60000,
    });
    await rename(currentApp, backup);
    renamed = true;
    try {
      await cp(incoming, currentApp, {
        recursive: true,
        verbatimSymlinks: true,
      });
    } catch (error) {
      await rename(backup, currentApp);
      renamed = false;
      throw error;
    }
    await rm(backup, { recursive: true, force: true });
    renamed = false;
  } finally {
    if (renamed && !(await exists(currentApp)) && (await exists(backup))) {
      try {
        await rename(backup, currentApp);
      } catch {
        /* Best-effort restore; the thrown error above remains the cause. */
      }
    }
    if (attached) {
      try {
        await execFile('hdiutil', ['detach', mountPoint, '-force'], {
          timeout: 60000,
        });
      } catch {
        /* Detach best-effort after a failed apply. */
      }
    }
    await rm(mountPoint, { recursive: true, force: true }).catch(() => {});
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** Spawn a verified NSIS installer silently for update; caller quits Electron. */
export async function applyWindowsInstaller(
  installerPath,
  { spawn = defaultSpawn } = {},
) {
  const name = basename(installerPath.replaceAll('\\', '/'));
  if (!/^Hyperion-[\da-zA-Z.-]+-win-x64\.exe$/i.test(name))
    throw new Error(
      'Solo se ejecuta un instalador Hyperion verificado. No se inició ningún proceso.',
    );
  const child = spawn(installerPath, ['/S', '--updated'], {
    detached: true,
    stdio: 'ignore',
    shell: false,
    windowsHide: true,
  });
  child.unref();
}

export async function applyVerifiedInstaller(
  installerPath,
  platform = process.platform,
) {
  if (platform === 'darwin') return applyMacDmg(installerPath);
  if (platform === 'win32') return applyWindowsInstaller(installerPath);
  throw new Error('Actualización automática no disponible en esta plataforma.');
}
