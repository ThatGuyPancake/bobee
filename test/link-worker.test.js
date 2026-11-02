import { it, expect } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
async function setup() {
  const { default: worker } = await import('../link/worker.mjs');
  const db = new DatabaseSync(':memory:'); db.exec(fs.readFileSync('link/schema.sql', 'utf8'));
  const wrap = sql => ({ bind(...args) { return { first: async () => db.prepare(sql).get(...args) || null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => ({ meta: db.prepare(sql).run(...args) }) }; } });
  const env = { DB: { prepare: wrap }, SETUP_KEY: 'setup-secret' };
  const api = async (route, body, token) => {
    const r = await worker.fetch(new Request('https://bobee.test/api/' + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
    return { status: r.status, body: await r.json() };
  };
  return { api, db };
}
const pixels = 'f0'.repeat(16384), senderToken = 's'.repeat(64);
it('requires enrollment, single-use expiring pairing and distinct revocable roles', async () => {
  const { api, db } = await setup();
  expect((await api('receiver', {})).status).toBe(401);
  const r = (await api('receiver', {}, 'setup-secret')).body;
  expect((await api('pair', { code: r.code, senderToken })).status).toBe(200);
  expect((await api('pair', { code: r.code, senderToken: 't'.repeat(64) })).status).toBe(401);
  expect((await api('inbox', null, senderToken)).status).toBe(401);
  expect((await api('deliveries', { id: 'art', pixels }, r.receiverToken)).status).toBe(401);
  const r2 = (await api('receiver', {}, 'setup-secret')).body;
  db.exec('UPDATE receivers SET expires = 0');
  expect((await api('pair', { code: r2.code, senderToken })).status).toBe(401);
  await api('revoke', {}, r.receiverToken);
  expect((await api('deliveries', { id: 'art', pixels }, senderToken)).status).toBe(401);
});
it('durably orders and deduplicates retries, validates bounds and makes acknowledgements idempotent', async () => {
  const { api } = await setup(); const r = (await api('receiver', {}, 'setup-secret')).body;
  await api('pair', { code: r.code, senderToken });
  expect((await api('deliveries', { id: 'bad', pixels: '<svg/>' }, senderToken)).status).toBe(400);
  const first = await api('deliveries', { id: 'one', pixels }, senderToken);
  const retry = await api('deliveries', { id: 'one', pixels }, senderToken);
  expect(first.body).toEqual(retry.body);
  expect((await api('deliveries', { id: 'one', pixels: '00'.repeat(16384) }, senderToken)).status).toBe(409);
  await api('deliveries', { id: 'two', pixels }, senderToken);
  expect((await api('inbox', null, r.receiverToken)).body.deliveries.map(d => d.id)).toEqual(['one', 'two']);
  await api('ack', { receipts: [{ id: 'one', status: 'received' }] }, r.receiverToken);
  expect((await api('inbox', null, r.receiverToken)).body.deliveries).toHaveLength(2);
  for (let i = 0; i < 2; i++) await api('ack', { receipts: [{ id: 'one', status: 'completed' }] }, r.receiverToken);
  await api('ack', { receipts: [{ id: 'one', status: 'received' }] }, r.receiverToken);
  expect((await api('inbox', null, r.receiverToken)).body.deliveries.map(d => d.id)).toEqual(['two']);
});
it('bounds queue capacity atomically and expires retained data on scheduled cleanup', async () => {
  const { api, db } = await setup(); const r = (await api('receiver', {}, 'setup-secret')).body;
  await api('pair', { code: r.code, senderToken });
  for (let i = 0; i < 100; i++) expect((await api('deliveries', { id: 'art-' + i, pixels }, senderToken)).status).toBe(200);
  expect((await api('deliveries', { id: 'overflow', pixels }, senderToken)).status).toBe(429);
  expect((await api('deliveries', { id: 'art-0', pixels }, senderToken)).status).toBe(200);
  db.exec('UPDATE deliveries SET created=0');
  expect((await api('inbox', null, r.receiverToken)).body.deliveries).toEqual([]);
  const { default: worker } = await import('../link/worker.mjs');
  await worker.scheduled({}, { DB: { prepare: sql => ({ bind: value => ({ run: async () => db.prepare(sql).run(value) }) }) } });
  expect(db.prepare('SELECT COUNT(*) AS n FROM deliveries').get().n).toBe(0);
});
it('confirms queued, received and displayed deliveries only for the paired sender', async () => {
  const { api } = await setup(); const r = (await api('receiver', {}, 'setup-secret')).body;
  await api('pair', { code: r.code, senderToken });
  await api('deliveries', { id: 'one', pixels }, senderToken);
  const status = () => api('status', { ids: ['one', 'missing'] }, senderToken);
  expect((await status()).body.deliveries).toEqual([{ id: 'one', status: 'queued' }, { id: 'missing', status: 'unavailable' }]);
  await api('ack', { receipts: [{ id: 'one', status: 'received' }] }, r.receiverToken);
  expect((await status()).body.deliveries[0]).toEqual({ id: 'one', status: 'received' });
  await api('ack', { receipts: [{ id: 'one', status: 'completed' }] }, r.receiverToken);
  expect((await status()).body.deliveries[0]).toEqual({ id: 'one', status: 'displayed' });
  expect((await api('status', {}, senderToken)).body.deliveries).toEqual([expect.objectContaining({ id: 'one', status: 'displayed', sentAt: expect.any(Number) })]);
  expect((await api('status', { ids: ['one'] }, r.receiverToken)).status).toBe(401);
  expect((await api('status', { ids: ['one'] })).status).toBe(401);
  const other = (await api('receiver', {}, 'setup-secret')).body, otherToken = 'x'.repeat(64);
  await api('pair', { code: other.code, senderToken: otherToken });
  expect((await api('status', { ids: ['one'] }, otherToken)).body.deliveries).toEqual([{ id: 'one', status: 'unavailable' }]);
  expect((await api('status', {}, otherToken)).body.deliveries).toEqual([]);
});
it('bounds status queries and never claims expired deliveries were received', async () => {
  const { api, db } = await setup(); const r = (await api('receiver', {}, 'setup-secret')).body;
  await api('pair', { code: r.code, senderToken });
  expect((await api('status', { ids: Array(21).fill('one') }, senderToken)).status).toBe(400);
  expect((await api('status', { ids: ['../one'] }, senderToken)).status).toBe(400);
  await api('deliveries', { id: 'one', pixels }, senderToken); db.exec('UPDATE deliveries SET created=0');
  expect((await api('status', { ids: ['one'] }, senderToken)).body.deliveries).toEqual([{ id: 'one', status: 'unavailable' }]);
});
