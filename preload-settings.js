'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('settings', {
  status: () => ipcRenderer.invoke('link-status'),
  pair: (url, key) => ipcRenderer.invoke('link-pair', url, key),
  revoke: () => ipcRenderer.invoke('link-revoke'),
});
