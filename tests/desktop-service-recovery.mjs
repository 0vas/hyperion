import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron } from '@playwright/test';
import { listenerPid } from '../dist/adapters/runtime-upgrade.js';
import {
  phase,
  closeDesktop,
  waitForPidExit,
} from './helpers/desktop-test-lifecycle.mjs';

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
  async (t) => {
    const started = Date.now();
    const messages = [];
    const log = (message) => {
      const line = `[desktop-recovery +${Date.now() - started}ms] ${message}`;
      messages.push(line);
      console.error(line);
    };
    const step = (name, action, timeoutMs = 10000) =>
      phase(name, action, { timeoutMs, signal: t.signal, log });
    const home = mkdtempSync(join(tmpdir(), 'hyperion-desktop-recovery-'));
    const directory = join(home, 'data');
    const profile = join(home, 'profile');
    const port = await step('reserve port', freePort, 3000);
    const url = `http://127.0.0.1:${port}`;
    mkdirSync(directory, { recursive: true });
    mkdirSync(profile);
    writeFileSync(
      join(directory, 'desktop-onboarding.json'),
      JSON.stringify({ completed: true }),
    );
    let app, page;
    const failures = [];
    try {
      const args = [
        `--user-data-dir=${profile}`,
        `--hyperion-url=${url}`,
        `--hyperion-directory=${directory}`,
      ];
      log('Electron launch: start');
      app = await _electron.launch({
        timeout: 20000,
        signal: t.signal,
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
      log(`Electron launch: ready pid=${app.process().pid}`);
      page = await step(
        'first window',
        () => app.firstWindow({ timeout: 5000 }),
        6000,
      );
      await step(
        'initial online',
        () => page.locator('.connection.online').waitFor({ timeout: 15000 }),
        16000,
      );
      const pid = await step(
        'initial service PID',
        () => listenerPid(port),
        11000,
      );
      assert.ok(pid, 'the Desktop-owned service should be listening');
      log(`stop initial service: pid=${pid}`);
      process.kill(pid, 'SIGTERM');
      await step(
        'offline after service death',
        () =>
          page.locator('.connection:not(.online)').waitFor({ timeout: 10000 }),
        11000,
      );
      await step(
        'recovered online',
        () => page.locator('.connection.online').waitFor({ timeout: 20000 }),
        21000,
      );
      await step(
        'recovered health',
        async () => {
          const health = await fetch(`${url}/api/health`, {
            signal: AbortSignal.timeout(3000),
          });
          assert.equal(health.ok, true);
          assert.equal((await health.json()).ok, true);
        },
        4000,
      );
    } catch (error) {
      failures.push(error);
      log(`failure: ${error.message}`);
    } finally {
      // The outer test timeout aborts phases, but does not kill Electron. Cleanup
      // has independent deadlines so one stalled resource cannot retain the runner.
      const pageUrl = page?.url();
      const serviceUrl = pageUrl?.startsWith('http://127.0.0.1:')
        ? new URL(pageUrl).origin
        : url;
      let stoppedServicePid;
      try {
        await closeDesktop(app, {
          log,
          releaseResources: async () => {
            const cleanupPort = Number(new URL(serviceUrl).port);
            const pid = await listenerPid(cleanupPort);
            if (!pid) return;
            // Never kill an unrelated process that reused the test port. Authenticate
            // with this fixture's credentials before terminating its detached service.
            const credentials = JSON.parse(
              readFileSync(join(directory, 'credentials.json'), 'utf8'),
            );
            const auth = await fetch(`${serviceUrl}/api/auth/check`, {
              headers: { authorization: `Bearer ${credentials.agentToken}` },
              signal: AbortSignal.timeout(2000),
            });
            assert.equal(
              auth.ok,
              true,
              'refuse to stop a service outside this fixture',
            );
            await auth.body?.cancel();
            log(`cleanup authenticated service: pid=${pid}`);
            process.kill(pid, 'SIGKILL');
            stoppedServicePid = pid;
          },
          verifyResources: async () => {
            if (stoppedServicePid) await waitForPidExit(stoppedServicePid);
          },
        });
      } catch (error) {
        failures.push(error);
        log(`cleanup failure: ${error.message}`);
      }
      mkdirSync('test-results', { recursive: true });
      writeFileSync(
        join(
          'test-results',
          `desktop-recovery-${process.platform}-${process.env.HYPERION_DESKTOP_EXECUTABLE ? 'packaged' : 'source'}.log`,
        ),
        messages.join('\n') + '\n',
      );
      if (!failures.length) {
        rmSync(home, {
          recursive: true,
          force: true,
          maxRetries: 3,
          retryDelay: 100,
        });
      } else {
        log(`retained failing fixture: ${home}`);
      }
    }
    if (failures.length)
      throw new AggregateError(failures, 'Desktop recovery or cleanup failed');
  },
);
