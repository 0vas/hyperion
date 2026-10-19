import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLocale, translate } from '../src/i18n/core.js';
test('resolves explicit or system language, regional variants and unsupported locales', () => {
  assert.equal(resolveLocale('system', ['es-PE']), 'es');
  assert.equal(resolveLocale('system', ['en-GB']), 'en');
  assert.equal(resolveLocale('system', ['fr-FR']), 'en');
  assert.equal(resolveLocale('es', ['en-US']), 'es');
});
test('translates product text and interpolates values without modifying their contents', () => {
  assert.equal(translate('en', 'Guardar elección'), 'Save choice');
  assert.equal(translate('es', 'Guardar elección'), 'Guardar elección');
  assert.equal(translate('en', 'Cancelar'), 'Cancel');
  assert.equal(translate('es', 'Cancelar'), 'Cancelar');
  assert.equal(translate('en', 'constructor'), 'constructor');
  assert.equal(
    translate('en', 'Ver datos: {0}', { 0: 'Mi tarea <script>' }),
    'View data: Mi tarea <script>',
  );
});

test('English catalog preserves interpolation placeholders for every message', async () => {
  const { default: english } = await import('../src/i18n/en.json', {
    with: { type: 'json' },
  });
  for (const [source, target] of Object.entries(english)) {
    assert.ok(target.trim(), source);
    assert.deepEqual(
      [...source.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
      [...target.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort(),
      source,
    );
  }
});
