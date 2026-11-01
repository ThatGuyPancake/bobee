'use strict';
// Windows can restore the desktop on unlock after the power resume event.
function restoreCompanion({win,paused,place,bounds,send}) {
 if(!win || win.isDestroyed())return;
 if(win.isMinimized())win.restore();
 place();
 win.setAlwaysOnTop(true,'screen-saver');
 if(!paused)win.showInactive();
 win.webContents.invalidate();
 bounds();
 send('system-resume');
}
function restartIfUnresponsive(win,lastSeen,resumedAt,paused) {
 if(win && !win.isDestroyed() && !paused && lastSeen < resumedAt) win.webContents.reload();
}
module.exports={restoreCompanion,restartIfUnresponsive};
