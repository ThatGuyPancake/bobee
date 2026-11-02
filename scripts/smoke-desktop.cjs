'use strict';
// Runs the actual renderer/preload boundary in an isolated, hidden Electron window.
const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), temp = path.join(base, 'test', '.electron-smoke');
fs.mkdirSync(temp, { recursive: true }); app.setPath('userData', path.join(temp, 'profile-' + process.pid));
const { createInbox } = require('../lib/linkInbox'), { createReceiver } = require('../lib/linkReceiver');
protocol.registerSchemesAsPrivileged([{ scheme: 'bobee', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let state = { happiness: 60, outfits: false, paused: true, activeMinutes: 0, restMode: 'home', quietHours: true, said: [], day: '2026-11-02', jarsShown: 0 };
fs.writeFileSync(path.join(temp, 'preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');
const listen=(c,f)=>ipcRenderer.on(c,(_,p)=>f(p));
contextBridge.exposeInMainWorld('bobee', {
 getConfig:()=>Promise.resolve({debugDate:'2026-11-02T23:00:00'}),getState:()=>ipcRenderer.invoke('smoke-state'),getBounds:()=>Promise.resolve({x:0,y:0,width:200,height:270,minX:0,maxX:0}),patchState:p=>ipcRenderer.send('smoke-patch',p),
 setHeight:h=>ipcRenderer.send('smoke-height',h),ready:()=>ipcRenderer.send('smoke-ready'),drawingDone:id=>ipcRenderer.send('smoke-done',id),
 onDrawing:f=>listen('drawing',f),onCommand:f=>listen('command',f),onJar:f=>listen('jar',f),onTreatEaten:f=>listen('treat-eaten',f),onKeyPulse:f=>listen('key-pulse',f),onIdle:f=>listen('idle',f),onBounds:f=>listen('bounds',f),
 reportVisible:()=>{},moveBy:()=>{},moveTo:()=>{},dropToFloor:()=>{},setClickThrough:on=>ipcRenderer.send('smoke-through',on),snackStart:()=>{},snackEat:()=>{}
});`);
app.whenReady().then(async () => {
  let win, r; const errors = [], heights = [], through = [];
  try {
    protocol.handle('bobee', async request => {
      const file = path.join(base, new URL(request.url).pathname);
      const ext = path.extname(file), types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json' };
      try { return new Response(fs.readFileSync(file), { headers: { 'content-type': types[ext] || 'text/plain' } }); } catch { return new Response('missing', { status: 404 }); }
    });
    ipcMain.handle('smoke-state', () => state);
    ipcMain.on('smoke-patch', (_, p) => { state = { ...state, ...p }; });
    ipcMain.on('smoke-height', (_, h) => { heights.push(h); if (win) win.setSize(200, h); });
    ipcMain.on('smoke-through', (_, on) => through.push(on));
    ipcMain.on('smoke-done', (_, id) => r.finish(id));
    const ready = new Promise(resolve => ipcMain.once('smoke-ready', resolve));
    win = new BrowserWindow({ show: false, width: 200, height: 270, frame: false, backgroundColor: '#a3bc9a', webPreferences: { preload: path.join(temp, 'preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false, offscreen: true } });
    win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
    await win.loadURL('bobee://app/renderer/index.html');
    await Promise.race([ready, wait(15000).then(() => { throw Error('Renderer never became ready'); })]);
    const js = code => win.webContents.executeJavaScript(code);
    async function until(code) {
      for (let i = 0; i < 60; i++) { if (await js(code)) return; await wait(100); }
      throw Error('Renderer condition timed out: ' + code);
    }
    async function reveal() {
      await js("(()=>{const c=document.getElementById('bobee'),r=document.getElementById('sprite-wrap').getBoundingClientRect();c.dispatchEvent(new MouseEvent('mousedown',{button:0,clientX:r.left+48,clientY:r.top+45,bubbles:true}));})()");
      await until("document.getElementById('board').dataset.phase === 'showing'");
    }
    assert.equal(await js("document.getElementById('sprite-wrap').classList.contains('away')"), true);
    await js("window.__bobee.showMessage({text:'A bubble before the drawing'})");
    const inboxFile = path.join(temp, 'inbox.json'); fs.rmSync(inboxFile, { force: true });
    const inbox = createInbox(inboxFile);
    inbox.ingest([{ id: 'first', sequence: 1, pixels: 'ff8844ff'.repeat(4096) }, { id: 'second', sequence: 2, pixels: '88ccffff'.repeat(4096) }]);
    r = createReceiver({ inbox, request: async () => ({ deliveries: [] }), show: d => win.webContents.send('drawing', d) });
    r.present(); await wait(650);
    assert.equal(await js("document.getElementById('board').hidden"), true, 'art waits for a click');
    assert.equal(await js("['I have something for you','Special delivery'].includes(document.getElementById('bubble').textContent)"), true);
    assert.equal(await js("document.getElementById('sprite-wrap').classList.contains('away')"), false);
    assert.equal(inbox.next().id, 'first', 'waiting delivery stays durably active');
    await reveal(); await wait(400);
    assert.equal(heights.at(-1), 230, 'delayed bubble hide must preserve smaller board height');
    assert.equal(await js("document.querySelector('#board canvas').getBoundingClientRect().width"), 96);
    assert.equal(await js("document.getElementById('board').getBoundingClientRect().top >= 0"), true);
    fs.writeFileSync(path.join(temp, 'board.png'), (await win.webContents.capturePage()).toPNG());
    // Change the current preference while a drawing overrides saved Pause/quiet/off.
    state = { ...state, paused: false, activeMinutes: 60, quietHours: false, restMode: 'sleep' };
    win.webContents.send('command', 'preferences'); win.webContents.send('command', 'resume');
    await wait(150); await js("document.querySelector('#board button').click()"); await wait(150);
    assert.equal(await js("document.getElementById('board').dataset.phase"), 'stowing');
    assert.equal(inbox.next().id, 'first', 'put-away must finish before the next delivery starts');
    assert.equal(await js("document.querySelector('#board button').disabled"), true);
    await wait(200);
    fs.writeFileSync(path.join(temp, 'put-away.png'), (await win.webContents.capturePage()).toPNG());
    await until("document.getElementById('board').dataset.phase === 'waiting'");
    assert.equal(inbox.next().id, 'second');
    assert.equal(await js("document.getElementById('board').hidden"), true, 'each queued delivery gets its own invitation');
    await reveal();
    await js("document.querySelector('#board button').click()");
    await until("document.getElementById('board').dataset.phase === 'idle'");
    assert.equal(await js("document.getElementById('board').hidden"), true);
    assert.equal(await js("document.getElementById('sprite-wrap').classList.contains('away') || document.getElementById('sprite-wrap').classList.contains('home-away')"), false);
    assert.equal(inbox.next(), null); assert.equal(state.paused, false); assert.equal(state.activeMinutes, 60);
    state = { ...state, activeMinutes: 0, restMode: 'home' }; win.webContents.send('command', 'preferences');
    await until("document.getElementById('sprite-wrap').classList.contains('home-away')");
    assert.equal(await js("document.getElementById('sprite-wrap').classList.contains('home-away')"), true);
    await js("window.dispatchEvent(new MouseEvent('mousemove',{clientX:190,clientY:170,screenX:190,screenY:170}))"); await wait(100);
    assert.equal(through.at(-1), true, 'hidden Bobee must not intercept desktop clicks');
    // An unfinished presentation is suppressed while locked, and replays on unlock.
    inbox.ingest([{ id: 'third', sequence: 3, pixels: 'dd99ffff'.repeat(4096) }]); r.present(); await wait(100);
    r.defer(true); await wait(500); assert.equal(await js("document.getElementById('board').hidden"), true, JSON.stringify({ errors, active: r.active() }));
    r.defer(false); await until("document.getElementById('board').dataset.phase === 'waiting'");
    assert.equal(await js("document.getElementById('sprite-wrap').classList.contains('home-away')"), false);
    state = { ...state, paused: true }; win.webContents.send('command', 'pause'); await wait(450);
    assert.equal(await js("document.getElementById('sprite-wrap').classList.contains('away')"), false, 'Pause selected during board must not suppress art');
    assert.equal(await js("document.getElementById('bubble').hidden"), false, 'Pause must preserve the waiting delivery announcement');
    await reveal();
    await js("document.querySelector('#board button').click()");
    await until("document.getElementById('sprite-wrap').classList.contains('away') && document.getElementById('board').hidden");
    assert.equal(state.paused, true, 'presentation must preserve the currently selected Pause');
    assert.equal(errors.length, 0, errors.join('\n'));
    console.log('Desktop smoke passed: invitation/click/reveal, smaller board, queued invitations, Pause/off/night overrides, current preference restoration, click-through and lock replay.');
    app.exit(0);
  } catch (error) { console.error(error); app.exit(1); }
});
