const DAY = 86400000;
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const random = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const hash = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))));
const idOK = id => typeof id === 'string' && /^[\w-]{1,80}$/.test(id);
const pixelsOK = p => typeof p === 'string' && /^[a-f0-9]{32768}$/.test(p);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const headers = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; img-src 'self' blob:; style-src 'self'; script-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'" };
const json = (body, status = 200) => Response.json(body, { status, headers });
async function body(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'JSON required');
  const reader = request.body?.getReader(); if (!reader) return {};
  let size = 0; const chunks = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 40000) { await reader.cancel(); fail(413, 'Request too large'); } chunks.push(value); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { const data = JSON.parse(new TextDecoder().decode(bytes)); if (!data || Array.isArray(data) || typeof data !== 'object') throw Error(); return data; } catch { fail(400, 'Invalid JSON'); }
}
async function cleanup(env) {
  await env.DB.prepare('DELETE FROM deliveries WHERE created < ?').bind(Date.now() - 30 * DAY).run();
  await env.DB.prepare('DELETE FROM receivers WHERE sender_hash IS NULL AND expires < ?').bind(Date.now() - DAY).run();
}
export default {
  async scheduled(_event, env) { await cleanup(env); },
  async fetch(request, env) {
    try {
      const url = new URL(request.url), route = url.pathname;
      if (!route.startsWith('/api/')) {
        if (!env.ASSETS) return new Response('Not found', { status: 404 });
        const response = await env.ASSETS.fetch(request);
        return new Response(response.body, { status: response.status, headers: { ...Object.fromEntries(response.headers), ...headers } });
      }
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) fail(403, 'Origin not allowed');
      const token = request.headers.get('authorization')?.match(/^Bearer (.{1,256})$/)?.[1];
      if (route === '/api/receiver' && request.method === 'POST') {
        if (!env.SETUP_KEY || !token || await hash(token) !== await hash(env.SETUP_KEY)) fail(401, 'Enrollment key required');
        const receiverToken = random(32), code = random(16), id = crypto.randomUUID();
        await env.DB.prepare('INSERT INTO receivers(id,receiver_hash,code_hash,expires) VALUES(?,?,?,?)').bind(id, await hash(receiverToken), await hash(code), Date.now() + 600000).run();
        return json({ receiverToken, code, expiresIn: 600 });
      }
      if (route === '/api/pair' && request.method === 'POST') {
        const data = await body(request);
        if (!/^[a-f0-9]{32}$/.test(data.code) || !/^[\w-]{64}$/.test(data.senderToken)) fail(400, 'Invalid pairing data');
        const senderHash = await hash(data.senderToken), codeHash = await hash(data.code);
        const paired = await env.DB.prepare('UPDATE receivers SET sender_hash=? WHERE code_hash=? AND expires>? AND revoked=0 AND (sender_hash IS NULL OR sender_hash=?) RETURNING id').bind(senderHash, codeHash, Date.now(), senderHash).first();
        if (!paired) fail(401, 'Pairing code expired or already used');
        return json({ paired: true });
      }
      if (!token) fail(401, 'Authorization required');
      const role = ['/api/deliveries', '/api/status'].includes(route) ? 'sender_hash' : 'receiver_hash';
      const receiver = await env.DB.prepare(`SELECT id FROM receivers WHERE ${role}=? AND revoked=0`).bind(await hash(token)).first();
      if (!receiver) fail(401, 'Pairing unavailable');
      if (route === '/api/status' && request.method === 'POST') {
        const data = await body(request);
        const visible = { pending: 'queued', received: 'received', completed: 'displayed' };
        if (data.ids === undefined) {
          const rows = await env.DB.prepare('SELECT id,status,created FROM deliveries WHERE receiver_id=? AND created>? ORDER BY sequence DESC LIMIT 20').bind(receiver.id, Date.now() - 30 * DAY).all();
          return json({ deliveries: rows.results.map(row => ({ id: row.id, status: visible[row.status], sentAt: row.created })) });
        }
        if (!Array.isArray(data.ids) || data.ids.length > 20 || !data.ids.every(idOK)) fail(400, 'Expected up to 20 delivery IDs');
        const ids = [...new Set(data.ids)];
        if (!ids.length) return json({ deliveries: [] });
        const rows = await env.DB.prepare(`SELECT id,status FROM deliveries WHERE receiver_id=? AND created>? AND id IN (${ids.map(() => '?').join(',')})`).bind(receiver.id, Date.now() - 30 * DAY, ...ids).all();
        const states = new Map(rows.results.map(r => [r.id, r.status]));
        return json({ deliveries: ids.map(id => ({ id, status: visible[states.get(id)] || 'unavailable' })) });
      }
      if (route === '/api/deliveries' && request.method === 'POST') {
        const data = await body(request);
        if (!idOK(data.id) || !pixelsOK(data.pixels)) fail(400, 'Expected a 64×64 RGBA image');
        const digest = await hash(data.pixels);
        // The capacity condition and insertion run as one SQLite statement.
        await env.DB.prepare(`INSERT OR IGNORE INTO deliveries(receiver_id,id,pixels,digest,created)
          SELECT ?,?,?,?,? WHERE (SELECT COUNT(*) FROM deliveries WHERE receiver_id=? AND status!='completed' AND created>?)<100`).bind(receiver.id, data.id, data.pixels, digest, Date.now(), receiver.id, Date.now() - 30 * DAY).run();
        const row = await env.DB.prepare('SELECT sequence,digest FROM deliveries WHERE receiver_id=? AND id=?').bind(receiver.id, data.id).first();
        if (!row) fail(429, 'Bobee’s inbox is full. Try later.');
        if (row.digest !== digest) fail(409, 'Delivery ID already used for different art');
        return json({ id: data.id, sequence: row.sequence });
      }
      if (route === '/api/inbox' && request.method === 'GET') {
        const rows = await env.DB.prepare("SELECT id,sequence,pixels FROM deliveries WHERE receiver_id=? AND status!='completed' AND created>? ORDER BY sequence LIMIT 100").bind(receiver.id, Date.now() - 30 * DAY).all();
        return json({ deliveries: rows.results });
      }
      if (route === '/api/ack' && request.method === 'POST') {
        const data = await body(request);
        if (!Array.isArray(data.receipts) || data.receipts.length > 100 || data.receipts.some(r => !idOK(r.id) || !['received', 'completed'].includes(r.status))) fail(400, 'Invalid receipts');
        for (const r of data.receipts) {
          if (r.status === 'completed') await env.DB.prepare("UPDATE deliveries SET status='completed',pixels=NULL WHERE receiver_id=? AND id=?").bind(receiver.id, r.id).run();
          else await env.DB.prepare("UPDATE deliveries SET status='received' WHERE receiver_id=? AND id=? AND status='pending'").bind(receiver.id, r.id).run();
        }
        return json({ acknowledged: true });
      }
      if (route === '/api/revoke' && request.method === 'POST') {
        await env.DB.prepare('UPDATE receivers SET revoked=1 WHERE id=?').bind(receiver.id).run();
        await env.DB.prepare('DELETE FROM deliveries WHERE receiver_id=?').bind(receiver.id).run();
        return json({ revoked: true });
      }
      fail(404, 'Not found');
    } catch (e) { return json({ error: e.status ? e.message : 'Service unavailable. Please retry.' }, e.status || 503); }
  },
};
