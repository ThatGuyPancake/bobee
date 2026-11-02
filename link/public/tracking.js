const ranks = { queued: 0, received: 1, displayed: 2, unavailable: 3 };
const valid = row => row && typeof row.id === 'string' && /^[\w-]{1,80}$/.test(row.id) && Object.hasOwn(ranks, row.status) && Number.isFinite(row.sentAt);
export function createTracking({ read, write, request, changed, now = Date.now }) {
  let rows = [], polling = false, generation = 0, disconnected = false, historyPending = false;
  try { const saved = read(); if (Array.isArray(saved)) rows = saved.filter(valid).slice(0, 20); } catch { /* browser storage unavailable */ }
  function update() {
    try { write(rows.map(r => ({ ...r }))); } catch { /* keep live receipts when browser storage is full */ }
    changed(rows.map(r => ({ ...r })), disconnected);
  }
  return {
    rows: () => rows.map(r => ({ ...r })),
    sent(id) {
      if (!/^[\w-]{1,80}$/.test(id) || rows.some(r => r.id === id)) return;
      rows = [{ id, status: 'queued', sentAt: now() }, ...rows].slice(0, 20); update();
    },
    clear() { generation++; rows = []; disconnected = false; historyPending = false; update(); },
    async history() {
      historyPending = true;
      if (polling) return;
      const version = generation; polling = true;
      try {
        const result = await request(null);
        if (version !== generation) return;
        if (!Array.isArray(result.deliveries) || result.deliveries.length > 20 || !result.deliveries.every(valid)) throw Error('Invalid delivery history');
        const ids = new Set(result.deliveries.map(r => r.id));
        rows = [...rows.filter(r => !ids.has(r.id)), ...result.deliveries.map(row => {
          const known = rows.find(r => r.id === row.id);
          return known && ranks[known.status] >= ranks[row.status] ? known : { id: row.id, status: row.status, sentAt: row.sentAt };
        })].sort((a, b) => b.sentAt - a.sentAt).slice(0, 20);
        disconnected = false; historyPending = false; update();
      } catch { if (version === generation) { disconnected = true; update(); } }
      finally { polling = false; }
    },
    async poll() {
      if (historyPending) return this.history();
      if (polling) return;
      const ids = rows.filter(r => r.status === 'queued' || r.status === 'received').map(r => r.id);
      if (!ids.length) return;
      const version = generation; polling = true;
      try {
        const result = await request(ids);
        if (version !== generation) return;
        if (!Array.isArray(result.deliveries) || result.deliveries.length > 20 || result.deliveries.some(r => !ids.includes(r.id) || !Object.hasOwn(ranks, r.status))) throw Error('Invalid delivery status');
        const states = new Map(result.deliveries.map(r => [r.id, r.status]));
        let edited = disconnected;
        rows = rows.map(row => {
          const status = states.get(row.id);
          if (status && ranks[status] > ranks[row.status]) { edited = true; return { ...row, status }; }
          return row;
        });
        disconnected = false; if (edited) update();
      } catch {
        if (version === generation && !disconnected) { disconnected = true; update(); }
      } finally { polling = false; }
    },
    render: () => changed(rows.map(r => ({ ...r })), disconnected),
  };
}
