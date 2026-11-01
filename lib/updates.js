'use strict';
const CHECK_INTERVAL = 4 * 60 * 60 * 1000;
function createUpdates({updater, packaged, beforeInstall = () => {}, changed = () => {}}) {
  let state = packaged ? 'idle' : 'development', version = '', percent = 0, disposed = false;
  const listeners = [];
  const busy = () => ['checking', 'downloading', 'installing'].includes(state);
  const set = value => { if (!disposed) { state = value; changed(); } };
  const on = (name, fn) => { updater.on(name, fn); listeners.push([name, fn]); };
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  on('checking-for-update', () => set('checking'));
  on('update-available', info => { version = info.version; percent = 0; set('downloading'); });
  on('download-progress', info => { percent = Math.max(0, Math.min(100, Math.floor(info.percent || 0))); set('downloading'); });
  on('update-not-available', () => set('current'));
  on('update-downloaded', info => { version = info.version; set('ready'); });
  on('error', () => set('error'));
  on('update-cancelled', () => set('error'));
  async function check() {
    if (disposed || !packaged || busy() || state === 'ready') return;
    set('checking');
    try { const result = await updater.checkForUpdates(); await result?.downloadPromise; } catch { set('error'); }
  }
  const startup = packaged ? setTimeout(check, 15000) : null;
  const timer = packaged ? setInterval(check, CHECK_INTERVAL) : null;
  startup?.unref?.(); timer?.unref?.();
  return {
    check,
    status() {
      const labels = {idle:'Updates checked automatically',development:'Updates available in installed Bobee',checking:'Checking for updates…',downloading:`Downloading ${version} — ${percent}%`,current:'Bobee is up to date',ready:`Update ${version} ready — restart Bobee`,error:'Could not update — try again',installing:'Restarting Bobee…'};
      return {label:labels[state],ready:state === 'ready',canCheck:packaged && !busy() && state !== 'ready'};
    },
    install() {
      if (disposed || !packaged || state !== 'ready') return;
      set('installing');
      try { beforeInstall(); updater.quitAndInstall(false, true); } catch { set('error'); }
    },
    dispose() { disposed = true; clearTimeout(startup); clearInterval(timer); for (const [name,fn] of listeners) updater.removeListener(name,fn); },
  };
}
module.exports = {createUpdates, CHECK_INTERVAL};
