import { translate, type Locale } from '../i18n/core';
import { getLocale } from './i18n';

const MESSAGES = {
  requestFailed: 'No se pudo completar la solicitud.',
  configured:
    'Conexión configurada. Reinicia tu aplicación de IA y abre un chat nuevo.',
  replaced:
    'Conexión reemplazada. Reinicia tu aplicación de IA y abre un chat nuevo.',
  invalidConfiguration:
    'La configuración no es un objeto válido. No se modificó.',
  unknownClient:
    'Cliente desconocido. Elige Codex, Cursor, Claude o Antigravity.',
  unsupportedPlatform:
    'La conexión de Claude Desktop está disponible para macOS y Windows. Usa Claude Code en este sistema.',
  configurationChanged:
    'La configuración cambió durante la conexión. Vuelve a intentarlo.',
  unreadable: 'No se pudo leer la configuración de {0}.',
  unreadableUnchanged:
    'No se pudo leer la configuración de {0}. No se modificó: {1}',
  conflict: 'Ya existe otra conexión Hyperion en {0}. No se sobrescribió.',
  conflictUnchanged:
    'Ya existe otra conexión Hyperion en {0}. No se sobrescribió: {1}',
  tomlMerge:
    'La estructura TOML requiere combinar la conexión manualmente. No se modificó: {0}',
  skillConflict:
    'Conflicto de skill: {0} no está administrado por Hyperion o se modificó. No se sobrescribió.',
} as const;

const CLIENT_NAMES = {
  codex: 'Codex',
  cursor: 'Cursor',
  'claude-desktop': 'Claude Desktop',
  'claude-code': 'Claude Code',
  antigravity: 'Antigravity',
} as const;

export type ConnectionMessage =
  | {
      kind: 'product';
      key: keyof typeof MESSAGES;
      values?: Record<string, string>;
    }
  | { kind: 'diagnostic'; text: string };

export function connectionMessage(
  key: keyof typeof MESSAGES,
  values?: Record<string, string>,
): ConnectionMessage {
  return { kind: 'product', key, ...(values ? { values } : {}) };
}

/** Recognize only Hyperion connection templates, not arbitrary diagnostics.
 * Keep descriptors until rendering so existing notices follow locale changes.
 * Paths are opaque interpolation values; never translate or normalize them.
 */
export function describeConnectionMessage(text: string): ConnectionMessage {
  for (const key of [
    'requestFailed',
    'configured',
    'replaced',
    'invalidConfiguration',
    'unknownClient',
    'unsupportedPlatform',
    'configurationChanged',
  ] as const) {
    if (text === MESSAGES[key]) return connectionMessage(key);
  }
  for (const [id, name] of Object.entries(CLIENT_NAMES)) {
    if (text === `No se pudo leer la configuración de ${id}.`)
      return connectionMessage('unreadable', { 0: name });
    if (
      text === `Ya existe otra conexión Hyperion en ${id}. No se sobrescribió.`
    )
      return connectionMessage('conflict', { 0: name });
    for (const [key, prefix] of [
      [
        'unreadableUnchanged',
        `No se pudo leer la configuración de ${id}. No se modificó: `,
      ],
      [
        'conflictUnchanged',
        `Ya existe otra conexión Hyperion en ${id}. No se sobrescribió: `,
      ],
    ] as const) {
      if (text.startsWith(prefix) && text.length > prefix.length)
        return connectionMessage(key, {
          0: name,
          1: text.slice(prefix.length),
        });
    }
  }
  const toml =
    'La estructura TOML requiere combinar la conexión manualmente. No se modificó: ';
  if (text.startsWith(toml) && text.length > toml.length)
    return connectionMessage('tomlMerge', { 0: text.slice(toml.length) });
  const skillPrefix = 'Skill conflict: ';
  const skillSuffix =
    ' is not managed by Hyperion or was modified. It was not overwritten.';
  if (
    text.startsWith(skillPrefix) &&
    text.endsWith(skillSuffix) &&
    text.length > skillPrefix.length + skillSuffix.length
  )
    return connectionMessage('skillConflict', {
      0: text.slice(skillPrefix.length, -skillSuffix.length),
    });
  return { kind: 'diagnostic', text };
}

export function formatConnectionMessage(
  message: ConnectionMessage | null,
  locale: Locale = getLocale(),
): string {
  if (!message) return '';
  return message.kind === 'diagnostic'
    ? message.text
    : translate(locale, MESSAGES[message.key], message.values);
}
