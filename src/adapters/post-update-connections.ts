/**
 * After Desktop "Actualizar y reiniciar", refresh Hyperion client entries that
 * belong to this installation and only conflict because the update changed
 * expected command/args/paths. Foreign conflicts stay untouched.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parse } from 'smol-toml';
import {
  DESKTOP_CLIENTS,
  desktopClientConfigPath,
  inspectDesktopClient,
  type DesktopClientId,
} from './connection-status.js';
import { setupDesktopClient } from './desktop-setup.js';
import { defaultDirectory } from './install.js';

export type PostUpdateRefreshOptions = {
  home?: string;
  directory?: string;
  platform?: NodeJS.Platform;
  appData?: string;
  codexHome?: string;
  url?: string;
};

export type PostUpdateRefreshResult = {
  replaced: DesktopClientId[];
  skipped: DesktopClientId[];
  backups: string[];
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid');
  return value as Record<string, unknown>;
}

function normalizeDir(path: string): string {
  return resolve(path)
    .replace(/[/\\]+$/, '')
    .toLowerCase();
}

function hasMcpLauncherArg(args: unknown): boolean {
  if (!Array.isArray(args)) return false;
  return args.some(
    (arg) =>
      typeof arg === 'string' &&
      /(?:^|[/\\])(mcp-launcher|mcp)\.js$/i.test(arg),
  );
}

function looksLikeHyperionRunner(
  command: string,
  env: Record<string, unknown>,
): boolean {
  const name = basename(command.replace(/\\/g, '/'));
  if (/^Hyperion(\.exe)?$/i.test(name)) return true;
  if (/electron/i.test(name)) return true;
  return env.ELECTRON_RUN_AS_NODE === '1' || env.ELECTRON_RUN_AS_NODE === true;
}

/**
 * Same-install conflict: stdio Hyperion entry for this data directory whose
 * args still point at mcp-launcher/mcp.js. Not an arbitrary command, HTTP
 * transport, or foreign data dir.
 */
export function isSameInstallHyperionConflict(
  existing: Record<string, unknown>,
  options: { dataDirectory: string },
): boolean {
  const type = existing.type;
  if (type !== undefined && type !== 'stdio') return false;
  if (typeof existing.url === 'string' && existing.url && !existing.command)
    return false;
  if (typeof existing.command !== 'string' || !existing.command.trim())
    return false;
  if (!hasMcpLauncherArg(existing.args)) return false;
  const env =
    existing.env &&
    typeof existing.env === 'object' &&
    !Array.isArray(existing.env)
      ? (existing.env as Record<string, unknown>)
      : {};
  if (typeof env.HYPERION_DATA_DIR !== 'string' || !env.HYPERION_DATA_DIR)
    return false;
  if (
    normalizeDir(env.HYPERION_DATA_DIR) !== normalizeDir(options.dataDirectory)
  )
    return false;
  if (typeof env.HYPERION_AGENT_ID !== 'string' || !env.HYPERION_AGENT_ID)
    return false;
  return looksLikeHyperionRunner(existing.command, env);
}

function readRawHyperionEntry(
  id: Exclude<DesktopClientId, 'claude-code'>,
  options: PostUpdateRefreshOptions,
): Record<string, unknown> | undefined {
  const located = desktopClientConfigPath(id, options);
  if ('error' in located || !existsSync(located.path)) return undefined;
  try {
    const text = readFileSync(located.path, 'utf8');
    const config = object(id === 'codex' ? parse(text) : JSON.parse(text));
    const key = id === 'codex' ? 'mcp_servers' : 'mcpServers';
    const servers = config[key] === undefined ? {} : object(config[key]);
    if (servers.hyperion === undefined) return undefined;
    return object(servers.hyperion);
  } catch {
    return undefined;
  }
}

/**
 * For each conflict that matches the same-install heuristic, replace with
 * backup via setupDesktopClient(..., { replace: true }). Missing / foreign /
 * unknown entries are left alone.
 */
export async function refreshSameInstallConflicts(
  options: PostUpdateRefreshOptions = {},
): Promise<PostUpdateRefreshResult> {
  const directory = options.directory || defaultDirectory(options.home);
  const replaced: DesktopClientId[] = [];
  const skipped: DesktopClientId[] = [];
  const backups: string[] = [];

  for (const id of DESKTOP_CLIENTS) {
    const row = inspectDesktopClient(id, { ...options, directory });
    if (row.status !== 'conflict') continue;
    if (id === 'claude-code') {
      // Skill conflicts are foreign/modified installs — never silent replace.
      skipped.push(id);
      continue;
    }
    const raw = readRawHyperionEntry(id, { ...options, directory });
    if (
      !raw ||
      !isSameInstallHyperionConflict(raw, { dataDirectory: directory })
    ) {
      skipped.push(id);
      continue;
    }
    const result = await setupDesktopClient(id, {
      ...options,
      directory,
      replace: true,
    });
    replaced.push(id);
    if (result.backupFile) backups.push(result.backupFile);
  }

  return { replaced, skipped, backups };
}
