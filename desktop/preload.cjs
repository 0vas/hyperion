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
  liveChat: {
    connect: (runId) => ipcRenderer.invoke('hyperion:live-chat:connect', runId),
    send: (runId, text) =>
      ipcRenderer.invoke('hyperion:live-chat:send', runId, text),
    stop: (runId) => ipcRenderer.invoke('hyperion:live-chat:stop', runId),
    approve: (runId, token, decision) =>
      ipcRenderer.invoke('hyperion:live-chat:approve', runId, token, decision),
    resolveUncertain: (runId) =>
      ipcRenderer.invoke('hyperion:live-chat:resolve-uncertain', runId),
    onEvent: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('hyperion:live-chat:event', listener);
      return () =>
        ipcRenderer.removeListener('hyperion:live-chat:event', listener);
    },
  },
  ...(resumeConnector ? { resumeConnector } : {}),
});
