import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron } from '@playwright/test';
import { listenerPid } from '../dist/adapters/runtime-upgrade.js';

async function freePort() {
  const reservation = createServer();
  await new Promise((done) => reservation.listen(0, '127.0.0.1', done));
  const { port } = reservation.address();
  await new Promise((done) => reservation.close(done));
  return port;
}

test(
  'Desktop restarts its authenticated local service after it dies post-load',
  { timeout: 45000 },
  async () => {
    const home = mkdtempSync(join(tmpdir(), 'hyperion-desktop-recovery-'));
    const directory = join(home, 'data');
    const profile = join(home, 'profile');
    const port = await freePort();
    const url = `http://127.0.0.1:${port}`;
    mkdirSync(directory, { recursive: true });
    mkdirSync(profile);
    writeFileSync(
      join(directory, 'desktop-onboarding.json'),
      JSON.stringify({ completed: true }),
    );
    let app;
    try {
      const args = [
        `--user-data-dir=${profile}`,
        `--hyperion-url=${url}`,
        `--hyperion-directory=${directory}`,
      ];
      app = await _electron.launch({
        ...(process.env.HYPERION_DESKTOP_EXECUTABLE
          ? { executablePath: process.env.HYPERION_DESKTOP_EXECUTABLE }
          : {}),
        args: process.env.HYPERION_DESKTOP_EXECUTABLE
          ? args
          : ['desktop/main.mjs', ...args],
        env: {
          ...process.env,
          HYPERION_HOME: home,
          HYPERION_DATA_DIR: directory,
          HYPERION_URL: url,
          HYPERION_DISABLE_UPDATE_CHECK: '1',
        },
      });
      const page = await app.firstWindow();
      await page.locator('.connection.online').waitFor({ timeout: 15000 });
      const pid = await listenerPid(port);
      assert.ok(pid, 'the Desktop-owned service should be listening');
      process.kill(pid, 'SIGTERM');
      await page
        .locator('.connection:not(.online)')
        .waitFor({ timeout: 10000 });
      await page.locator('.connection.online').waitFor({ timeout: 20000 });
      const health = await fetch(`${url}/api/health`);
      assert.equal(health.ok, true);
      assert.equal((await health.json()).ok, true);
    } finally {
      await app?.close();
      rmSync(home, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);
