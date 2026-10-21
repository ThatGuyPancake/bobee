'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu, nativeImage, powerMonitor, protocol, screen, Tray } = require('electron');
const { presenceFrom } = require('./lib/presence');

const SIZE = 200;
const ALLOWED_TOP = new Set(['renderer', 'assets', 'messages.json']);
const MAX_HEIGHT = 600;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

protocol.registerSchemesAsPrivileged([
  { scheme: 'bobee', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

let win = null;
let fx = 0; // float x, so sub-pixel dx accumulates
let presence = 'active';
let idleTimer = null;
let hook = null;
let tray = null; // module-level reference so the Tray is not garbage collected
let paused = false;

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
  fx = Math.min(maxX, Math.max(minX, x));
  win.setBounds({
    x: Math.round(fx),
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
  setBoundsClamped(fx, wa.y + wa.height - b.height, b.width, b.height);
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
  const parts = r.split(path.sep);
  if (parts.some((p) => p.includes(':'))) return null;
  if (!ALLOWED_TOP.has(parts[0].toLowerCase())) return null;
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
      sandbox: true,
    },
  });
  fx = win.getBounds().x;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => { win = null; });
  win.loadURL('bobee://app/renderer/index.html');
}

function registerIpc() {
  const trusted = (e) => !!win && !win.isDestroyed() && e.sender === win.webContents;
  ipcMain.on('move-by', (e, dx, dy) => {
    if (!trusted(e) || !num(dx, dy)) return;
    const b = win.getBounds();
    setBoundsClamped(fx + dx, b.y + dy, b.width, b.height);
  });
  ipcMain.on('move-to', (e, x, y) => {
    if (!trusted(e) || !num(x, y)) return;
    const b = win.getBounds();
    setBoundsClamped(x, y, b.width, b.height);
  });
  ipcMain.on('drop-to-floor', (e) => {
    if (trusted(e)) dropToFloor();
  });
  ipcMain.on('set-height', (e, h) => {
    if (!trusted(e) || !num(h)) return;
    const wa = workArea();
    const height = Math.round(Math.min(MAX_HEIGHT, wa.height, Math.max(1, h)));
    const b = win.getBounds();
    const bottom = Math.min(b.y + b.height, wa.y + wa.height);
    const y = Math.max(wa.y, bottom - height);
    setBoundsClamped(fx, y, SIZE, height);
  });
  ipcMain.on('set-click-through', (e, on) => {
    if (!trusted(e)) return;
    if (on) win.setIgnoreMouseEvents(true, { forward: true });
    else win.setIgnoreMouseEvents(false);
  });
  ipcMain.handle('get-bounds', (e) => {
    if (trusted(e)) return currentBounds();
    // Untrusted sender: return a harmless default instead of window state.
    return { x: 0, y: 0, width: SIZE, height: SIZE, minX: 0, maxX: 0 };
  });
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

function sendCommand(cmd) {
  if (win && !win.isDestroyed()) win.webContents.send('command', cmd);
}

function initAutostart() {
  if (!app.isPackaged) return;
  try {
    const file = path.join(app.getPath('userData'), 'settings.json');
    if (!fs.existsSync(file)) {
      app.setLoginItemSettings({ openAtLogin: true });
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify({ autostartInitialized: true }));
    }
  } catch (err) {
    console.warn('[bobee] autostart init failed:', err && err.message);
  }
}

function trayIcon() {
  const custom = path.join(__dirname, 'assets', 'bobee', 'idle.png');
  const file = fs.existsSync(custom) ? custom : path.join(__dirname, 'assets', 'placeholder', 'idle.png');
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return img;
  return img.crop({ x: 0, y: 0, width: 64, height: 64 }).resize({ width: 32, height: 32 });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: paused ? 'Resume' : 'Pause',
      click: () => {
        paused = !paused;
        sendCommand(paused ? 'pause' : 'resume');
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { label: 'Say something', click: () => sendCommand('say') },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function createTray() {
  tray = new Tray(trayIcon());
  tray.setToolTip('Bobee');
  tray.setContextMenu(buildTrayMenu());
}

if (gotLock) app.whenReady().then(() => {
  protocol.handle('bobee', async (request) => {
    const file = resolveAppPath(request.url);
    if (!file) return new Response('Not found', { status: 404 });
    // fs (not net.fetch) so reads work inside app.asar when packaged.
    try {
      const body = await fs.promises.readFile(file);
      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(body, { headers: { 'content-type': type } });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  registerIpc();
  createWindow();
  startIdlePoll();
  startHook();
  initAutostart();
  createTray();

  const onMetrics = () => {
    if (!win) return;
    fx = win.getBounds().x;
    dropToFloor();
    sendBounds();
  };
  screen.on('display-metrics-changed', onMetrics);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  if (idleTimer) clearInterval(idleTimer);
  if (tray) { tray.destroy(); tray = null; }
  try { if (hook) hook.stop(); } catch { /* ignore */ }
});
