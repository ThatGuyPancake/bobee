'use strict';
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, net, powerMonitor, protocol, screen } = require('electron');
const { presenceFrom } = require('./lib/presence');

const SIZE = 200;
const BLOCKED = new Set(['node_modules', '.git', '.superpowers']);

protocol.registerSchemesAsPrivileged([
  { scheme: 'bobee', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let win = null;
let presence = 'active';
let idleTimer = null;
let hook = null;

const num = (...vals) => vals.every((v) => typeof v === 'number' && Number.isFinite(v));

function workArea() {
  const b = win && !win.isDestroyed() ? win.getBounds() : null;
  const display = b ? screen.getDisplayMatching(b) : screen.getPrimaryDisplay();
  return display.workArea;
}

function range(wa, width) {
  const minX = wa.x;
  const maxX = Math.max(minX, wa.x + wa.width - width);
  return { minX, maxX };
}

function setBoundsClamped(x, y, width, height) {
  const wa = workArea();
  const { minX, maxX } = range(wa, width);
  win.setBounds({
    x: Math.round(Math.min(maxX, Math.max(minX, x))),
    y: Math.round(y),
    width,
    height,
  });
}

function currentBounds() {
  const b = win.getBounds();
  const { minX, maxX } = range(workArea(), b.width);
  return { x: b.x, y: b.y, width: b.width, height: b.height, minX, maxX };
}

function sendBounds() {
  if (win && !win.isDestroyed()) win.webContents.send('bounds', currentBounds());
}

function dropToFloor() {
  const wa = workArea();
  const b = win.getBounds();
  setBoundsClamped(b.x, wa.y + wa.height - b.height, b.width, b.height);
}

function resolveAppPath(urlStr) {
  const url = new URL(urlStr);
  if (url.host !== 'app') return null;
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  const full = path.resolve(__dirname, '.' + path.sep + rel.replace(/^(?:\/|\\)+/, ''));
  const r = path.relative(__dirname, full);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) return null;
  if (BLOCKED.has(r.split(path.sep)[0])) return null;
  return full;
}

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    x: Math.round(wa.x + wa.width / 2),
    y: Math.round(wa.y + wa.height - SIZE),
    transparent: true,
    frameless: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => { win = null; });
  win.loadURL('bobee://app/renderer/index.html');
}

function registerIpc() {
  ipcMain.on('move-by', (_e, dx, dy) => {
    if (!win || !num(dx, dy)) return;
    const b = win.getBounds();
    setBoundsClamped(b.x + dx, b.y + dy, b.width, b.height);
  });
  ipcMain.on('move-to', (_e, x, y) => {
    if (!win || !num(x, y)) return;
    const b = win.getBounds();
    setBoundsClamped(x, y, b.width, b.height);
  });
  ipcMain.on('drop-to-floor', () => {
    if (win) dropToFloor();
  });
  ipcMain.on('set-height', (_e, h) => {
    if (!win || !num(h) || h < 1) return;
    const b = win.getBounds();
    const height = Math.round(h);
    setBoundsClamped(b.x, b.y + b.height - height, SIZE, height);
  });
  ipcMain.on('set-click-through', (_e, on) => {
    if (!win) return;
    if (on) win.setIgnoreMouseEvents(true, { forward: true });
    else win.setIgnoreMouseEvents(false);
  });
  ipcMain.handle('get-bounds', () => (win ? currentBounds() : null));
}

function startIdlePoll() {
  idleTimer = setInterval(() => {
    const secs = powerMonitor.getSystemIdleTime();
    presence = presenceFrom(secs);
    if (win && !win.isDestroyed()) win.webContents.send('idle', secs);
  }, 10000);
}

function startHook() {
  try {
    const { uIOhook } = require('uiohook-napi');
    // Pulse only: the event argument is deliberately never read.
    uIOhook.on('keydown', () => {
      if (win && !win.isDestroyed()) win.webContents.send('key-pulse');
    });
    uIOhook.start();
    hook = uIOhook;
  } catch (err) {
    console.warn('[bobee] keyboard hook unavailable:', err && err.message);
  }
}

app.whenReady().then(() => {
  protocol.handle('bobee', (request) => {
    const file = resolveAppPath(request.url);
    if (!file) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  registerIpc();
  createWindow();
  startIdlePoll();
  startHook();

  const onMetrics = () => {
    if (!win) return;
    dropToFloor();
    sendBounds();
  };
  screen.on('display-metrics-changed', onMetrics);
});

app.on('second-instance', () => {});
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  if (idleTimer) clearInterval(idleTimer);
  try { if (hook) hook.stop(); } catch { /* ignore */ }
});
