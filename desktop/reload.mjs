/**
 * Desktop View → Recargar must remount via ensureServer/openRun, not Electron's
 * bare role:"reload" (which leaves an unpainted stone window on sticky ports).
 */

/** Electron ERR_ABORTED — navigation superseded; not a recoverable blank. */
export const ELECTRON_ERR_ABORTED = -3;

export function shouldRecoverFailedLoad({ isMainFrame, errorCode }) {
  if (!isMainFrame) return false;
  if (errorCode === ELECTRON_ERR_ABORTED) return false;
  return true;
}

/**
 * Menu items for Recargar / Forzar recarga — custom click, never role reload.
 * @param {{ t: (msg: string) => string, onReload: (opts?: { force?: boolean }) => void }} options
 */
export function desktopViewReloadMenuItems({ t, onReload }) {
  return [
    {
      label: t('Recargar'),
      accelerator: 'CmdOrCtrl+R',
      click: () => onReload({ force: false }),
    },
    {
      label: t('Forzar recarga'),
      accelerator: 'CmdOrCtrl+Shift+R',
      click: () => onReload({ force: true }),
    },
  ];
}

export function assertNoBareReloadRoles(items) {
  for (const item of items) {
    if (item.role === 'reload' || item.role === 'forceReload') {
      throw new Error(`Bare Electron reload role forbidden: ${item.role}`);
    }
  }
  return items;
}
