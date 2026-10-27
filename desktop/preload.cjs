const { contextBridge, ipcRenderer } = require('electron');
// Language, update check, and optional host ResumeConnector for ADR 0036 Enviar.
// Never expose filesystem or shell access to the renderer.
const resumeConnector = ipcRenderer.sendSync(
  'hyperion:outbound-send:resume-connector-sync',
);
contextBridge.exposeInMainWorld('hyperionDesktop', {
  getLanguage: () => ipcRenderer.invoke('hyperion:language:get'),
  setLanguage: (value) => ipcRenderer.invoke('hyperion:language:set', value),
  onLanguageChanged: (callback) => {
    ipcRenderer.on('hyperion:language:changed', (_event, value) =>
      callback(value),
    );
  },
  checkForUpdates: () => ipcRenderer.invoke('hyperion:updates:check'),
  ...(resumeConnector ? { resumeConnector } : {}),
});
