import { createLanguageStore } from './language.mjs';
import { VERSION, RELEASE_CHANNEL } from '../dist/version.js';
import {
  app,
  ipcMain,
  BrowserWindow,
  dialog,
  session,
  Menu,
  clipboard,
  shell,
} from 'electron';
import { fileURLToPath } from 'node:url';
import { existsSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setupDesktopClient } from '../dist/adapters/desktop-setup.js';
import { connectWithDialog } from './onboarding.mjs';
import { ensureServer } from '../dist/adapters/bootstrap.js';
import {
  desktopTarget,
  desktopWindowUrl,
  rememberDesktop,
  rememberWorkspace,
  resolveWorkspaceService,
} from '../dist/adapters/desktop.js';
import { createUpdateController } from './update-dialog.mjs';
import { consumePostUpdateRefresh } from './post-update-refresh.mjs';
import { refreshSameInstallConflicts } from '../dist/adapters/post-update-connections.js';
import { recoverStartup } from './startup.mjs';
import {
  assertNoBareReloadRoles,
  desktopViewReloadMenuItems,
  shouldRecoverFailedLoad,
} from './reload.mjs';
import {
  syncDesktopOutboundWorker,
  stopDesktopOutboundWorker,
  readResumeConnectorForPreload,
} from './outbound-send.mjs';
const language = createLanguageStore({
  file: resolve(app.getPath('userData'), 'language.json'),
  systemLanguages: () => app.getPreferredSystemLanguages(),
});
const t = (message, values) => language.t(message, values);
let window;
const updater = createUpdateController({
  t,
  app,
  dialog,
  shell,
  getWindow: () => window,
  currentVersion: VERSION,
  channel: RELEASE_CHANNEL,
});
function diagnostics(error) {
  const folder = app.getPath('logs');
  mkdirSync(folder, { recursive: true });
  appendFileSync(
    resolve(folder, 'startup.log'),
    `${new Date().toISOString()} ${String(error.message || error)}\n`,
    { mode: 0o600 },
  );
}
async function startWithRecovery(args) {
  return recoverStartup({
    t,
    start: () => openRun(args),
    dialog,
    record: async (error) => {
      try {
        diagnostics(error);
      } catch {}
    },
    showLogs: async () => {
      await shell.openPath(app.getPath('logs'));
    },
    checkUpdates: () => updater.check(true),
  });
}
let target;
const pending = [];
let connecting = false;
/** True while openRun is loading the service URL (did-fail-load defers to its throw). */
let loadingRun = false;
/** Serialize menu remount / failed-load recovery so dialogs do not stack. */
let remountBusy = false;
async function connect() {
  if (connecting) return;
  connecting = true;
  try {
    const connected = await connectWithDialog({
      t,
      window,
      dialog,
      clipboard,
      setup: setupDesktopClient,
      options: { directory: target.directory, url: target.service },
    });
    if (connected)
      writeFileSync(
        resolve(target.directory, 'desktop-onboarding.json'),
        JSON.stringify({ completed: true }),
        { mode: 0o600 },
      );
  } catch (error) {
    report(error);
  } finally {
    connecting = false;
  }
}
const isLocal = (url) => {
  try {
    return new URL(url).origin === target.service;
  } catch {
    return false;
  }
};
async function remountDesktopRun() {
  if (remountBusy) return;
  remountBusy = true;
  try {
    const ok = await startWithRecovery(process.argv);
    if (!ok) app.quit();
  } finally {
    remountBusy = false;
  }
}

function attachLoadHonesty(win) {
  win.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
      if (
        !shouldRecoverFailedLoad({ isMainFrame, errorCode }) ||
        loadingRun ||
        remountBusy
      )
        return;
      try {
        diagnostics(
          new Error(
            `did-fail-load ${errorCode}: ${errorDescription || 'load failed'}`,
          ),
        );
      } catch {}
      void remountDesktopRun();
    },
  );
}

async function openRun(args) {
  const next = desktopTarget(args);
  if (
    target &&
    (target.service !== next.service || target.directory !== next.directory)
  )
    throw new Error(
      t(
        'Cierra Hyperion Desktop antes de conectar otra instancia local. Tu flujo actual está protegido.',
      ),
    );
  loadingRun = true;
  try {
    const preferred = await resolveWorkspaceService(next);
    const startup = await ensureServer({
      directory: next.directory,
      url: preferred,
    });
    const service = startup.url || preferred;
    target = {
      ...next,
      service,
      url: desktopWindowUrl(next, service),
    };
    rememberWorkspace(target);
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({
        title: 'Hyperion',
        width: 1200,
        height: 820,
        minWidth: 390,
        minHeight: 480,
        backgroundColor: '#171e23',
        show: false,
        webPreferences: {
          preload: fileURLToPath(new URL('./preload.cjs', import.meta.url)),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      window.webContents.on('will-navigate', (event, url) => {
        if (!isLocal(url)) event.preventDefault();
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        if (isLocal(url)) void window.loadURL(url);
        else if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
        return { action: 'deny' };
      });
      attachLoadHonesty(window);
      window.once('ready-to-show', () => window.show());
    }
    // Load the resolved service from ensureServer — never next.url (stale
    // remembered alternate) which flashes ERR_CONNECTION_REFUSED before Retry.
    await window.loadURL(target.url);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    try {
      syncDesktopOutboundWorker({
        userData: app.getPath('userData'),
        directory: target.directory,
        url: target.service,
        clipboard,
        shell,
        onError: (error) => {
          try {
            diagnostics(error);
          } catch {}
        },
      });
    } catch (error) {
      try {
        diagnostics(error);
      } catch {}
    }
  } finally {
    loadingRun = false;
  }
}
function report(error) {
  dialog.showErrorBox(
    'Hyperion',
    error instanceof Error ? error.message : String(error),
  );
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (!app.isReady()) pending.push(argv);
    else void openRun(argv).catch(report);
  });
  app
    .whenReady()
    .then(async () => {
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback) =>
          callback(
            isLocal(contents.getURL()) &&
              permission === 'clipboard-sanitized-write',
          ),
      );
      session.defaultSession.setPermissionCheckHandler((contents, permission) =>
        Boolean(
          contents &&
          isLocal(contents.getURL()) &&
          permission === 'clipboard-sanitized-write',
        ),
      );
      app.setAboutPanelOptions({
        applicationName: 'Hyperion',
        applicationVersion: `${VERSION} UTC · ${RELEASE_CHANNEL}`,
      });
      ipcMain.handle('hyperion:language:get', (event) => {
        validateDesktopSender(event);
        return language.snapshot();
      });
      ipcMain.handle('hyperion:language:set', (event, value) => {
        validateDesktopSender(event);
        setLanguage(value);
      });
      ipcMain.handle('hyperion:updates:check', async (event) => {
        validateDesktopSender(event);
        await updater.check(true);
      });
      // Sync preload read: expose ResumeConnector only when outbound-send.json is valid.
      // Preload may run before the frame URL is local — still require our BrowserWindow sender.
      ipcMain.on('hyperion:outbound-send:resume-connector-sync', (event) => {
        try {
          if (!window || event.sender !== window.webContents)
            throw new Error('Invalid desktop request');
          event.returnValue = readResumeConnectorForPreload(
            app.getPath('userData'),
          );
        } catch {
          event.returnValue = undefined;
        }
      });
      rebuildMenu();

      if (!(await startWithRecovery(process.argv))) {
        app.quit();
        return;
      }
      rememberDesktop({
        executable: process.execPath,
        args: app.isPackaged ? [] : [fileURLToPath(import.meta.url)],
      });
      for (const args of pending) await openRun(args);
      if (
        !target.run &&
        !existsSync(resolve(target.directory, 'desktop-onboarding.json'))
      )
        await connect();
      if (consumePostUpdateRefresh(app.getPath('userData'))) {
        try {
          const refreshed = await refreshSameInstallConflicts({
            directory: target.directory,
            url: target.service,
          });
          if (refreshed.replaced.length > 0) {
            const names = refreshed.replaced
              .map((id) =>
                id === 'claude-desktop'
                  ? 'Claude Desktop'
                  : id === 'claude-code'
                    ? 'Claude Code'
                    : id === 'antigravity'
                      ? 'Antigravity'
                      : id === 'codex'
                        ? 'Codex'
                        : 'Cursor',
              )
              .join(', ');
            await dialog.showMessageBox(window, {
              type: 'info',
              message: t('Conexiones actualizadas'),
              detail: t(
                'Tras la actualización se actualizaron las conexiones de esta instalación: {0}. Las entradas ajenas o en conflicto distinto siguen en Conexiones.',
                { 0: names },
              ),
              buttons: [t('Listo')],
            });
          }
        } catch (error) {
          report(error);
        }
      }
      if (app.isPackaged && !process.env.HYPERION_DISABLE_UPDATE_CHECK) {
        const timer = setTimeout(() => {
          if (!connecting) void updater.check(false);
        }, 15000);
        timer.unref();
      }
    })
    .catch((error) => {
      report(error);
      app.quit();
    });
  app.on('activate', () => {
    if (!window || window.isDestroyed())
      void openRun(process.argv).catch(report);
  });
  app.on('before-quit', () => {
    updater.cancel();
    stopDesktopOutboundWorker();
  });
  app.on('window-all-closed', () => app.quit());
}

function rebuildMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Hyperion',
        submenu: [
          {
            label: `Hyperion ${VERSION} UTC`,
            click: () => app.showAboutPanel(),
          },
          {
            label: t('Conectar con mi IA'),
            click: () => connect(),
          },
          {
            label: t('Buscar actualizaciones…'),
            click: () => updater.check(true),
          },
          { label: t('Cancelar descarga'), click: () => updater.cancel() },
          {
            label: t('Idioma'),
            submenu: [
              ['system', t('Automático (sistema)')],
              ['es', 'Español'],
              ['en', 'English'],
            ].map(([value, label]) => ({
              label,
              type: 'radio',
              checked: language.get() === value,
              click: () => {
                try {
                  setLanguage(value);
                } catch (error) {
                  report(error);
                }
              },
            })),
          },
          { type: 'separator' },
          { label: t('Salir'), role: 'quit' },
        ],
      },
      {
        label: t('Editar'),
        submenu: [
          { label: t('Deshacer'), role: 'undo' },
          { label: t('Rehacer'), role: 'redo' },
          { type: 'separator' },
          { label: t('Cortar'), role: 'cut' },
          { label: t('Copiar'), role: 'copy' },
          { label: t('Pegar'), role: 'paste' },
          { label: t('Pegar sin formato'), role: 'pasteAndMatchStyle' },
          { label: t('Eliminar'), role: 'delete' },
          { label: t('Seleccionar todo'), role: 'selectAll' },
        ],
      },
      {
        label: t('Ver'),
        submenu: [
          ...assertNoBareReloadRoles(
            desktopViewReloadMenuItems({
              t,
              onReload: () => void remountDesktopRun(),
            }),
          ),
          { label: t('Herramientas de desarrollo'), role: 'toggleDevTools' },
          { type: 'separator' },
          { label: t('Tamaño real'), role: 'resetZoom' },
          { label: t('Acercar'), role: 'zoomIn' },
          { label: t('Alejar'), role: 'zoomOut' },
          { label: t('Pantalla completa'), role: 'togglefullscreen' },
        ],
      },
      {
        label: t('Ventana'),
        submenu: [
          { label: t('Minimizar'), role: 'minimize' },
          { label: t('Ampliar ventana'), role: 'zoom' },
          { label: t('Cerrar'), role: 'close' },
        ],
      },
    ]),
  );
}

function validateDesktopSender(event) {
  if (
    !window ||
    event.sender !== window.webContents ||
    event.senderFrame !== window.webContents.mainFrame ||
    !isLocal(event.senderFrame.url)
  )
    throw new Error('Invalid desktop request');
}
function setLanguage(value) {
  language.set(value);
  rebuildMenu();
  if (window && !window.isDestroyed())
    window.webContents.send('hyperion:language:changed', language.snapshot());
}
