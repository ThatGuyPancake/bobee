'use strict';
const path = require('node:path');
const validDrawing = d => d && typeof d.id === 'string' && /^[\w-]{1,80}$/.test(d.id) && Number.isSafeInteger(d.sequence) && d.sequence > 0 && typeof d.pixels === 'string' && /^[a-f0-9]{32768}$/.test(d.pixels);
// Each mutation is committed synchronously before its caller can acknowledge it.
function createInbox(file, { fs = require('node:fs') } = {}) {
  let rows = [];
  try {
    rows = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(rows) || rows.some(r => !['pending', 'presenting', 'completed'].includes(r.status) || (r.status !== 'completed' && !validDrawing(r)))) throw Error('Invalid inbox');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  let active = null;
  function save(next) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const fd = fs.openSync(file + '.tmp', 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(next)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(file + '.tmp', file); rows = next;
  }
  return {
    ingest(deliveries) {
      if (!Array.isArray(deliveries) || deliveries.length > 100 || !deliveries.every(validDrawing)) throw Error('Invalid drawing data');
      const next = rows.map(r => ({ ...r }));
      for (const d of deliveries) {
        const old = next.find(r => r.id === d.id);
        if (old && (old.sequence !== d.sequence || (old.pixels && old.pixels !== d.pixels))) throw Error('Delivery conflict');
        if (!old) next.push({ ...d, status: 'pending' });
      }
      if (next.filter(r => r.status !== 'completed').length > 100) throw Error('Inbox full');
      if (next.length !== rows.length) save(next.sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id)));
    },
    next() {
      if (active) return { ...rows.find(r => r.id === active) };
      const row = rows.find(r => r.status !== 'completed');
      if (!row) return null;
      save(rows.map(r => r.id === row.id ? { ...r, status: 'presenting' } : r));
      active = row.id; return { ...rows.find(r => r.id === active) };
    },
    complete(id) {
      if (!active || active !== id) return false;
      save(rows.map(r => r.id === id ? { id, sequence: r.sequence, status: 'completed', completedAt: Date.now() } : r));
      active = null; return true;
    },
    receipts: () => rows.map(r => ({ id: r.id, status: r.status === 'completed' ? 'completed' : 'received' })),
    acknowledged(ids) {
      const cutoff = Date.now() - 30 * 86400000;
      const next = rows.filter(r => !(r.status === 'completed' && r.completedAt < cutoff && ids.includes(r.id)));
      if (next.length !== rows.length) save(next);
    },
  };
}
module.exports = { createInbox, validDrawing };
