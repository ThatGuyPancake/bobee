'use strict';
function createReceiver({ inbox, request, show, error = () => {} }) {
  let polling = false, deferred = false, current = null;
  function present() {
    if (deferred || current) return;
    try {
      const next = inbox.next();
      if (next) { current = next.id; show(next); }
    } catch (e) { error(e); }
  }
  return {
    async poll() {
      if (polling) return;
      polling = true;
      try {
        // Complete retries first, so a lost response never re-adds displayed art.
        const receipts = inbox.receipts();
        if (receipts.length) {
          for (let i = 0; i < receipts.length; i += 100) await request('/api/ack', { receipts: receipts.slice(i, i + 100) });
          inbox.acknowledged(receipts.map(r => r.id));
        }
        const { deliveries } = await request('/api/inbox');
        inbox.ingest(deliveries); // persist ALL before any receipt acknowledgement
        const received = deliveries.map(d => ({ id: d.id, status: 'received' }));
        if (received.length) await request('/api/ack', { receipts: received });
      } catch (e) { error(e); }
      finally { polling = false; present(); }
    },
    present,
    finish(id) {
      if (deferred || current !== id || !inbox.complete(id)) return false;
      current = null;
      show(null); present(); return true;
    },
    defer(on) {
      deferred = !!on;
      if (deferred && current) { current = null; show(null); }
      if (!deferred) present();
    },
    active: () => current !== null,
  };
}
module.exports = { createReceiver };
