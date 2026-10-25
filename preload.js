'use strict';
const { contextBridge, ipcRenderer } = require('electron');

function listen(channel, cb) {
  if (typeof cb !== 'function') return () => {};
  const handler = (_event, ...args) => cb(...args);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('bobee', {
  moveBy: (dx, dy) => ipcRenderer.send('move-by', dx, dy),
  moveTo: (x, y) => ipcRenderer.send('move-to', x, y),
  dropToFloor: () => ipcRenderer.send('drop-to-floor'),
  setHeight: (h) => ipcRenderer.send('set-height', h),
  setClickThrough: (on) => ipcRenderer.send('set-click-through', !!on),
  getBounds: () => ipcRenderer.invoke('get-bounds'),
  getState: () => ipcRenderer.invoke('get-state'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  patchState: (p) => ipcRenderer.send('patch-state', p),
  onKeyPulse: (cb) => listen('key-pulse', () => cb()),
  onIdle: (cb) => listen('idle', (s) => cb(s)),
  onBounds: (cb) => listen('bounds', (b) => cb(b)),
  onCommand: (cb) => listen('command', (c) => cb(c)),
});
