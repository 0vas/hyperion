import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createUpdateController } from '../desktop/update-dialog.mjs';

const userData = mkdtempSync(join(tmpdir(), 'hyperion-update-ui-'));
const app = {
  getVersion: () => '2026.10.12.2204',
  getPath: (name) =>
    name === 'userData'
      ? userData
      : name === 'downloads'
        ? join(userData, 'downloads')
        : '',
};
test.after(() => rmSync(userData, { recursive: true, force: true }));
const update = {
  version: '2026.10.15.1916',
  tag: 'v2026.10.15.1916',
  asset: { name: 'Hyperion-2026.10.15.1916-mac-arm64.dmg' },
};

test('Actualizar y reiniciar requires consent, downloads under userData/updates, then applies without a save dialog', async () => {
  const calls = [];
  const progress = [];
  const boxes = [];
  const controller = createUpdateController({
    platform: 'darwin',
    app: {
      ...app,
      relaunch: () => calls.push(['relaunch']),
      quit: () => calls.push(['quit']),
    },
    getWindow: () => ({
      isDestroyed: () => false,
      setProgressBar: (p) => progress.push(p),
    }),
    check: async () => update,
    dialog: {
      showMessageBox: async (_window, options) => {
        boxes.push(options);
        return { response: 0 };
      },
      showSaveDialog: async () => {
        throw new Error('save dialog must not open for update-and-restart');
      },
    },
    download: async (info, file, { onProgress }) => {
      calls.push(['download', info.version, file]);
      onProgress(0.5);
      onProgress(1);
    },
    apply: async (file) => {
      calls.push(['apply', file]);
    },
    shell: { showItemInFolder: (path) => calls.push(['show', path]) },
  });
  await controller.check();
  assert.equal(boxes[0].message, 'Actualización disponible');
  assert.match(
    boxes[0].detail,
    /Se descarga desde GitHub, se verifica el digest y Hyperion se reinicia/,
  );
  assert.equal(boxes[0].buttons[0], 'Actualizar y reiniciar');
  assert.equal(boxes[0].buttons[1], 'Ahora no');
  assert.equal(boxes[0].buttons[2], 'Descargar instalador…');
  const installer = join(
    userData,
    'updates',
    'Hyperion-2026.10.15.1916-mac-arm64.dmg',
  );
  assert.deepEqual(calls, [
    ['download', '2026.10.15.1916', installer],
    ['apply', installer],
    ['relaunch'],
    ['quit'],
  ]);
  assert.deepEqual(progress, [0.5, 1, -1]);
});

test('Windows Actualizar y reiniciar applies then quits without app.relaunch', async () => {
  const calls = [];
  const controller = createUpdateController({
    platform: 'win32',
    app: {
      ...app,
      relaunch: () => calls.push(['relaunch']),
      quit: () => calls.push(['quit']),
    },
    getWindow: () => undefined,
    check: async () => ({
      ...update,
      asset: { name: 'Hyperion-2026.10.15.1916-win-x64.exe' },
    }),
    dialog: {
      showMessageBox: async () => ({ response: 0 }),
      showSaveDialog: async () => {
        throw new Error('save dialog must not open');
      },
    },
    download: async (info, file) => calls.push(['download', file]),
    apply: async (file) => calls.push(['apply', file]),
    shell: { showItemInFolder: () => {} },
  });
  await controller.check();
  assert.deepEqual(
    calls.map((c) => c[0]),
    ['download', 'apply', 'quit'],
  );
});

test('Ahora no and cancelled save-as never download or apply', async () => {
  for (const { response, save } of [
    { response: 1, save: null },
    { response: 2, save: { canceled: true } },
  ]) {
    let downloads = 0;
    let applies = 0;
    const controller = createUpdateController({
      app,
      getWindow: () => undefined,
      check: async () => update,
      dialog: {
        showMessageBox: async () => ({ response }),
        showSaveDialog: async () => save || { canceled: true },
      },
      download: async () => downloads++,
      apply: async () => applies++,
      relaunch: async () => {},
    });
    await controller.check();
    assert.equal(downloads, 0);
    assert.equal(applies, 0);
  }
});

test('Descargar instalador… still uses save-as and never applies', async () => {
  const calls = [];
  const controller = createUpdateController({
    app,
    getWindow: () => undefined,
    check: async () => update,
    dialog: {
      showMessageBox: async (_w, options) => {
        calls.push(['box', options.buttons?.[0]]);
        return {
          response: calls.filter((c) => c[0] === 'box').length === 1 ? 2 : 0,
        };
      },
      showSaveDialog: async () => ({
        filePath: '/downloads/Hyperion.dmg',
        canceled: false,
      }),
    },
    download: async (_info, file) => calls.push(['download', file]),
    apply: async () => calls.push(['apply']),
    relaunch: async () => calls.push(['relaunch']),
    shell: { showItemInFolder: (path) => calls.push(['show', path]) },
  });
  await controller.check();
  assert.deepEqual(calls, [
    ['box', 'Actualizar y reiniciar'],
    ['download', '/downloads/Hyperion.dmg'],
    ['box', 'Mostrar instalador'],
    ['show', '/downloads/Hyperion.dmg'],
  ]);
});

test('apply failure offers Mostrar instalador and does not quit', async () => {
  const calls = [];
  let quit = false;
  const controller = createUpdateController({
    app: {
      ...app,
      quit: () => {
        quit = true;
      },
    },
    getWindow: () => undefined,
    check: async () => update,
    dialog: {
      showMessageBox: async (_w, options) => {
        calls.push(options);
        if (
          options.message ===
          'No se pudo actualizar. Revisa la red o el digest del instalador.'
        )
          return { response: 0 };
        return { response: 0 };
      },
    },
    download: async () => {},
    apply: async () => {
      throw new Error('codesign failed');
    },
    shell: { showItemInFolder: (path) => calls.push(['show', path]) },
  });
  await controller.check();
  assert.ok(
    calls.some(
      (m) =>
        m &&
        typeof m === 'object' &&
        m.message ===
          'No se pudo actualizar. Revisa la red o el digest del instalador.',
    ),
  );
  assert.ok(calls.some((c) => Array.isArray(c) && c[0] === 'show'));
  assert.equal(quit, false);
});

test('background network failures stay quiet and manual failures report an error', async () => {
  const messages = [];
  const controller = createUpdateController({
    app,
    getWindow: () => undefined,
    check: async () => {
      throw new Error('offline');
    },
    dialog: { showMessageBox: async (_w, m) => messages.push(m) },
  });
  await controller.check(false);
  assert.equal(messages.length, 0);
  await controller.check(true);
  assert.equal(messages.length, 1);
});
