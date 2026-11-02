'use strict';
const fs = require('node:fs');
const { createUpdates } = require('./lib/updates');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, Menu, nativeImage, powerMonitor, protocol, safeStorage, screen, Tray, Notification } = require('electron');
const { presenceFrom } = require('./lib/presence');
const { resolveSafePath } = require('./lib/appPath');
const { createStore } = require('./lib/store');
const { restoreCompanion, restartIfUnresponsive } = require('./lib/resume');
const { createJarWindows } = require('./lib/jarWindows');

const { createBreaks } = require('./lib/breaks');
const { createInbox } = require('./lib/linkInbox');
const { createReceiver } = require('./lib/linkReceiver');
const { createCredentials, linkRequest, normalizeLinkUrl } = require('./lib/linkCredentials');
const crypto = require('node:crypto');
const SIZE = 200;
// How far Bobee's window sinks past the work area, so he sits on the taskbar.
const SINK = 4;
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
if (process.platform === 'win32') app.setAppUserModelId('com.bobee.companion');

let win = null;
let fx = 0; // float x, so sub-pixel dx accumulates
let presence = 'active';
let idleTimer = null;
let hook = null;
let updates = null;
let tray = null; // module-level reference so the Tray is not garbage collected
let paused = false;
let companionSeenAt = 0;
let recoveryTimer = null;
let jars = null;
let jarTimer = null;
let debugJarTimer = null;
let settingsWin = null, receiver = null, credentials = null, linkConfig = null;
let linkTimer = null, linkCode = null, linkError = null, screenLocked = false, suspended = false, rendererReady = false, pairingBusy = false;
const breaks = createBreaks();
let lastIdlePoll = Date.now();
let store = null; // saved state (bobee-state.json), created once the app is ready

const num = (...vals) => vals.every((v) => typeof v === 'number' && Number.isFinite(v));

// Bobee lives on one "home" display. It only changes when she drags him to
// another screen, so walking off an edge never moves him to the next monitor.
let homeDisplayId = null;

function homeDisplay() {
  const all = screen.getAllDisplays();
  return all.find((d) => d.id === homeDisplayId) || screen.getPrimaryDisplay();
}

function workArea() {
  return homeDisplay().workArea;
}

function range(wa, width) {
  const minX = wa.x;
  const maxX = Math.max(minX, wa.x + wa.width - width);
  return { minX, maxX };
}

function setBoundsClamped(x, y, width, height) {
  const wa = workArea();
  const { minX, maxX } = range(wa, width);
  // The window never leaves the screen: moving a window past the edge makes
  // Windows rescale it for a neighbouring monitor. Bobee walks off screen
  // by sliding out of the window instead (see app.js).
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
  setBoundsClamped(fx, wa.y + wa.height + SINK - b.height, b.width, b.height);
}

function createWindow() {
  homeDisplayId = store.get().displayId ?? screen.getPrimaryDisplay().id;
  const wa = workArea();
  win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    x: Math.round(wa.x + wa.width / 2),
    y: Math.round(wa.y + wa.height + SINK - SIZE),
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
      backgroundThrottling: false,
    },
  });
  fx = win.getBounds().x;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.setIgnoreMouseEvents(true, { forward: true });
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => { win = null; });
  win.webContents.on('did-start-loading', () => { rendererReady = false; receiver?.defer(true); });
  win.webContents.on('render-process-gone', () => { rendererReady = false; receiver?.defer(true); });
  win.loadURL('bobee://app/renderer/index.html');
}

function registerIpc() {
  const trusted = (e) => !!win && !win.isDestroyed() && e.sender === win.webContents;
  ipcMain.on('renderer-ready', e => {
    if (!trusted(e)) return;
    rendererReady = true; receiver?.defer(screenLocked || suspended);
  });
  ipcMain.on('drawing-done', (e, id) => {
    if (!trusted(e) || typeof id !== 'string') return;
    try { if (receiver?.finish(id)) receiver.poll(); } catch (error) { linkError = error.message; }
  });
  ipcMain.on('companion-visible', (e, visible) => {
    if (!trusted(e)) return;
    companionSeenAt = visible === true ? Date.now() : 0;
    if (!visible) jars?.close();
  });
  ipcMain.on('snack-start', e => { if (trusted(e)) jars?.startSelfFeed(); });
  ipcMain.on('snack-eat', e => { if (trusted(e)) jars?.selfFeed(); });
  ipcMain.on('jar-grab', e => jars?.grab(e.sender));
  ipcMain.on('jar-release', (e, cancel) => jars?.release(e.sender, cancel === true));
  ipcMain.on('jar-click-through', (e, on) => jars?.clickThrough(e.sender, on === true));
  ipcMain.on('jar-asset-failed', e => jars?.assetFailed(e.sender));
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
    if (!trusted(e)) return;
    // sent after a drag: the screen he was dropped on becomes home
    homeDisplayId = screen.getDisplayMatching(win.getBounds()).id;
    store.patch({ displayId: homeDisplayId }); store.flush();
    tray?.setContextMenu(buildTrayMenu());
    dropToFloor();
  });
  ipcMain.on('set-height', (e, h) => {
    if (!trusted(e) || !num(h)) return;
    const wa = workArea();
    const height = Math.round(Math.min(MAX_HEIGHT, wa.height, Math.max(1, h)));
    const b = win.getBounds();
    const bottom = Math.min(b.y + b.height, wa.y + wa.height + SINK);
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
  // BOBEE_DATE (dev builds only) pretends the clock started at that date
  ipcMain.handle('get-config', (e) => ({
    debugDate: trusted(e) && !app.isPackaged && process.env.BOBEE_DATE ? String(process.env.BOBEE_DATE) : null,
  }));
  ipcMain.handle('get-state', (e) => (trusted(e) && store ? store.get() : null));
  // the store keeps only known keys with the right types
  ipcMain.on('patch-state', (e, p) => {
    if (!trusted(e) || !store) return;
    store.patch(p);
  });
}

function startIdlePoll() {
  idleTimer = setInterval(() => {
    const secs = powerMonitor.getSystemIdleTime();
    presence = presenceFrom(secs);
    if (presence !== 'active') jars?.close();
    if (win && !win.isDestroyed()) win.webContents.send('idle', secs);
    const now = Date.now();
    if (breaks.tick(Math.min(10000, now - lastIdlePoll), !screenLocked && !suspended && secs < 120, store.get().breakMinutes)) {
      const notification = new Notification({ title: 'Bobee says: time for a stretch', body: 'Take a little break. Snooze 10 minutes or skip from the Bobee tray menu.' });
      notification.show(); tray?.setContextMenu(buildTrayMenu());
    }
    lastIdlePoll = now;
  }, 10000);
}

function startHook() {
  try {
    const { uIOhook } = require('uiohook-napi');
    // Pulse only: the event argument is deliberately never read.
    uIOhook.on('mouseup', () => { jars?.release(null); });
    uIOhook.on('keydown', () => {
      jars?.cancelDrag();
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

function changePreferences(patch) {
  store.patch(patch); store.flush();
  sendCommand('preferences');
  tray?.setContextMenu(buildTrayMenu());
}

function openLinkSettings() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return; }
  settingsWin = new BrowserWindow({ width: 560, height: 650, autoHideMenuBar: true, webPreferences: {
    preload: path.join(__dirname, 'preload-settings.js'), contextIsolation: true, nodeIntegration: false, sandbox: true,
  } });
  settingsWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  settingsWin.webContents.on('will-navigate', e => e.preventDefault());
  settingsWin.on('closed', () => { settingsWin = null; });
  settingsWin.loadURL('bobee://app/renderer/settings.html');
}

function startLink() {
  clearInterval(linkTimer);
  receiver?.defer(true); receiver = null;
  if (!linkConfig) return;
  try {
    const config = { ...linkConfig }; // in-flight requests always belong to this receiver
    const inboxFile = 'bobee-inbox-' + crypto.createHash('sha256').update(config.token).digest('hex').slice(0, 16) + '.json';
    receiver = createReceiver({ inbox: createInbox(path.join(app.getPath('userData'), inboxFile)),
      request: async (route, body) => { const result = await linkRequest(config, route, body); linkError = null; return result; },
      show: drawing => {
        if (!win || win.isDestroyed()) return;
        if (drawing) { jars?.close(); win.showInactive(); }
        win.webContents.send('drawing', drawing);
      },
      error: error => { linkError = error.message; },
    });
    receiver.defer(!rendererReady || screenLocked || suspended);
    const poll = () => { if (!suspended) receiver?.poll().catch(error => { linkError = error.message; }); };
    linkTimer = setInterval(poll, 15000); poll();
  } catch (error) { linkError = 'Inbox could not be opened: ' + error.message; }
}

function registerLinkIpc() {
  const trusted = e => settingsWin && !settingsWin.isDestroyed() && e.sender === settingsWin.webContents;
  ipcMain.handle('link-status', e => trusted(e) ? { connected: !!linkConfig, url: linkConfig?.url, code: linkCode && linkCode.expires > Date.now() ? linkCode.value : null, error: linkError } : {});
  ipcMain.handle('link-pair', async (e, url, key) => {
    if (!trusted(e) || pairingBusy) return { error: 'Connection is busy' };
    pairingBusy = true;
    try {
      if (linkConfig) throw Error('Disconnect the current pairing before connecting again');
      if (!safeStorage.isEncryptionAvailable()) throw Error('Windows credential encryption unavailable');
      if (typeof key !== 'string' || !key.length || key.length > 256 || typeof url !== 'string') throw Error('Enter website and enrollment key');
      const origin = normalizeLinkUrl(url, !app.isPackaged);
      const result = await linkRequest({ url: origin, token: key }, '/api/receiver', {});
      if (!/^[a-f0-9]{64}$/.test(result.receiverToken) || !/^[a-f0-9]{32}$/.test(result.code)) throw Error('Invalid pairing response');
      const config = { url: origin, token: result.receiverToken };
      credentials.save(config); linkConfig = config;
      linkCode = { value: result.code, expires: Date.now() + 600000 }; linkError = null;
      startLink(); return { connected: true };
    } catch (error) { return { error: error.message }; } finally { pairingBusy = false; }
  });
  ipcMain.handle('link-revoke', async e => {
    if (!trusted(e) || pairingBusy) return { error: 'Connection is busy' };
    pairingBusy = true;
    try {
      if (linkConfig) await linkRequest(linkConfig, '/api/revoke', {});
      credentials.clear(); linkConfig = null; linkCode = null; linkError = null; startLink();
      return { connected: false };
    } catch (error) { return { error: error.message }; } finally { pairingBusy = false; }
  });
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
  const size = img.getSize().height; // frames are square
  return img.crop({ x: 0, y: 0, width: size, height: size }).resize({ width: 32, height: 32 });
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: paused ? 'Resume' : 'Pause',
      click: () => {
        paused = !paused;
        store.patch({ paused }); store.flush();
        if (paused) jars?.close();
        sendCommand(paused ? 'pause' : 'resume');
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { label: 'Active minutes per hour', submenu: [0, 5, 10, 15, 30, 60].map(minutes => ({
      label: minutes === 0 ? 'Off' : minutes === 60 ? 'Always' : String(minutes) + ' minutes', type: 'radio', checked: store.get().activeMinutes === minutes,
      click: () => changePreferences({ activeMinutes: minutes }),
    })) },
    { label: 'Between visits', submenu: [{ label: 'Go home', value: 'home' }, { label: 'Sleep at work', value: 'sleep' }].map(item => ({ label: item.label, type: 'radio', checked: store.get().restMode === item.value, click: () => changePreferences({ restMode: item.value }) })) },
    { label: 'Screen', submenu: screen.getAllDisplays().map((display, i) => ({ label: display.label || 'Screen ' + (i + 1), type: 'radio', checked: homeDisplay().id === display.id, click: () => {
      homeDisplayId = display.id; changePreferences({ displayId: display.id }); jars?.close(); dropToFloor(); sendBounds();
    } })) },
    { label: 'Quiet hours (21:00–07:30)', type: 'checkbox', checked: store.get().quietHours, click: item => changePreferences({ quietHours: item.checked }) },
    { label: 'Break reminders', submenu: [0, 25, 50, 60, 90].map(minutes => ({ label: minutes ? 'After ' + minutes + ' active minutes' : 'Off', type: 'radio', checked: store.get().breakMinutes === minutes, click: () => { breaks.skip(); changePreferences({ breakMinutes: minutes }); } })) },
    { label: 'Snooze break 10 minutes', enabled: breaks.pending(), click: () => { breaks.snooze(); tray.setContextMenu(buildTrayMenu()); } },
    { label: 'Skip this break', enabled: breaks.pending(), click: () => { breaks.skip(); tray.setContextMenu(buildTrayMenu()); } },
    { label: 'Bobee Link…', click: openLinkSettings },
    { label: 'Say something', click: () => sendCommand('say') },
    {
      label: 'Outfits',
      type: 'checkbox',
      checked: store.get().outfits,
      click: (item) => {
        store.patch({ outfits: item.checked });
        sendCommand(item.checked ? 'outfits-on' : 'outfits-off');
      },
    },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
      enabled: app.isPackaged,
      click: (item) => {
        if (!app.isPackaged) return;
        app.setLoginItemSettings({ openAtLogin: item.checked });
      },
    },
    { type: 'separator' },
    { label: updates?.status().label || 'Updates starting…', enabled: !!updates?.status().ready, click: () => updates?.install() },
    { label: 'Check for updates', enabled: !!updates?.status().canCheck, click: () => updates?.check() },
    { label: 'Version ' + app.getVersion(), enabled: false },
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
    const file = await resolveSafePath(request.url, __dirname, ALLOWED_TOP);
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
  store = createStore(path.join(app.getPath('userData'), 'bobee-state.json'));
  paused = store.get().paused;
  credentials = createCredentials(path.join(app.getPath('userData'), 'bobee-link-credentials'), safeStorage);
  linkConfig = credentials.load();
  screenLocked = powerMonitor.getSystemIdleState(120) === 'locked';
  registerIpc();
  registerLinkIpc();
  createWindow();
  startIdlePoll();
  startLink();
  jars = createJarWindows({
    BrowserWindow, screen, base: __dirname, getArea: workArea,
    getBobee: () => win && !win.isDestroyed() ? (() => {
      const b = win.getBounds();
      // Message bubbles enlarge the window above him; his 96px sprite remains centered at the bottom.
      return { x: b.x + (b.width - 96) / 2, y: b.y + b.height - 96, width: 96, height: 96 };
    })() : null,
    getState: () => store.get(), patchState: p => store.patch(p),
    send: (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); },
    active: () => !!win && !win.isDestroyed() && win.isVisible() && !win.isMinimized() && Date.now() - companionSeenAt < 3000 && !paused && !receiver?.active() && presence === 'active' && presenceFrom(powerMonitor.getSystemIdleTime()) === 'active',
  });
  jarTimer = setInterval(() => jars.check(), 60000);
  jars.check();
  if (!app.isPackaged && process.env.BOBEE_JAR_NOW === '1') debugJarTimer = setTimeout(() => jars.show(), 5000);
  powerMonitor.on('suspend', () => { suspended = true; receiver?.defer(true); jars.close(); });
  powerMonitor.on('lock-screen', () => { screenLocked = true; receiver?.defer(true); jars.close(); });
  const recoverDesktop = () => {
    jars.close();
    companionSeenAt = 0;
    const resumedAt = Date.now();
    clearTimeout(recoveryTimer);
    recoveryTimer = setTimeout(() => restartIfUnresponsive(win, companionSeenAt, resumedAt, paused), 5000);
    presence = presenceFrom(powerMonitor.getSystemIdleTime());
    restoreCompanion({win, paused, place: dropToFloor, bounds: sendBounds, send: sendCommand});
  };
  powerMonitor.on('resume', () => { suspended = false; recoverDesktop(); receiver?.defer(screenLocked || !rendererReady); receiver?.poll(); });
  powerMonitor.on('unlock-screen', () => { screenLocked = false; recoverDesktop(); receiver?.defer(suspended || !rendererReady); receiver?.poll(); });
  startHook();
  initAutostart();
  createTray();
  updates = createUpdates({
    updater: require('electron-updater').autoUpdater, packaged: app.isPackaged,
    beforeInstall: () => { store.flush(); jars?.close(false); },
    changed: () => { if (tray && !tray.isDestroyed()) tray.setContextMenu(buildTrayMenu()); },
  });
  tray.setContextMenu(buildTrayMenu());

  const onMetrics = () => {
    if (!win) return;
    jars?.close();
    fx = win.getBounds().x;
    dropToFloor();
    sendBounds();
    tray?.setContextMenu(buildTrayMenu());
  };
  screen.on('display-metrics-changed', onMetrics);
  screen.on('display-removed', onMetrics);
  screen.on('display-added', onMetrics);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { jars?.close(false); });
app.on('will-quit', () => {
  updates?.dispose();
  clearTimeout(recoveryTimer);
  clearInterval(jarTimer);
  clearInterval(linkTimer);
  clearTimeout(debugJarTimer);
  if (idleTimer) clearInterval(idleTimer);
  if (store) store.flush();
  if (tray) { tray.destroy(); tray = null; }
  try { if (hook) hook.stop(); } catch { /* ignore */ }
});
