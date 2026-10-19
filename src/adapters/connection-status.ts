/**
 * Read-only inventory of local AI client Hyperion entries.
 * File presence ≠ tools loaded in an open chat.
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse } from 'smol-toml';
import { buildMcpServer } from './connections.js';
import { defaultDirectory } from './install.js';
import {
  inspectOwnedMcpRuntime,
  type OwnedRuntimePreflight,
} from './connection-runtime.js';

export const DESKTOP_CLIENTS = [
  'codex',
  'cursor',
  'claude-desktop',
  'claude-code',
  'antigravity',
] as const;

export type DesktopClientId = (typeof DESKTOP_CLIENTS)[number];

export type ConnectionStatusId =
  'configured' | 'missing' | 'conflict' | 'unknown';

/** Bounded display projection, not an arbitrary-string secret detector. See SECURITY.md. */
export type ConnectionEntryPreview = {
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  type?: string;
  envKeys?: string[];
  envPreview?: Record<string, string>;
  skillPath?: string;
  owner?: string;
};

export type ConnectionRow = {
  id: DesktopClientId;
  name: string;
  status: ConnectionStatusId;
  path?: string;
  detail?: string;
  existing?: ConnectionEntryPreview;
  expected?: ConnectionEntryPreview;
};

const REDACTED = '••••';

// Only path-shaped metadata is displayable. Shell text, URL syntax, environment
// expansion, control characters and ambiguous option text are not parsed here.
function previewPath(value: string): string | undefined {
  if (!/^(?:\/|\.\.?[\\/]|[A-Za-z]:[\\/])/.test(value)) return;
  if (/^\/[\\/]/.test(value)) return; // Network paths / protocol-relative URLs.
  const withoutDrive = value.replace(/^[A-Za-z]:/, '');
  if (
    value !== value.trim() ||
    /[\x00-\x1f\x7f?#+@$%="'`;&|<>:]/.test(withoutDrive) ||
    /\s-/.test(value)
  )
    return;
  return value;
}

function previewIdentifier(value: string): string | undefined {
  return /^[a-z][a-z0-9_-]{0,63}$/.test(value) ? value : undefined;
}

function previewUrl(value: string): string | undefined {
  if (!/^https?:\/\//i.test(value) || /[\s\\]/.test(value)) return;
  try {
    // Keep only the connection origin. Even unknown query keys or URL paths can
    // carry credentials, so userinfo, path, query and fragment are all dropped.
    return new URL(value).origin;
  } catch {
    return;
  }
}

const ARGUMENT_VALUES = new Map<string, (value: string) => string | undefined>([
  ['--agent', previewIdentifier],
  ['--agent-id', previewIdentifier],
  ['--client', previewIdentifier],
  ['--data-dir', previewPath],
  ['--cwd', previewPath],
  ['--url', previewUrl],
  ['--server-url', previewUrl],
  ['--base-url', previewUrl],
  ['--endpoint', previewUrl],
]);

function previewArguments(args: unknown[]): string[] {
  const visible: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (typeof argument !== 'string') break;
    if (argument === '--stdio') {
      visible.push(argument);
      continue;
    }
    const equals = argument.indexOf('=');
    const option = equals < 0 ? argument : argument.slice(0, equals);
    const project = ARGUMENT_VALUES.get(option);
    if (project) {
      const value = equals < 0 ? args[index + 1] : argument.slice(equals + 1);
      const safe = typeof value === 'string' ? project(value) : undefined;
      if (safe === undefined) break;
      if (equals < 0) {
        visible.push(option, safe);
        index++;
      } else visible.push(`${option}=${safe}`);
    } else {
      const safe = previewPath(argument) ?? previewUrl(argument);
      if (safe === undefined) break;
      visible.push(safe);
    }
  }
  // Do not guess how many values an unknown flag/header/script consumes. Hide
  // the entire remaining tail, even when a later token looks like a safe path.
  if (visible.length < args.length) visible.push(REDACTED);
  return visible.map((value) => truncateMiddle(value, 64));
}

function truncateMiddle(text: string, max = 72): string {
  if (text.length <= max) return text;
  const keep = Math.floor((max - 1) / 2);
  return `${text.slice(0, keep)}…${text.slice(-keep)}`;
}

export function sanitizeConnectionEntry(
  raw: Record<string, unknown>,
): ConnectionEntryPreview {
  const out: ConnectionEntryPreview = {};
  if (typeof raw.command === 'string')
    out.command = truncateMiddle(
      previewPath(raw.command) ??
        (/^[A-Za-z0-9][A-Za-z0-9._+-]{0,79}$/.test(raw.command)
          ? raw.command
          : REDACTED),
    );
  if (Array.isArray(raw.args)) out.args = previewArguments(raw.args);
  if (typeof raw.cwd === 'string')
    out.cwd = truncateMiddle(previewPath(raw.cwd) ?? REDACTED);
  if (typeof raw.type === 'string')
    out.type = ['stdio', 'http', 'sse', 'streamable-http'].includes(raw.type)
      ? raw.type
      : REDACTED;
  if (typeof raw.url === 'string') out.url = previewUrl(raw.url) ?? REDACTED;
  const env =
    raw.env && typeof raw.env === 'object' && !Array.isArray(raw.env)
      ? (raw.env as Record<string, unknown>)
      : undefined;
  if (env) {
    out.envKeys = Object.keys(env)
      .filter((key) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      .sort();
    out.envPreview = {};
    for (const [key, value] of Object.entries(env)) {
      if (typeof value !== 'string') continue;
      if (key === 'HYPERION_URL') {
        out.url = previewUrl(value) ?? REDACTED;
        out.envPreview[key] = out.url;
      } else if (key === 'HYPERION_AGENT_ID') {
        out.envPreview[key] = truncateMiddle(
          previewIdentifier(value) ?? REDACTED,
          48,
        );
      } else if (key === 'HYPERION_DATA_DIR') {
        out.envPreview[key] = truncateMiddle(
          previewPath(value) ?? REDACTED,
          48,
        );
      } else if (key === 'ELECTRON_RUN_AS_NODE') {
        out.envPreview[key] = value === '0' || value === '1' ? value : REDACTED;
      }
    }
  }
  if (typeof raw.skillPath === 'string')
    out.skillPath = truncateMiddle(previewPath(raw.skillPath) ?? REDACTED);
  if (typeof raw.owner === 'string')
    out.owner = raw.owner === 'hyperion' ? 'hyperion' : REDACTED;
  return out;
}

export type ConnectionInventory = {
  version: string;
  channel: string;
  serviceUrl: string;
  integrations: ConnectionRow[];
  summary: {
    configured: number;
    conflicts: number;
    total: number;
  };
};

export type InventoryWithPreflight = ConnectionInventory & {
  runtimePreflight: OwnedRuntimePreflight;
};

type Options = {
  home?: string;
  directory?: string;
  platform?: NodeJS.Platform;
  appData?: string;
  codexHome?: string;
  url?: string;
  version?: string;
  channel?: string;
};

const NAMES: Record<DesktopClientId, string> = {
  codex: 'Codex',
  cursor: 'Cursor',
  'claude-desktop': 'Claude Desktop',
  'claude-code': 'Claude Code',
  antigravity: 'Antigravity',
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid');
  return value as Record<string, unknown>;
}

export function desktopClientConfigPath(
  id: DesktopClientId,
  options: Options = {},
): { path: string } | { error: string } {
  const home = options.home || process.env.HYPERION_HOME || homedir();
  const platform = options.platform || process.platform;
  if (id === 'codex')
    return {
      path: resolve(
        options.codexHome ||
          (!options.home && process.env.CODEX_HOME) ||
          resolve(home, '.codex'),
        'config.toml',
      ),
    };
  if (id === 'cursor') return { path: resolve(home, '.cursor/mcp.json') };
  if (id === 'antigravity')
    return { path: resolve(home, '.gemini/config/mcp_config.json') };
  if (id === 'claude-code')
    return { path: resolve(home, '.claude/skills/hyperion/SKILL.md') };
  if (platform === 'darwin')
    return {
      path: resolve(
        home,
        'Library/Application Support/Claude/claude_desktop_config.json',
      ),
    };
  if (platform === 'win32')
    return {
      path: resolve(
        options.appData ||
          (!options.home && process.env.APPDATA) ||
          resolve(home, 'AppData/Roaming'),
        'Claude/claude_desktop_config.json',
      ),
    };
  return {
    error:
      'La conexión de Claude Desktop está disponible para macOS y Windows. Usa Claude Code en este sistema.',
  };
}

function expectedServer(
  id: DesktopClientId,
  directory: string,
  url: string,
): Record<string, unknown> {
  const agentId = id === 'claude-desktop' ? 'claude' : id;
  const { type: _type, ...server } = buildMcpServer(
    agentId,
    directory,
    true,
    url,
  );
  return server;
}

function inspectMcpClient(
  id: Exclude<DesktopClientId, 'claude-code'>,
  options: Options,
): ConnectionRow {
  const name = NAMES[id];
  const located = desktopClientConfigPath(id, options);
  if ('error' in located)
    return { id, name, status: 'unknown', detail: located.error };
  const path = located.path;
  if (!existsSync(path)) return { id, name, status: 'missing', path };
  let config: Record<string, unknown>;
  try {
    const text = readFileSync(path, 'utf8');
    config = object(id === 'codex' ? parse(text) : JSON.parse(text));
  } catch {
    return {
      id,
      name,
      status: 'unknown',
      path,
      detail: `No se pudo leer la configuración de ${id}.`,
    };
  }
  const key = id === 'codex' ? 'mcp_servers' : 'mcpServers';
  let servers: Record<string, unknown>;
  try {
    servers = config[key] === undefined ? {} : object(config[key]);
  } catch {
    return {
      id,
      name,
      status: 'unknown',
      path,
      detail: `No se pudo leer la configuración de ${id}.`,
    };
  }
  if (servers.hyperion === undefined)
    return { id, name, status: 'missing', path };
  const home = options.home || process.env.HYPERION_HOME || homedir();
  const directory = options.directory || defaultDirectory(home);
  const url =
    options.url || process.env.HYPERION_URL || 'http://127.0.0.1:4317';
  let existingRaw: Record<string, unknown> = {};
  let expectedRaw: Record<string, unknown> = {};
  try {
    existingRaw = object(servers.hyperion);
    const { type: existingType, ...comparable } = existingRaw;
    expectedRaw = expectedServer(id, directory, url);
    if (
      (!existingType || existingType === 'stdio') &&
      isDeepStrictEqual(JSON.parse(JSON.stringify(comparable)), expectedRaw)
    )
      return { id, name, status: 'configured', path };
  } catch {
    /* Fall through to conflict. */
  }
  return {
    id,
    name,
    status: 'conflict',
    path,
    detail: `Ya existe otra conexión Hyperion en ${id}. No se sobrescribió.`,
    existing: sanitizeConnectionEntry(existingRaw),
    expected: sanitizeConnectionEntry({
      type: 'stdio',
      ...expectedRaw,
    }),
  };
}

function inspectClaudeCode(options: Options): ConnectionRow {
  const id = 'claude-code';
  const name = NAMES[id];
  const located = desktopClientConfigPath(id, options);
  if ('error' in located)
    return { id, name, status: 'unknown', detail: located.error };
  const path = located.path;
  const skillDir = resolve(path, '..');
  const manifestPath = resolve(skillDir, '.hyperion-skill.json');
  if (!existsSync(path)) return { id, name, status: 'missing', path };
  try {
    if (existsSync(manifestPath)) {
      const manifest = object(JSON.parse(readFileSync(manifestPath, 'utf8')));
      if (manifest.owner === 'hyperion')
        return { id, name, status: 'configured', path };
      return {
        id,
        name,
        status: 'conflict',
        path,
        detail: `Ya existe otra conexión Hyperion en ${id}. No se sobrescribió.`,
        existing: sanitizeConnectionEntry({
          skillPath: path,
          owner: String(manifest.owner ?? ''),
        }),
        expected: sanitizeConnectionEntry({
          skillPath: path,
          owner: 'hyperion',
        }),
      };
    }
    const skill = readFileSync(path, 'utf8');
    if (/^name:\s*hyperion\b/m.test(skill))
      return { id, name, status: 'configured', path };
    return {
      id,
      name,
      status: 'conflict',
      path,
      detail: `Ya existe otra conexión Hyperion en ${id}. No se sobrescribió.`,
      existing: sanitizeConnectionEntry({ skillPath: path }),
      expected: sanitizeConnectionEntry({
        skillPath: path,
        owner: 'hyperion',
      }),
    };
  } catch {
    return {
      id,
      name,
      status: 'unknown',
      path,
      detail: `No se pudo leer la configuración de ${id}.`,
    };
  }
}

export function inspectDesktopClient(
  id: DesktopClientId,
  options: Options = {},
): ConnectionRow {
  if (id === 'claude-code') return inspectClaudeCode(options);
  return inspectMcpClient(id, options);
}

export function inspectDesktopConnections(
  options: Options = {},
): ConnectionInventory {
  const integrations = DESKTOP_CLIENTS.map((id) =>
    inspectDesktopClient(id, options),
  );
  const configured = integrations.filter(
    (i) => i.status === 'configured',
  ).length;
  const conflicts = integrations.filter((i) => i.status === 'conflict').length;
  return {
    version: options.version || '',
    channel: options.channel || '',
    serviceUrl:
      options.url || process.env.HYPERION_URL || 'http://127.0.0.1:4317',
    integrations,
    summary: {
      configured,
      conflicts,
      total: integrations.length,
    },
  };
}

/** Add owned-file observations without changing the synchronous config API. */
export async function inspectDesktopConnectionsWithPreflight(
  options: Options = {},
): Promise<InventoryWithPreflight> {
  return {
    ...inspectDesktopConnections(options),
    runtimePreflight: await inspectOwnedMcpRuntime(),
  };
}
