import { Miniflare } from 'miniflare';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const config = JSON.parse(fs.readFileSync(new URL('./.cloudflare/output/v0/workers/default/worker.config.json', import.meta.url)));
config.env.SETUP_KEY = { type: 'text', value: 'local-test-key' };
config.manifest = { mainModule: 'index.js', modulesRoot: '/', modules: { 'index.js': { type: 'esm', contents: fs.readFileSync(new URL('./.cloudflare/output/v0/workers/default/bundle/index.js', import.meta.url), 'utf8') } } };
config.assets.directory = new URL('./.cloudflare/output/v0/workers/default/assets', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
config.assets.hasUserWorker = true;
const mf = new Miniflare({ workers: [{ config }], telemetry: { enabled: false } });
try {
  const db = await mf.getD1Database('DB');
  for (const statement of fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8').split(';').filter(s => s.trim())) await db.prepare(statement).run();
  async function api(route, body, token) {
    const r = await mf.dispatchFetch('https://bobee.test/api/' + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await r.json(); assert.equal(r.status, 200, JSON.stringify(data)); return data;
  }
  const receiver = await api('receiver', {}, 'local-test-key');
  const senderToken = 'a'.repeat(64); await api('pair', { code: receiver.code, senderToken });
  const pixels = 'ee'.repeat(16384);
  const deliveries = await Promise.all(Array.from({ length: 4 }, (_, n) => api('deliveries', { id: 'delivery-' + n, pixels }, senderToken)));
  const inbox = await api('inbox', null, receiver.receiverToken);
  assert.equal(inbox.deliveries.length, 4);
  assert.deepEqual(inbox.deliveries.map(d => d.sequence), deliveries.map(d => d.sequence).sort((a, b) => a - b));
  const ids = inbox.deliveries.map(d => d.id);
  assert.ok((await api('status', { ids }, senderToken)).deliveries.every(d => d.status === 'queued'));
  await api('ack', { receipts: ids.map(id => ({ id, status: 'received' })) }, receiver.receiverToken);
  assert.ok((await api('status', { ids }, senderToken)).deliveries.every(d => d.status === 'received'));
  await api('ack', { receipts: inbox.deliveries.map(d => ({ id: d.id, status: 'completed' })) }, receiver.receiverToken);
  assert.deepEqual((await api('inbox', null, receiver.receiverToken)).deliveries, []);
  assert.ok((await api('status', { ids }, senderToken)).deliveries.every(d => d.status === 'displayed'));
  for (const asset of ['/', '/style.css', '/base.css', '/sender.js', '/tracking.js']) {
    const r = await mf.dispatchFetch('https://bobee.test' + asset); assert.equal(r.status, 200, asset);
    assert.ok(r.headers.get('content-security-policy')); assert.ok((await r.text()).length > 20);
  }
  console.log('Cloudflare runtime smoke passed: real D1, simultaneous sends, ordered inbox, acknowledgements and static assets.');
} finally { await mf.dispose(); }
