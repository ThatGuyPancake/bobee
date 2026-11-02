'use strict';
const fs = require('node:fs');
const path = require('node:path');
function createCredentials(file, safeStorage) {
  return {
    load() {
      try { return JSON.parse(safeStorage.decryptString(fs.readFileSync(file))); }
      catch (e) { if (e.code !== 'ENOENT') console.warn('[bobee] Link credentials unavailable; reconnect through settings.'); return null; }
    },
    save(value) {
      if (!safeStorage.isEncryptionAvailable()) throw Error('Windows credential encryption unavailable');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600 });
      fs.renameSync(file + '.tmp', file);
    },
    clear() { fs.rmSync(file, { force: true }); },
  };
}
async function linkRequest(config, route, body, fetcher = fetch) {
  const response = await fetcher(config.url + route, {
    method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
    headers: { authorization: 'Bearer ' + config.token, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const reader = response.body.getReader(); let size = 0; const chunks = [];
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length; if (size > 3500000) { await reader.cancel(); throw Error('Link response too large'); } chunks.push(Buffer.from(value));
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!response.ok) throw Error(typeof data.error === 'string' ? data.error : 'Link request failed');
  return data;
}
function normalizeLinkUrl(raw, dev = false) {
  const url = new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(dev && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw Error('Use the HTTPS address of your Bobee Link website');
  return url.origin;
}
module.exports = { createCredentials, linkRequest, normalizeLinkUrl };
