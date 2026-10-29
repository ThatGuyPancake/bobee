'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('jar',{
 grab:()=>ipcRenderer.send('jar-grab'),release:cancel=>ipcRenderer.send('jar-release',!!cancel),
 setClickThrough:on=>ipcRenderer.send('jar-click-through',!!on),assetFailed:()=>ipcRenderer.send('jar-asset-failed'),
 onState:cb=>{if(typeof cb!=='function')return;const handler=(_e,state)=>cb(state);ipcRenderer.on('jar-state',handler);return()=>ipcRenderer.removeListener('jar-state',handler);},
});
