// Native preload/main integration only: no provider connection or prompt.
// Run after npm run build: node --test tests/desktop-permission-mode-native.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron, expect } from '@playwright/test';
import { closeDesktop, phase } from './helpers/desktop-test-lifecycle.mjs';

test(
  'native Ask/Auto works before connecting and persists across a real Desktop relaunch',
  { timeout: 45000 },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'hyperion-mode-native-'));
    const directory = join(home, 'data');
    const profile = join(home, 'profile');
    mkdirSync(directory);
    mkdirSync(profile);
    writeFileSync(
      join(directory, 'desktop-onboarding.json'),
      JSON.stringify({ completed: true }),
    );
    const reservation = createServer();
    await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    const url = `http://127.0.0.1:${port}`;
    const env = {
      ...process.env,
      HYPERION_HOME: home,
      HYPERION_DATA_DIR: directory,
      HYPERION_PORT: String(port),
      HYPERION_URL: url,
      HYPERION_DISABLE_UPDATE_CHECK: '1',
    };
    // Do not allow an unrelated development binary override to select the app.
    delete env.ELECTRON_OVERRIDE_DIST_PATH;
    const service = spawn(process.execPath, ['dist/server/main.js'], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let app;
    const args = [
      'desktop/main.mjs',
      `--user-data-dir=${profile}`,
      `--hyperion-url=${url}`,
      `--hyperion-directory=${directory}`,
    ];
    const launch = async () => {
      app = await _electron.launch({ args, env, timeout: 15000 });
      const page = await app.firstWindow();
      await page.getByTestId('chat-bubble').waitFor();
      await page.evaluate(() => window.hyperionDesktop.setLanguage('en'));
      await page.getByTestId('chat-bubble').click();
      await page.evaluate(() => {
        window.modeTestEvents = [];
        window.hyperionDesktop.liveChat.onEvent((event) =>
          window.modeTestEvents.push(event),
        );
      });
      return page;
    };
    const choose = async (page, mode) => {
      await page.getByTestId('live-chat-mode-trigger').click();
      await page
        .getByRole('menuitemradio', { name: mode, exact: true })
        .click();
      await expect(page.getByTestId('live-chat-mode-trigger')).toHaveText(mode);
    };
    try {
      await phase(
        'isolated service ready',
        () =>
          new Promise((resolve, reject) => {
            service.once('error', reject);
            service.stdout.once('data', resolve);
          }),
        { timeoutMs: 10000 },
      );
      assert.equal((await fetch(`${url}/api/health`)).ok, true);
      let page = await launch();
      await expect(page.getByTestId('live-chat-mode-trigger')).toHaveText(
        'Ask',
      );
      await expect(page.getByTestId('live-chat-status')).toHaveText(
        'Connects when you send',
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.hyperionDesktop.liveChat.getPermissionMode(),
        ),
        { mode: 'ask' },
      );
      await choose(page, 'Auto');
      assert.deepEqual(
        JSON.parse(
          readFileSync(join(profile, 'live-chat-permission.json'), 'utf8'),
        ),
        { mode: 'auto' },
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.modeTestEvents.map((event) => event.type),
        ),
        ['permission-mode'],
      );
      await page.screenshot({ path: join(home, 'native-mode-auto.png') });
      await closeDesktop(app);
      app = undefined;

      page = await launch();
      await expect(page.getByTestId('live-chat-mode-trigger')).toHaveText(
        'Auto',
      );
      await expect(page.getByTestId('live-chat-status')).toHaveText(
        'Connects when you send',
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.hyperionDesktop.liveChat.getPermissionMode(),
        ),
        { mode: 'auto' },
      );
      await page.screenshot({ path: join(home, 'native-mode-relaunch.png') });
      await choose(page, 'Ask');
      assert.deepEqual(
        JSON.parse(
          readFileSync(join(profile, 'live-chat-permission.json'), 'utf8'),
        ),
        { mode: 'ask' },
      );
      assert.deepEqual(
        await page.evaluate(() =>
          window.modeTestEvents.map((event) => event.type),
        ),
        ['permission-mode'],
      );
      for (const harness of ['codex', 'claude', 'cursor', 'antigravity']) {
        assert.equal(
          existsSync(join(profile, `live-${harness}-workspace`)),
          false,
          'No provider workspace or process should be started',
        );
      }
      console.log(`Native mode evidence (isolated profile retained): ${home}`);
    } finally {
      try {
        await closeDesktop(app);
      } finally {
        if (service.exitCode === null && service.signalCode === null) {
          const exited = once(service, 'exit');
          service.kill('SIGTERM');
          await phase('owned service exit', () => exited, { timeoutMs: 3000 });
        }
      }
    }
  },
);
