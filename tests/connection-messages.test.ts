import assert from 'node:assert/strict';
import test from 'node:test';
import {
  connectionMessage,
  describeConnectionMessage,
  formatConnectionMessage,
} from '../src/client/connection-messages.js';

test('recognizes only exact inventory templates for known client IDs', () => {
  for (const [id, name] of Object.entries({
    codex: 'Codex',
    cursor: 'Cursor',
    'claude-desktop': 'Claude Desktop',
    'claude-code': 'Claude Code',
    antigravity: 'Antigravity',
  })) {
    assert.equal(
      formatConnectionMessage(
        describeConnectionMessage(`No se pudo leer la configuración de ${id}.`),
        'en',
      ),
      `Could not read ${name}'s local configuration.`,
    );
    assert.equal(
      formatConnectionMessage(
        describeConnectionMessage(
          `Ya existe otra conexión Hyperion en ${id}. No se sobrescribió.`,
        ),
        'en',
      ),
      'The existing Hyperion entry differs. It has been left unchanged.',
    );
  }
});

test('known setup explanations translate without changing opaque paths', () => {
  const path = 'C:\\Synthetic\\Ajustes {0}\\<archivo>\\config.json';
  const examples = [
    [
      `No se pudo leer la configuración de cursor. No se modificó: ${path}`,
      `Could not read the configuration for Cursor. It was not modified: ${path}`,
    ],
    [
      `Ya existe otra conexión Hyperion en codex. No se sobrescribió: ${path}`,
      `Another Hyperion connection already exists in Codex. It was not overwritten: ${path}`,
    ],
    [
      `La estructura TOML requiere combinar la conexión manualmente. No se modificó: ${path}`,
      `The TOML structure requires manually merging the connection. It was not modified: ${path}`,
    ],
    [
      `Skill conflict: ${path} is not managed by Hyperion or was modified. It was not overwritten.`,
      `Skill conflict: ${path} is not managed by Hyperion or was modified. It was not overwritten.`,
    ],
  ];
  for (const [source, english] of examples) {
    const message = describeConnectionMessage(source!);
    assert.equal(formatConnectionMessage(message, 'en'), english);
    assert.ok(formatConnectionMessage(message, 'es').includes(path));
  }
});

test('known fixed product failures and retained success notices render in the requested locale', () => {
  const examples = [
    [
      'La configuración no es un objeto válido. No se modificó.',
      'The configuration is not a valid object. It was not modified.',
    ],
    [
      'Cliente desconocido. Elige Codex, Cursor, Claude o Antigravity.',
      'Unknown client. Choose Codex, Cursor, Claude or Antigravity.',
    ],
    [
      'La conexión de Claude Desktop está disponible para macOS y Windows. Usa Claude Code en este sistema.',
      'The Claude Desktop connection is available on macOS and Windows.',
    ],
    [
      'La configuración cambió durante la conexión. Vuelve a intentarlo.',
      'The configuration changed during setup. Try again.',
    ],
    ['No se pudo completar la solicitud.', 'Could not complete the request.'],
  ];
  for (const [source, english] of examples) {
    const message = describeConnectionMessage(source!);
    assert.equal(formatConnectionMessage(message, 'en'), english);
    assert.equal(
      formatConnectionMessage(message, 'es'),
      source?.includes('Usa Claude Code')
        ? 'La conexión de Claude Desktop está disponible en macOS y Windows.'
        : source,
    );
    assert.equal(formatConnectionMessage(message, 'en'), english);
  }
  for (const key of ['configured', 'replaced'] as const) {
    const message = connectionMessage(key);
    assert.match(formatConnectionMessage(message, 'en'), /^Connection /);
    assert.match(formatConnectionMessage(message, 'es'), /^Conexión /);
    assert.match(formatConnectionMessage(message, 'en'), /^Connection /);
  }
});

test('unknown, partial and embedded diagnostics stay verbatim in both languages', () => {
  for (const text of [
    'Diagnóstico original: Ajustes {0} — /synthetic/mi ruta',
    'Synthetic setup failure',
    'No se pudo leer la configuración de unknown-client.',
    'No se pudo leer la configuración de cursor. Extra evidence',
    'La configuración cambió durante la conexión. Vuelve a intentarlo. Extra evidence',
    'No se pudo leer la configuración de cursor. No se modificó: ',
    'Skill conflict:  is not managed by Hyperion or was modified. It was not overwritten.',
    'User text: Ya existe otra conexión Hyperion en codex. No se sobrescribió.',
    '__proto__',
  ]) {
    const message = describeConnectionMessage(text);
    assert.equal(message.kind, 'diagnostic');
    for (const locale of ['es', 'en'] as const)
      assert.equal(formatConnectionMessage(message, locale), text);
  }
  assert.equal(formatConnectionMessage(null), '');
});
