const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dot', {
  load: () => ipcRenderer.invoke('load'),
  copy: (text) => ipcRenderer.invoke('copy', text),
  openCard: (rel) => ipcRenderer.invoke('openCard', rel),
  minimize: () => ipcRenderer.invoke('win:minimize'),
  close: () => ipcRenderer.invoke('win:close'),
});
