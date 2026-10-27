import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ELECTRON_ERR_ABORTED,
  assertNoBareReloadRoles,
  desktopViewReloadMenuItems,
  shouldRecoverFailedLoad,
} from '../desktop/reload.mjs';

test('View reload menu items never use Electron role reload/forceReload', () => {
  let clicks = 0;
  const items = desktopViewReloadMenuItems({
    t: (message) => message,
    onReload: () => {
      clicks += 1;
    },
  });
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal(item.role, undefined);
    assert.equal(typeof item.click, 'function');
    assert.match(item.accelerator, /CmdOrCtrl/);
  }
  assert.equal(items[0].label, 'Recargar');
  assert.equal(items[1].label, 'Forzar recarga');
  items[0].click();
  items[1].click();
  assert.equal(clicks, 2);
  assert.doesNotThrow(() => assertNoBareReloadRoles(items));
  assert.throws(
    () => assertNoBareReloadRoles([{ role: 'reload', label: 'bad' }]),
    /Bare Electron reload role forbidden/,
  );
});

test('did-fail-load recovery skips subframe and ERR_ABORTED', () => {
  assert.equal(
    shouldRecoverFailedLoad({ isMainFrame: true, errorCode: -6 }),
    true,
  );
  assert.equal(
    shouldRecoverFailedLoad({
      isMainFrame: true,
      errorCode: ELECTRON_ERR_ABORTED,
    }),
    false,
  );
  assert.equal(
    shouldRecoverFailedLoad({ isMainFrame: false, errorCode: -105 }),
    false,
  );
});

test('Desktop main remounts via startWithRecovery and never role reload', () => {
  const source = readFileSync(resolve('desktop/main.mjs'), 'utf8');
  assert.match(source, /desktopViewReloadMenuItems/);
  assert.match(source, /remountDesktopRun/);
  assert.match(source, /did-fail-load/);
  assert.match(source, /shouldRecoverFailedLoad/);
  assert.match(source, /startWithRecovery/);
  assert.doesNotMatch(source, /role:\s*['"]reload['"]/);
  assert.doesNotMatch(source, /role:\s*['"]forceReload['"]/);
});
