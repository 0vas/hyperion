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

const CONFIG_FILE = 'live-codex-launcher.json';

function executableName(platform) {
  return platform === 'win32' ? 'codex.exe' : 'codex';
}

/**
 * The Desktop host, rather than a shell, resolves this fixed executable name.
 * It deliberately does not run `which`, a login shell, or an installer.
 */
export function codexCandidatePaths({
  env = process.env,
  platform = hostPlatform(),
  home = homedir(),
  pathDelimiter = delimiter,
  extraCandidates = [],
} = {}) {
  const name = executableName(platform);
  const fromPath = String(env.PATH || '')
    .split(pathDelimiter)
    .filter(Boolean)
    .map((entry) => resolve(entry, name));
  const common =
    platform === 'win32'
      ? [
          env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'Codex', name),
          env.ProgramFiles && join(env.ProgramFiles, 'Codex', name),
        ]
      : [
          '/opt/homebrew/bin/codex',
          '/usr/local/bin/codex',
          '/usr/bin/codex',
          join(home, '.local', 'bin', 'codex'),
        ];
  return [...extraCandidates, ...fromPath, ...common].filter(
    (candidate) => typeof candidate === 'string' && candidate.length > 0,
  );
}

export function isUsableCodexExecutable(
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

/** Persist only a user-selected executable path; credentials stay in CODEX_HOME. */
export class LiveCodexLauncherStore {
  constructor(userData) {
    this.path = resolve(userData, CONFIG_FILE);
  }

  read() {
    if (!existsSync(this.path)) return null;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8'));
      return typeof parsed?.executable === 'string' ? parsed.executable : null;
    } catch {
      return null;
    }
  }

  save(executable) {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    writeFileSync(this.path, JSON.stringify({ executable }), { mode: 0o600 });
  }
}

/** Explicit configuration wins and fails closed if it goes stale. */
export function resolveCodexExecutable({
  userData,
  store = new LiveCodexLauncherStore(userData),
  options = {},
} = {}) {
  const explicit = store.read();
  const platform = options.platform || hostPlatform();
  if (explicit)
    return isUsableCodexExecutable(explicit, { platform })
      ? { status: 'ready', executable: explicit, source: 'selected' }
      : { status: 'invalid-selection', executable: null, source: 'selected' };
  const executable = codexCandidatePaths(options).find((candidate) =>
    isUsableCodexExecutable(candidate, { platform }),
  );
  return executable
    ? { status: 'ready', executable, source: 'discovered' }
    : { status: 'missing', executable: null, source: null };
}

export function saveCodexExecutable({
  userData,
  executable,
  store = new LiveCodexLauncherStore(userData),
  platform = hostPlatform(),
} = {}) {
  if (!isUsableCodexExecutable(executable, { platform }))
    return { saved: false, status: 'invalid-selection' };
  store.save(executable);
  return { saved: true, status: 'ready' };
}

export function codexLauncherGuidance(status) {
  if (status === 'invalid-selection')
    return 'The selected Codex application is no longer usable. Choose the Codex executable again.';
  return 'Codex is not installed or is not available to Hyperion Desktop. Install Codex locally, then choose its executable and retry.';
}
