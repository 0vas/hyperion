/** Invoke Desktop update check from the canvas Menú (never opens About). */
export async function requestDesktopUpdateCheck(
  desktop: { checkForUpdates?: () => Promise<void> } | undefined,
): Promise<'invoked' | 'unavailable'> {
  if (!desktop?.checkForUpdates) return 'unavailable';
  await desktop.checkForUpdates();
  return 'invoked';
}
