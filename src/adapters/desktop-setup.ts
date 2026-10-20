import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { parse, stringify } from 'smol-toml';
import { generateConnection } from './connections.js';
import { defaultDirectory, installSkill } from './install.js';

type Options = {
  home?: string;
  directory?: string;
  platform?: NodeJS.Platform;
  appData?: string;
  codexHome?: string;
  url?: string;
  /** Explicit confirmed overwrite of a conflicting hyperion entry (never silent). */
  replace?: boolean;
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('La configuración no es un objeto válido. No se modificó.');
  return value as Record<string, unknown>;
}
/** Configure local clients without depending on their CLIs or a system Node. */
export async function setupDesktopClient(id: string, options: Options = {}) {
  if (
    ![
      'codex',
      'cursor',
      'claude-desktop',
      'claude-code',
      'antigravity',
    ].includes(id)
  )
    throw new Error(
      'Cliente desconocido. Elige Codex, Cursor, Claude o Antigravity.',
    );
  const home = options.home || process.env.HYPERION_HOME || homedir();
  const directory = options.directory || defaultDirectory(home);
  const installClaudeSkill = () =>
    installSkill({
      home,
      directory,
      destination: resolve(home, '.claude/skills'),
      url: options.url,
    });
  if (id === 'claude-code') {
    const result = installClaudeSkill();
    return {
      client: id,
      configFile: resolve(result.paths[0]!, 'SKILL.md'),
      backupFile: undefined,
    };
  }
  const platform = options.platform || process.platform;
  let file: string;
  if (id === 'codex')
    file = resolve(
      options.codexHome ||
        (!options.home && process.env.CODEX_HOME) ||
        resolve(home, '.codex'),
      'config.toml',
    );
  else if (id === 'antigravity')
    file = resolve(home, '.gemini/config/mcp_config.json');
  else if (id === 'cursor') file = resolve(home, '.cursor/mcp.json');
  else if (platform === 'darwin')
    file = resolve(
      home,
      'Library/Application Support/Claude/claude_desktop_config.json',
    );
  else if (platform === 'win32')
    file = resolve(
      options.appData ||
        (!options.home && process.env.APPDATA) ||
        resolve(home, 'AppData/Roaming'),
      'Claude/claude_desktop_config.json',
    );
  else
    throw new Error(
      'La conexión de Claude Desktop está disponible para macOS y Windows. Usa Claude Code en este sistema.',
    );

  const original = existsSync(file) ? readFileSync(file, 'utf8') : undefined;
  let config: Record<string, unknown>;
  try {
    config = object(
      original === undefined
        ? {}
        : id === 'codex'
          ? parse(original)
          : JSON.parse(original),
    );
  } catch {
    throw new Error(
      `No se pudo leer la configuración de ${id}. No se modificó: ${file}`,
    );
  }
  const key = id === 'codex' ? 'mcp_servers' : 'mcpServers';
  const servers = config[key] === undefined ? {} : object(config[key]);
  const generated = generateConnection(
    id === 'claude-desktop' ? 'claude' : id,
    directory,
    true,
    options.url,
  );
  const { type: _type, ...server } = generated.config.mcpServers.hyperion;
  // Do not replace a different connection or silently re-enable a disabled server
  // unless the human confirmed an explicit replace.
  let replaceConflict = false;
  if (servers.hyperion !== undefined) {
    const existing = object(servers.hyperion);
    const { type: existingType, ...comparable } = existing;
    if (
      (!existingType || existingType === 'stdio') &&
      isDeepStrictEqual(JSON.parse(JSON.stringify(comparable)), server)
    ) {
      // Claude Desktop still refreshes the portable skill when MCP already matches.
      if (id === 'claude-desktop') installClaudeSkill();
      return { client: id, configFile: file, backupFile: undefined };
    }
    if (!options.replace)
      throw new Error(
        `Ya existe otra conexión Hyperion en ${id}. No se sobrescribió: ${file}`,
      );
    replaceConflict = true;
  }
  const text =
    id === 'codex'
      ? replaceConflict
        ? stringify({
            ...config,
            mcp_servers: { ...servers, hyperion: server },
          }) + '\n'
        : (original || '') +
          '\n# Hyperion: conexión local\n' +
          stringify({ mcp_servers: { hyperion: server } })
      : JSON.stringify(
          { ...config, [key]: { ...servers, hyperion: server } },
          null,
          2,
        ) + '\n';
  // Appending preserves Codex comments and preferences. Inline-table conflicts are rejected
  // unless replace rewrites the parsed object (comments may be lost — confirmed destructive).
  if (id === 'codex' && !replaceConflict) {
    try {
      parse(text);
    } catch {
      throw new Error(
        `La estructura TOML requiere combinar la conexión manualmente. No se modificó: ${file}`,
      );
    }
  }
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  if ((existsSync(file) ? readFileSync(file, 'utf8') : undefined) !== original)
    throw new Error(
      'La configuración cambió durante la conexión. Vuelve a intentarlo.',
    );
  const backupFile =
    original === undefined
      ? undefined
      : `${file}.hyperion-${crypto.randomUUID()}.bak`;
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    if (backupFile)
      writeFileSync(backupFile, original!, { mode: 0o600, flag: 'wx' });
    writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
  // Desktop MCP entry alone does not refresh Claude Code's skill path; install it here too.
  if (id === 'claude-desktop') installClaudeSkill();
  return { client: id, configFile: file, backupFile };
}
