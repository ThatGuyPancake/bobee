'use strict';
// Actual website JS/DOM, isolated local HTTP server, dummy credentials, no live sends.
const { app, BrowserWindow } = require('electron');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const base = path.resolve(__dirname, '..'), temp = path.join(base, 'test', '.electron-smoke');
app.setPath('userData', path.join(temp, 'sender-' + process.pid));
fs.writeFileSync(path.join(temp, 'sender-preload.cjs'), "localStorage.setItem('bobee-sender','s'.repeat(64));");
app.whenReady().then(async () => {
  let status = 'queued', offline = false, id = null, win;
  const errors = [];
  const server = http.createServer(async (req, res) => {
    if (req.url.startsWith('/api/')) {
      const chunks = []; for await (const c of req) chunks.push(c);
      const data = JSON.parse(Buffer.concat(chunks).toString() || '{}');
      res.setHeader('content-type', 'application/json');
      if (offline) { res.statusCode = 503; return res.end(JSON.stringify({ error: 'offline test' })); }
      if (req.url === '/api/deliveries') { id = data.id; return res.end(JSON.stringify({ id, sequence: 1 })); }
      if (req.url === '/api/status') return res.end(JSON.stringify({ deliveries: data.ids ? data.ids.map(id => ({ id, status })) : id ? [{ id, status, sentAt: Date.now() }] : [] }));
      res.statusCode = 404; return res.end('{}');
    }
    const file = req.url === '/' ? path.join(base, 'link', 'index.html') : path.join(base, 'link', 'public', req.url);
    const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' }[path.extname(file)];
    try { res.setHeader('content-type', type || 'text/plain'); res.end(fs.readFileSync(file)); } catch { res.statusCode = 404; res.end('missing'); }
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    win = new BrowserWindow({ show: false, width: 1000, height: 1000, webPreferences: { preload: path.join(temp, 'sender-preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false, offscreen: true } });
    win.webContents.on('console-message', e => { if (e.level === 'error' && !e.message.includes('503') && !e.message.includes('favicon')) errors.push(e.message); });
    await win.loadURL('http://127.0.0.1:' + server.address().port);
    const js = source => win.webContents.executeJavaScript(source);
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function until(expression) { for (let i = 0; i < 80; i++) { if (await js(expression)) return; await wait(100); } throw Error('Timed out: ' + expression); }
    await js("Object.defineProperty(document,'hidden',{get:()=>false,configurable:true});void 0");
    const png = fs.readFileSync(path.join(base, 'art', 'bobee-master.png')).toString('base64');
    await js(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob('${png}'),c=>c.charCodeAt(0))],'picture.png',{type:'image/png'}));const file=document.getElementById('file');file.files=dt.files;file.dispatchEvent(new Event('change'));})()`);
    await until("!document.getElementById('send').disabled");
    await js("document.getElementById('send').click()");
    await until("document.getElementById('delivery-list').textContent.includes('Queued')");
    assert.ok(id);
    status = 'received'; await js("document.dispatchEvent(new Event('visibilitychange'))");
    await until("document.getElementById('delivery-list').textContent.includes('Received by her Bobee')");
    offline = true; await js("document.dispatchEvent(new Event('visibilitychange'))");
    await until("document.getElementById('delivery-note').textContent.includes('Connection interrupted')");
    assert.equal(await js("document.getElementById('delivery-list').textContent.includes('Received by her Bobee')"), true);
    offline = false; status = 'displayed'; await js("document.dispatchEvent(new Event('visibilitychange'))");
    await until("document.getElementById('delivery-list').textContent.includes('Displayed by her Bobee')");
    const reloaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve));
    win.webContents.reload(); await reloaded;
    await until("document.getElementById('delivery-list')?.textContent.includes('Displayed by her Bobee')");
    await js("document.getElementById('delivery-history').scrollIntoView({block:'center'})"); await wait(200);
    fs.writeFileSync(path.join(temp, 'sender-receipts.png'), (await win.webContents.capturePage()).toPNG());
    await js("document.getElementById('forget').click()");
    assert.equal(await js("document.getElementById('delivery-history').hidden"), true);
    assert.deepEqual(errors, []);
    console.log('Sender UI smoke passed: real upload/send, queued/received/displayed receipts, offline recovery, refresh persistence and forget.');
    server.close(); app.exit(0);
  } catch (error) { console.error(error); server.close(); app.exit(1); }
});
