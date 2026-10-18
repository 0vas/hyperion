import { checkForUpdate, downloadUpdate } from './updates.mjs';
import { applyVerifiedInstaller } from './apply-update.mjs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export function createUpdateController({
  t = (message, values = {}) =>
    message.replace(/\{(\d+)\}/g, (match, key) =>
      values[key] === undefined ? match : String(values[key]),
    ),
  app,
  dialog,
  shell,
  getWindow,
  currentVersion = app.getVersion(),
  channel,
  check = checkForUpdate,
  download = downloadUpdate,
  apply = applyVerifiedInstaller,
  platform = process.platform,
  relaunch = async (installerPath) => {
    await apply(installerPath);
    // macOS: do not open -n while this process still holds the single-instance
    // lock (the new instance would quit immediately). Schedule relaunch after
    // quit so the lock is released first. Windows: the NSIS spawn relaunches.
    if (platform === 'darwin') app.relaunch();
    app.quit();
  },
}) {
  let busy = false,
    controller;
  return {
    cancel() {
      controller?.abort();
    },
    async check(manual = true) {
      if (busy) return;
      busy = true;
      const window = getWindow();
      try {
        const update = await check(
          currentVersion,
          process.platform,
          process.arch,
          undefined,
          channel,
        );
        if (!update) {
          if (manual)
            await dialog.showMessageBox(window, {
              type: 'info',
              message: t('No hay una versión más reciente compatible'),
              detail: t('Versión instalada: {0}', { 0: currentVersion }),
              buttons: [t('Listo')],
            });
          return;
        }
        const answer = await dialog.showMessageBox(window, {
          type: 'info',
          message: t('Actualización disponible'),
          detail: t(
            'Tienes {0}. Se descarga desde GitHub, se verifica el digest y Hyperion se reinicia. Tus flujos se conservan.',
            { 0: currentVersion },
          ),
          buttons: [
            t('Actualizar y reiniciar'),
            t('Ahora no'),
            t('Descargar instalador…'),
          ],
          cancelId: 1,
          defaultId: 0,
        });
        if (answer.response === 1) return;
        let destination;
        if (answer.response === 2) {
          const choice = await dialog.showSaveDialog(window, {
            title: t('Guardar actualización de Hyperion'),
            defaultPath: join(app.getPath('downloads'), update.asset.name),
          });
          if (choice.canceled || !choice.filePath) return;
          destination = choice.filePath;
        } else {
          const folder = join(app.getPath('userData'), 'updates');
          await mkdir(folder, { recursive: true, mode: 0o700 });
          destination = join(folder, update.asset.name);
        }
        controller = new AbortController();
        await download(update, destination, {
          signal: controller.signal,
          onProgress: (p) => {
            if (window && !window.isDestroyed()) window.setProgressBar(p);
          },
        });
        if (answer.response === 2) {
          const done = await dialog.showMessageBox(window, {
            type: 'info',
            message: t('Actualización descargada y verificada'),
            detail: t(
              'Abre el instalador para actualizar Hyperion. Tus flujos se conservan en su almacenamiento local.',
            ),
            buttons: [t('Mostrar instalador'), t('Listo')],
            cancelId: 1,
          });
          if (done.response === 0) shell.showItemInFolder(destination);
          return;
        }
        try {
          await relaunch(destination);
        } catch (error) {
          const failed = await dialog.showMessageBox(window, {
            type: 'error',
            message: t(
              'No se pudo actualizar. Revisa la red o el digest del instalador.',
            ),
            detail: String(error.message || error),
            buttons: [t('Mostrar instalador'), t('Listo')],
            cancelId: 1,
            defaultId: 0,
          });
          if (failed.response === 0) shell.showItemInFolder(destination);
        }
      } catch (error) {
        if (!controller?.signal.aborted && (manual || controller))
          await dialog.showMessageBox(window, {
            type: 'error',
            message: t(
              'No se pudo actualizar. Revisa la red o el digest del instalador.',
            ),
            detail: String(error.message || error),
            buttons: [t('Listo')],
          });
      } finally {
        if (window && !window.isDestroyed()) window.setProgressBar(-1);
        controller = undefined;
        busy = false;
      }
    },
  };
}
