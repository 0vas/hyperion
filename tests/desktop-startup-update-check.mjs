import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTUP_UPDATE_DELAY_MS,
  scheduleStartupUpdateCheck,
} from '../desktop/startup-update-check.mjs';

test('unpackaged, disabled, or missing check never schedules', () => {
  const timers = [];
  for (const options of [
    { isPackaged: false, disabled: false },
    { isPackaged: true, disabled: true },
    { isPackaged: true, disabled: false, check: undefined },
  ]) {
    timers.length = 0;
    const scheduled = scheduleStartupUpdateCheck({
      ...options,
      check: options.check === undefined ? undefined : () => {},
      setTimeoutFn: (fn, ms) => {
        timers.push(ms);
        return { unref() {} };
      },
    });
    assert.deepEqual(timers, []);
    scheduled.cancel();
  }
});

test('packaged startup schedules one quiet check after the delay', () => {
  const calls = [];
  const timers = [];
  let connecting = false;
  const scheduled = scheduleStartupUpdateCheck({
    isPackaged: true,
    disabled: false,
    isConnecting: () => connecting,
    check: (manual) => calls.push(manual),
    setTimeoutFn: (fn, ms) => {
      timers.push({ ms, fn });
      return { unref() {} };
    },
  });
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, STARTUP_UPDATE_DELAY_MS);
  timers[0].fn();
  assert.deepEqual(calls, [false]);
  scheduled.cancel();
});

test('startup check defers while connecting, then fires once', () => {
  const calls = [];
  const timers = [];
  let connecting = true;
  scheduleStartupUpdateCheck({
    isPackaged: true,
    delayMs: 100,
    isConnecting: () => connecting,
    check: (manual) => calls.push(manual),
    setTimeoutFn: (fn, ms) => {
      timers.push({ ms, fn });
      return { unref() {} };
    },
  });
  timers[0].fn();
  assert.equal(calls.length, 0);
  assert.equal(timers.length, 2);
  assert.equal(timers[1].ms, 1000);
  connecting = false;
  timers[1].fn();
  assert.deepEqual(calls, [false]);
});

test('cancel before fire prevents the quiet check', () => {
  const calls = [];
  let pending;
  const scheduled = scheduleStartupUpdateCheck({
    isPackaged: true,
    check: (manual) => calls.push(manual),
    setTimeoutFn: (fn) => {
      pending = fn;
      return { unref() {} };
    },
    clearTimeoutFn: () => {
      pending = undefined;
    },
  });
  scheduled.cancel();
  pending?.();
  assert.deepEqual(calls, []);
});
