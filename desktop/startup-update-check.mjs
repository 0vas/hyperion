/** Packaged Desktop only: defer one quiet auto-check after launch. */
export const STARTUP_UPDATE_DELAY_MS = 8000;
const CONNECTING_RETRY_MS = 1000;

/**
 * Schedule a single automatic update check for packaged Desktop.
 * Unpackaged / web / HYPERION_DISABLE_UPDATE_CHECK → no-op (by design).
 * If onboarding/connect is still open when the delay fires, retry until it closes
 * so the native consent dialog is not skipped for the whole session.
 */
export function scheduleStartupUpdateCheck({
  isPackaged,
  disabled = false,
  delayMs = STARTUP_UPDATE_DELAY_MS,
  isConnecting = () => false,
  check,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}) {
  if (!isPackaged || disabled || typeof check !== 'function') {
    return { cancel() {} };
  }
  let timer;
  let cancelled = false;
  const clear = () => {
    if (timer !== undefined) {
      clearTimeoutFn(timer);
      timer = undefined;
    }
  };
  const attempt = () => {
    if (cancelled) return;
    if (isConnecting()) {
      timer = setTimeoutFn(attempt, CONNECTING_RETRY_MS);
      timer?.unref?.();
      return;
    }
    timer = undefined;
    void check(false);
  };
  timer = setTimeoutFn(attempt, delayMs);
  timer?.unref?.();
  return {
    cancel() {
      cancelled = true;
      clear();
    },
  };
}
