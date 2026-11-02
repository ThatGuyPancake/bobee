import { createTracking } from './tracking.js';
const $ = id => document.getElementById(id);
const canvas = $('preview'), ctx = canvas.getContext('2d');
let token = localStorage.getItem('bobee-sender') || '', pixels = null, delivery = null, busy = false;
const message = text => { $('status').textContent = text; };
function refresh() { $('paired').textContent = token ? 'Paired. Your Bobee is ready for a surprise.' : 'Not paired yet.'; $('send').disabled = !token || !pixels || busy; $('forget').disabled = !token || busy; }
async function api(route, data, auth = token) {
  const response = await fetch('/api/' + route, { method: 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer ' + auth } : {}) }, body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
  const result = await response.json(); if (!response.ok) throw Error(result.error || 'Could not connect'); return result;
}
const tracker = createTracking({
  read: () => { const data = JSON.parse(localStorage.getItem('bobee-delivery-history') || 'null'); return data?.pairing === token ? data.rows : []; },
  write: rows => localStorage.setItem('bobee-delivery-history', JSON.stringify({ pairing: token, rows })),
  request: ids => api('status', ids === null ? {} : { ids }),
  changed(rows, disconnected) {
    $('delivery-history').hidden = !rows.length;
    $('delivery-list').replaceChildren(...rows.map(row => {
      const item = document.createElement('li'), title = document.createElement('strong'), status = document.createElement('span');
      title.textContent = 'Picture sent ' + new Date(row.sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const labels = { queued: 'Queued — waiting for her Bobee', received: '✓ Received by her Bobee', displayed: '✓ Displayed by her Bobee', unavailable: 'No longer available — delivery record expired or removed' };
      status.textContent = labels[row.status]; status.className = 'receipt ' + row.status;
      item.append(title, status); return item;
    }));
    $('delivery-note').textContent = disconnected ? 'Connection interrupted. Keeping the last confirmed status and trying again.' : 'Received confirms the picture is saved on her PC. Displayed confirms Bobee finished presenting the frame.';
  },
});
tracker.render();
const checkDeliveries = () => { if (token && !document.hidden) tracker.poll(); };
setInterval(checkDeliveries, 5000);
document.addEventListener('visibilitychange', checkDeliveries);
$('pair').addEventListener('submit', async e => {
  e.preventDefault(); if (busy) return; busy = true; e.submitter.disabled = true; refresh();
  // Save the pending secret before attempting pairing: a lost response can retry safely.
  let pending = sessionStorage.getItem('bobee-pending-sender');
  if (!pending) { pending = [...crypto.getRandomValues(new Uint8Array(32))].map(v => v.toString(16).padStart(2, '0')).join(''); sessionStorage.setItem('bobee-pending-sender', pending); }
  try {
    await api('pair', { code: $('code').value.trim(), senderToken: pending }, '');
    localStorage.setItem('bobee-sender', pending); token = pending; tracker.clear(); sessionStorage.removeItem('bobee-pending-sender'); $('code').value = ''; message('Connected to your desktop Bobee.');
    tracker.history();
  } catch (e) { message(e.message); } finally { busy = false; $('pair').querySelector('button').disabled = false; refresh(); }
});
$('forget').addEventListener('click', () => { localStorage.removeItem('bobee-sender'); token = ''; tracker.clear(); delivery = null; refresh(); message('Forgotten here. To revoke sender access, disconnect from Bobee’s desktop menu.'); });
let selection = 0;
$('file').addEventListener('change', async () => {
  const selected = ++selection, file = $('file').files[0]; pixels = null; delivery = null; refresh(); ctx.clearRect(0, 0, 64, 64);
  if (!file) return;
  try {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw Error('Choose a PNG, JPEG or WebP up to 2 MB.');
    const bitmap = await createImageBitmap(file);
    try {
      if (selected !== selection) return;
      if (bitmap.width > 4096 || bitmap.height > 4096) throw Error('Please resize your picture to 4096 × 4096 or smaller.');
      const scale = Math.min(64 / bitmap.width, 64 / bitmap.height), w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
      ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, 64, 64); ctx.drawImage(bitmap, Math.floor((64 - w) / 2), Math.floor((64 - h) / 2), w, h);
      pixels = [...ctx.getImageData(0, 0, 64, 64).data].map(v => v.toString(16).padStart(2, '0')).join('');
      message('Looking good. Ready when you are.');
    } finally { bitmap.close(); }
  } catch (e) { if (selected === selection) message(e.message || 'This picture could not be read.'); } finally { refresh(); }
});
$('send').addEventListener('click', async () => {
  if (!pixels || !token || busy) return;
  busy = true; refresh(); $('file').disabled = true;
  delivery ||= { id: crypto.randomUUID(), pixels };
  try { await api('deliveries', delivery); tracker.sent(delivery.id); delivery = null; message('Queued! Delivery confirmation will appear below.'); checkDeliveries(); }
  catch (e) { message(e.message + ' You can retry safely.'); }
  finally { busy = false; $('file').disabled = false; refresh(); }
});
refresh();
if (token) tracker.history().then(checkDeliveries);
