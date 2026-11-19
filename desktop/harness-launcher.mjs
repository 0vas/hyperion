import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir, platform as hostPlatform } from 'node:os';
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path';

const CONFIG_FILE = 'live-harness-launcher.json';

export const LIVE_HARNESSES = [
  { id: 'codex', label: 'Codex', executable: 'codex' },
  { id: 'claude', label: 'Claude Code', executable: 'claude' },
  { id: 'cursor', label: 'Cursor Agent', executable: 'cursor-agent' },
  { id: 'antigravity', label: 'Antigravity', executable: 'agy' },
];

function definition(id) {
  return LIVE_HARNESSES.find((harness) => harness.id === id) || null;
}

function executableName(harness, platform) {
  return platform === 'win32'
    ? `${harness.executable}.exe`
    : harness.executable;
}

function candidates(
  id,
  {
    env = process.env,
    platform = hostPlatform(),
    home = homedir(),
    pathDelimiter = delimiter,
    extraCandidates = [],
  } = {},
) {
  const harness = definition(id);
  if (!harness) return [];
  const name = executableName(harness, platform);
  const fromPath = String(env.PATH || '')
    .split(pathDelimiter)
    .filter(Boolean)
    .map((entry) => resolve(entry, name));
  const common =
    platform === 'win32'
      ? [
          env.LOCALAPPDATA &&
            join(env.LOCALAPPDATA, 'Programs', harness.label, name),
          env.ProgramFiles && join(env.ProgramFiles, harness.label, name),
        ]
      : [
          '/opt/homebrew/bin/' + name,
          '/usr/local/bin/' + name,
          '/usr/bin/' + name,
          join(home, '.local', 'bin', name),
        ];
  const providerPaths =
    id === 'antigravity' ? [join(home, '.gemini', 'bin', name)] : [];
  return [...extraCandidates, ...fromPath, ...common, ...providerPaths].filter(
    (candidate) => typeof candidate === 'string' && candidate.length > 0,
  );
}

export function isUsableHarnessExecutable(
  path,
  { platform = hostPlatform() } = {},
) {
  if (typeof path !== 'string' || !isAbsolute(path)) return false;
  try {
    if (!statSync(path).isFile()) return false;
    if (platform === 'win32') return path.toLowerCase().endsWith('.exe');
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Stores only explicit local paths and a provider choice; credentials remain private. */
export class LiveHarnessLauncherStore {
  constructor(userData) {
    this.path = resolve(userData, CONFIG_FILE);
  }

  read() {
    if (!existsSync(this.path)) return {};
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  write(value) {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(this.path, JSON.stringify(value), { mode: 0o600 });
  }

  getSelected() {
    const selected = this.read().selected;
    return definition(selected) ? selected : null;
  }

  select(id) {
    if (!definition(id)) throw new Error('Unknown local chat harness.');
    this.write({ ...this.read(), selected: id });
  }

  getExecutable(id) {
    const executable = this.read().executables?.[id];
    return typeof executable === 'string' ? executable : null;
  }

  saveExecutable(id, executable) {
    const current = this.read();
    this.write({
      ...current,
      executables: { ...(current.executables || {}), [id]: executable },
    });
  }
}

export function resolveHarness(
  id,
  {
    userData,
    store = new LiveHarnessLauncherStore(userData),
    options = {},
  } = {},
) {
  const harness = definition(id);
  if (!harness)
    return { id, label: id, status: 'unsupported', executable: null };
  const platform = options.platform || hostPlatform();
  const explicit = store.getExecutable(id);
  if (explicit)
    return isUsableHarnessExecutable(explicit, { platform })
      ? {
          ...harness,
          status: 'ready',
          executable: explicit,
          source: 'selected',
        }
      : {
          ...harness,
          status: 'invalid-selection',
          executable: null,
          source: 'selected',
        };
  const executable = candidates(id, {
    ...options,
    extraCandidates: options.extraCandidates?.[id] || [],
  }).find((candidate) => isUsableHarnessExecutable(candidate, { platform }));
  return executable
    ? { ...harness, status: 'ready', executable, source: 'discovered' }
    : { ...harness, status: 'missing', executable: null, source: null };
}

export function resolveHarnesses({ userData, store, options } = {}) {
  return LIVE_HARNESSES.map((harness) =>
    resolveHarness(harness.id, { userData, store, options }),
  );
}

export function saveHarnessExecutable({
  userData,
  id,
  executable,
  store = new LiveHarnessLauncherStore(userData),
  platform = hostPlatform(),
} = {}) {
  if (!definition(id) || !isUsableHarnessExecutable(executable, { platform }))
    return { saved: false, status: 'invalid-selection' };
  store.saveExecutable(id, executable);
  return { saved: true, status: 'ready' };
}

export function harnessGuidance(id, status) {
  const label = definition(id)?.label || 'selected harness';
  if (status === 'invalid-selection')
    return `The selected ${label} application is no longer usable. Choose its executable again.`;
  return `${label} is not installed or is not available to Hyperion Desktop. Install it locally, then choose its executable and retry.`;
}
