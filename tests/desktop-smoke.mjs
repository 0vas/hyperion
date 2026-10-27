import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { _electron, chromium } from '@playwright/test';

test('desktop and split share one real service, decisions and agent progress', async () => {
  const home = mkdtempSync(join(tmpdir(), 'hyperion-desktop-smoke-'));
  const directory = join(home, 'data');
  const env = {
    ...process.env,
    HYPERION_HOME: home,
    HYPERION_DATA_DIR: directory,
    HYPERION_PORT: '4339',
    HYPERION_URL: 'http://127.0.0.1:4339',
  };
  const service = spawn(process.execPath, ['dist/server/main.js'], {
    cwd: process.cwd(),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let app, browser;
  try {
    await Promise.race([
      once(service.stdout, 'data'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Service timeout')), 8000).unref(),
      ),
    ]);
    const token = JSON.parse(
      readFileSync(join(directory, 'credentials.json'), 'utf8'),
    ).agentToken;
    const api = async (path, body) => {
      const response = await fetch(env.HYPERION_URL + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(response.ok, true, await response.clone().text());
      return response.json();
    };
    const run = await api('/api/runs', {
      commandId: crypto.randomUUID(),
      plan: {
        title: 'Mismo flujo en escritorio y split',
        steps: [
          {
            id: 'choice',
            title: 'Elegir audiencia',
            kind: 'manual',
            outputs: [
              {
                name: 'beginners',
                description: 'Incluir principiantes',
                type: 'boolean',
                required: true,
              },
            ],
          },
          {
            id: 'work',
            title: 'Preparar guía',
            kind: 'agent',
            dependencies: ['choice'],
          },
        ],
      },
    });
    const profile = join(home, 'profile');
    mkdirSync(profile);
    writeFileSync(
      join(profile, 'language.json'),
      JSON.stringify({ language: 'es' }),
    );
    const args = [
      `--user-data-dir=${profile}`,
      `--hyperion-run=${run.id}`,
      `--hyperion-url=${env.HYPERION_URL}`,
      `--hyperion-directory=${directory}`,
    ];
    app = await _electron.launch({
      ...(process.env.HYPERION_DESKTOP_EXECUTABLE
        ? { executablePath: process.env.HYPERION_DESKTOP_EXECUTABLE }
        : {}),
      args: process.env.HYPERION_DESKTOP_EXECUTABLE
        ? args
        : ['desktop/main.mjs', ...args],
      env,
    });
    const page = await app.firstWindow();
    await page.getByRole('heading', { name: run.title }).waitFor();
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    assert.equal(
      await page
        .locator('.brand-mark img')
        .evaluate((img) => img.complete && img.naturalWidth > 0),
      true,
    );
    assert.ok(
      await app.evaluate(({ Menu }) =>
        Menu.getApplicationMenu().items[0].submenu.items.some(
          (item) => item.label === 'Buscar actualizaciones…',
        ),
      ),
    );
    await page
      .getByRole('button', { name: 'Ver paso: Elegir audiencia', exact: true })
      .click();
    await page.getByRole('radio', { name: 'No', exact: true }).check();
    await app.evaluate(({ Menu }) => {
      const language = Menu.getApplicationMenu().items[0].submenu.items.find(
        (item) => item.label === 'Idioma',
      );
      language.submenu.items.find((item) => item.label === 'English').click();
    });
    await page
      .getByRole('button', { name: 'Save choice', exact: true })
      .waitFor();
    assert.equal(
      await page.getByRole('radio', { name: 'No', exact: true }).isChecked(),
      true,
    );
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    assert.equal(
      JSON.parse(readFileSync(join(profile, 'language.json'), 'utf8')).language,
      'en',
    );
    await page.evaluate(() => window.hyperionDesktop.setLanguage('es'));
    await page
      .getByRole('button', { name: 'Guardar elección', exact: true })
      .waitFor();
    await assert.rejects(
      page.evaluate(() => window.hyperionDesktop.setLanguage('xx')),
    );
    await page
      .getByRole('button', { name: 'Cerrar resultado', exact: true })
      .click();
    await app.evaluate(async ({ Menu, dialog }) => {
      const original = dialog.showMessageBox;
      let count = 0;
      let finished;
      const completion = new Promise((resolve) => {
        finished = resolve;
      });
      dialog.showMessageBox = async () => {
        if (++count === 2) finished();
        return { response: 1 };
      };
      try {
        await Menu.getApplicationMenu()
          .items[0].submenu.items.find(
            (item) => item.label === 'Conectar con mi IA',
          )
          .click();
        await completion;
      } finally {
        dialog.showMessageBox = original;
      }
    });
    const connected = JSON.parse(
      readFileSync(join(home, '.cursor/mcp.json'), 'utf8'),
    );
    assert.equal(connected.mcpServers.hyperion.env.ELECTRON_RUN_AS_NODE, '1');
    assert.equal(
      connected.mcpServers.hyperion.env.HYPERION_URL,
      env.HYPERION_URL,
    );
    assert.match(connected.mcpServers.hyperion.args[0], /mcp-launcher\.js$/);
    browser = await chromium.launch();
    const split = await browser.newPage({
      locale: 'es-ES',
      viewport: { width: 540, height: 720 },
    });
    await split.goto(`${env.HYPERION_URL}/?run=${run.id}`);
    await split
      .getByRole('button', { name: 'Ver paso: Elegir audiencia', exact: true })
      .click();
    await split.getByRole('radio', { name: 'No', exact: true }).check();
    await split
      .getByRole('button', { name: 'Guardar elección', exact: true })
      .click();
    await page.locator('[data-id="work"] [data-flow-state="ready"]').waitFor();
    for (const type of ['start', 'complete'])
      await api(`/api/runs/${run.id}/commands`, {
        type,
        stepId: 'work',
        message: 'Guía preparada desde el adaptador del chat',
        commandId: crypto.randomUUID(),
      });
    await page
      .locator('[data-testid="run-status"]')
      .filter({ hasText: 'Completado' })
      .waitFor();
    await split
      .locator('[data-testid="run-status"]')
      .filter({ hasText: 'Completado' })
      .waitFor();
    await api(`/api/runs/${run.id}/artifacts`, {
      commandId: 'desktop-artifact',
      stepId: 'work',
      attempt: 1,
      name: 'guia.md',
      mediaType: 'text/markdown',
      contentBase64: Buffer.from('# Guía preparada').toString('base64'),
    });
    await page
      .getByRole('button', {
        name: 'Ver artefactos: Preparar guía',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'Ver artefacto', exact: true })
      .click();
    await page
      .getByTestId('resultado-stage')
      .locator('.artifact-text')
      .filter({ hasText: '# Guía preparada' })
      .waitFor();
    // Native download uses the same authenticated session, with no navigation away.
    const download = app.evaluate(
      ({ BrowserWindow }, savePath) =>
        new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Native download timed out')),
            10000,
          );
          BrowserWindow.getAllWindows()[0].webContents.session.once(
            'will-download',
            (_event, item) => {
              item.setSavePath(savePath);
              item.once('done', (_event, state) => {
                clearTimeout(timeout);
                resolve({ state, name: item.getFilename() });
              });
            },
          );
        }),
      join(home, 'guia.md'),
    );
    await page.getByRole('link', { name: 'Descargar', exact: true }).click();
    assert.deepEqual(await download, { state: 'completed', name: 'guia.md' });
    assert.equal(
      readFileSync(join(home, 'guia.md'), 'utf8'),
      '# Guía preparada',
    );
    await page
      .getByRole('button', { name: 'Cerrar resultado', exact: true })
      .click();
    // Keep the relaunch inside this test's isolated Electron profile.
    const installationFile = join(home, '.hyperion/desktop.json');
    const installation = JSON.parse(readFileSync(installationFile, 'utf8'));
    installation.args.push(`--user-data-dir=${profile}`);
    writeFileSync(installationFile, JSON.stringify(installation));
    const navigation = page.waitForEvent('load');
    const opened = await promisify(execFile)(
      process.execPath,
      ['dist/adapters/cli.js', 'open', run.id, 'desktop'],
      { cwd: process.cwd(), env },
    );
    assert.equal(JSON.parse(opened.stdout).runId, run.id);
    assert.equal(JSON.parse(opened.stdout).presentation, 'desktop');
    await navigation;
    await page.getByRole('heading', { name: run.title }).waitFor();
    const result = await api(`/api/runs/${run.id}`);
    assert.equal(result.steps[0].outputValues.beginners, false);
    const capture = await app.evaluate(async ({ BrowserWindow }) =>
      (await BrowserWindow.getAllWindows()[0].capturePage())
        .toPNG()
        .toString('base64'),
    );
    mkdirSync('test-results', { recursive: true });
    writeFileSync(
      'test-results/desktop-shared.png',
      Buffer.from(capture, 'base64'),
    );
  } finally {
    await browser?.close();
    await app?.close();
    service.kill('SIGTERM');
    if (service.exitCode === null) await once(service, 'exit');
    rmSync(home, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  }
});
