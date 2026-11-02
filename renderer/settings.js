const status = document.getElementById('status'), code = document.getElementById('code');
async function refresh() {
  const s = await window.settings.status();
  document.getElementById('url').value = s.url || '';
  status.textContent = s.connected ? 'Connected to ' + s.url + (s.error ? '\n' + s.error : '') : 'Not connected';
  code.textContent = s.code ? 'Pairing code (expires in 10 minutes): ' + s.code : '';
  document.getElementById('revoke').disabled = !s.connected;
}
document.getElementById('pair').addEventListener('submit', async e => {
  e.preventDefault(); const button = e.submitter; button.disabled = true;
  try { const r = await window.settings.pair(document.getElementById('url').value, document.getElementById('key').value); if (r.error) throw Error(r.error); document.getElementById('key').value = ''; await refresh(); }
  catch (error) { status.textContent = error.message; } finally { button.disabled = false; }
});
document.getElementById('revoke').addEventListener('click', async () => {
  const r = await window.settings.revoke(); if (r.error) status.textContent = r.error; else await refresh();
});
refresh().catch(e => { status.textContent = e.message; });
