import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestDesktopUpdateCheck } from '../src/client/desktop-updates.js';

test('Menú update check invokes Desktop IPC and never needs About', async () => {
  let calls = 0;
  assert.equal(
    await requestDesktopUpdateCheck({
      checkForUpdates: async () => {
        calls += 1;
      },
    }),
    'invoked',
  );
  assert.equal(calls, 1);
});

test('without Desktop bridge, update check reports unavailable (no About implied)', async () => {
  assert.equal(await requestDesktopUpdateCheck(undefined), 'unavailable');
  assert.equal(await requestDesktopUpdateCheck({}), 'unavailable');
});

test('Desktop update check surfaces IPC failures to the caller', async () => {
  await assert.rejects(
    () =>
      requestDesktopUpdateCheck({
        checkForUpdates: async () => {
          throw new Error('updater failed');
        },
      }),
    /updater failed/,
  );
});
