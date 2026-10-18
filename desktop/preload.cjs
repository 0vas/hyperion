const { contextBridge, ipcRenderer } = require('electron');
// Deliberately expose only language + update check — never filesystem or shell access.
contextBridge.exposeInMainWorld('hyperionDesktop', {
  getLanguage: () => ipcRenderer.invoke('hyperion:language:get'),
  setLanguage: (value) => ipcRenderer.invoke('hyperion:language:set', value),
  onLanguageChanged: (callback) => {
    ipcRenderer.on('hyperion:language:changed', (_event, value) =>
      callback(value),
    );
  },
  checkForUpdates: () => ipcRenderer.invoke('hyperion:updates:check'),
});
