import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLanguageStore } from '../desktop/language.mjs';
import { connectWithDialog } from '../desktop/onboarding.mjs';
import { createUpdateController } from '../desktop/update-dialog.mjs';
import { recoverStartup } from '../desktop/startup.mjs';
import { translate } from '../dist/i18n/core.js';
const t = (message, values) => translate('en', message, values);
test('desktop language follows system, persists explicit choices and rejects unsupported values', () => {
  const folder = mkdtempSync(join(tmpdir(), 'hyperion-language-'));
  try {
    const options = {
      file: join(folder, 'language.json'),
      systemLanguages: () => ['en-US'],
    };
    const language = createLanguageStore(options);
    assert.equal(language.get(), 'system');
    assert.equal(language.t('Ajustes'), 'Settings');
    language.set('es');
    assert.equal(createLanguageStore(options).t('Ajustes'), 'Ajustes');
    assert.throws(() => language.set('../invalid'));
    assert.equal(createLanguageStore(options).get(), 'es');
    language.set('system');
    assert.equal(createLanguageStore(options).t('Ajustes'), 'Settings');
    writeFileSync(options.file, '{broken');
    assert.equal(createLanguageStore(options).get(), 'system');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
test('native onboarding and update dialogs use the selected language', async () => {
  const messages = [],
    copied = [];
  await connectWithDialog({
    t,
    dialog: {
      showMessageBox: async (_window, options) => {
        messages.push(options);
        return { response: 0 };
      },
    },
    setup: async () => {},
    clipboard: { writeText: (text) => copied.push(text) },
  });
  assert.equal(messages[0].title, 'Connect Hyperion');
  assert.match(copied[0], /^Use Hyperion/);
  const updater = createUpdateController({
    t,
    channel: 'preview',
    app: { getVersion: () => '2026.10.12.0638' },
    getWindow: () => undefined,
    check: async () => undefined,
    dialog: {
      showMessageBox: async (_window, options) => messages.push(options),
    },
  });
  await updater.check();
  assert.equal(
    messages.at(-1).detail,
    'Installed version: 2026.10.12.0638 (Preview)',
  );
  const error = 'Diagnóstico del proceso';
  await recoverStartup({
    t,
    start: async () => {
      throw new Error(error);
    },
    record: async () => {},
    dialog: {
      showMessageBox: async (options) => {
        messages.push(options);
        return { response: 3 };
      },
    },
  });
  assert.ok(messages.at(-1).detail.startsWith(error));
  assert.equal(messages.at(-1).buttons[0], 'Retry');
});
