// Explicit production integration check. Creates and then revokes one test receiver.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const url = process.argv[2];
if (!url || new URL(url).protocol !== 'https:') throw Error('Pass the deployed HTTPS origin');
const { SETUP_KEY } = JSON.parse(fs.readFileSync(new URL('./.deployment-secrets.json', import.meta.url)));
let receiver;
async function api(route, body, token, status = 200) {
  const r = await fetch(url + '/api/' + route, { method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await r.json(); assert.equal(r.status, status, data.error || 'Unexpected status'); return data;
}
try {
  for (const asset of ['/', '/sender.js', '/style.css', '/base.css', '/tracking.js']) {
    const r = await fetch(url + asset); assert.equal(r.status, 200); assert.ok(r.headers.get('content-security-policy')); assert.ok((await r.text()).length > 20);
  }
  await api('inbox', null, null, 401);
  receiver = await api('receiver', {}, SETUP_KEY);
  const senderToken = [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join('');
  await api('pair', { code: receiver.code, senderToken });
  const art = { id: crypto.randomUUID(), pixels: 'e8c090ff'.repeat(4096) };
  const accepted = await api('deliveries', art, senderToken);
  assert.deepEqual(await api('deliveries', art, senderToken), accepted);
  assert.equal((await api('status', { ids: [art.id] }, senderToken)).deliveries[0].status, 'queued');
  await api('inbox', null, senderToken, 401);
  const { deliveries } = await api('inbox', null, receiver.receiverToken);
  assert.equal(deliveries.length, 1); assert.equal(deliveries[0].id, art.id); assert.equal(deliveries[0].pixels, art.pixels);
  await api('ack', { receipts: [{ id: art.id, status: 'received' }] }, receiver.receiverToken);
  assert.equal((await api('status', { ids: [art.id] }, senderToken)).deliveries[0].status, 'received');
  assert.equal((await api('inbox', null, receiver.receiverToken)).deliveries.length, 1);
  await api('ack', { receipts: [{ id: art.id, status: 'completed' }] }, receiver.receiverToken);
  assert.equal((await api('status', { ids: [art.id] }, senderToken)).deliveries[0].status, 'displayed');
  const history = (await api('status', {}, senderToken)).deliveries;
  assert.equal(history[0].id, art.id); assert.equal(history[0].status, 'displayed');
  assert.equal(typeof history[0].sentAt, 'number'); assert.equal('pixels' in history[0], false);
  assert.equal((await api('inbox', null, receiver.receiverToken)).deliveries.length, 0);
  console.log('Live check passed: deployed assets, enrollment, pairing, role isolation, durable queue, duplicate retry and completion.');
} finally {
  if (receiver) { await api('revoke', {}, receiver.receiverToken); console.log('Temporary live-test receiver revoked.'); }
}
