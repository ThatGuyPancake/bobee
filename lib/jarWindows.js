'use strict';
const path=require('node:path');
const {dayKey}=require('./store');
const {JAR_SIZE,TREAT_SIZE,JAR_TTL_MS,planJarTimes,pickTreats,jarX,hitBobee,createJarSession}=require('./jar');
// Electron operations stay here; injected boundaries let lifecycle tests use real timers/state rules.
function createJarWindows({BrowserWindow,screen,base,getArea,getBobee,getState,patchState,send,active,now=()=>new Date(),random=Math.random,log=message=>console.warn('[bobee] jar unavailable:',message)}) {
 let jar=null,treat=null,session=null,drag=null,returning=null,fade=null,expiry=null,started=0,day=null,plan=[],next=0,closing=false;
 const alive=w=>w&&!w.isDestroyed();
 const emit=event=>send('jar',{event});
 function stopTimer(name){if(name)clearInterval(name);}
 function closeTreat(){stopTimer(drag);stopTimer(returning);drag=returning=null;const w=treat;treat=null;if(alive(w))w.close();}
 function close(notify=true){
  if(closing)return;closing=true;const had=!!jar;
  session?.cancel();session=null;closeTreat();stopTimer(fade);fade=null;clearTimeout(expiry);expiry=null;
  const w=jar;jar=null;if(alive(w))w.close();if(had&&notify)emit('gone');closing=false;
 }
 function unavailable(error){log(error?.message||String(error));}
 function make(size,x,y,state,onFailure){
  const w=new BrowserWindow({width:size,height:size,x:Math.round(x),y:Math.round(y),transparent:true,frame:false,alwaysOnTop:true,skipTaskbar:true,resizable:false,focusable:false,hasShadow:false,show:false,webPreferences:{preload:path.join(base,'preload-jar.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  try {
   w.setAlwaysOnTop(true,'screen-saver');w.setIgnoreMouseEvents(true,{forward:true});
   w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());
   w.once('ready-to-show',()=>{if(alive(w)){w.webContents.send('jar-state',state);w.showInactive();}});
   w.webContents.on('render-process-gone',()=>onFailure(new Error('renderer stopped')));
   w.loadURL('bobee://app/renderer/jar.html').catch(error=>{if(alive(w))onFailure(error);});
   return w;
  }catch(error){if(alive(w))w.close();throw error;}
 }
 function jarState(open=false){if(alive(jar))jar.webContents.send('jar-state',{view:'jar',open});}
 function fadeOut(empty=false){
  if(!alive(jar)||fade)return;
  if(empty)emit('empty');const w=jar;let step=0;
  fade=setInterval(()=>{if(!alive(w)){close(false);return;}w.setOpacity(Math.max(0,1-(++step)/10));if(step>=10)close(!empty);},100);
 }
 function expire(){expiry=null;if(!session?.active()&&!returning)fadeOut();}
 function armExpiry(){clearTimeout(expiry);expiry=setTimeout(expire,Math.max(0,JAR_TTL_MS-(Date.now()-started)));}
 function show(){
  if(jar||!active())return false;
  const area=getArea(),bobee=getBobee();if(!bobee)return false;
  const x=jarX(area,bobee,random);if(x===null)return false;
  // Count failed showings too, so repeated failures cannot create a busy retry loop.
  patchState({jarsShown:getState().jarsShown+1});
  session=createJarSession(pickTreats(random));started=Date.now();
  try {
   jar=make(JAR_SIZE,x,area.y+area.height+4-JAR_SIZE,{view:'jar'},error=>{unavailable(error);close();});
   jar.on('closed',()=>{if(!closing)close();});
   armExpiry();emit('appear');return true;
  }catch(error){unavailable(error);close(false);return false;}
 }
 function trusted(sender){return alive(jar)&&sender===jar.webContents;}
 function grab(sender){
  if(!trusted(sender)||!active()||fade||returning)return;
  const name=session?.grab();if(!name)return;
  const cursor=screen.getCursorScreenPoint();
  try {
   treat=make(TREAT_SIZE,cursor.x-TREAT_SIZE/2,cursor.y-TREAT_SIZE/2,{view:'treat',treat:name},error=>{unavailable(error);session?.cancel();closeTreat();jarState();armExpiry();});
   treat.on('closed',()=>{if(treat){session?.cancel();closeTreat();jarState();armExpiry();}});
   jarState(true);const heldAt=Date.now();
   drag=setInterval(()=>{
    if(!active()){close();return;}
    // Bounded recovery even if the native hook or renderer loses a release.
    if(Date.now()-heldAt>30000){release(null,true);return;}
    if(alive(treat)){const p=screen.getCursorScreenPoint();treat.setPosition(Math.round(p.x-TREAT_SIZE/2),Math.round(p.y-TREAT_SIZE/2));}
   },16);
  }catch(error){unavailable(error);session.cancel();closeTreat();jarState();armExpiry();}
 }
 function release(sender,cancel=false){
  // null is reserved for main's global mouse-up / cancellation fallback.
  if(sender!==null&&!trusted(sender))return;
  if(!session?.active())return;
  stopTimer(drag);drag=null;
  const p=screen.getCursorScreenPoint(),b=getBobee();
  const result=session.release(!cancel&&active()&&!!b&&hitBobee(p,b));jarState();
  if(result.result==='eaten'){
   closeTreat();send('treat-eaten',{treat:result.treat});
   if(!result.left)fadeOut(true);else armExpiry();
  }else if(alive(treat)&&alive(jar)){
   const w=treat,from=w.getBounds(),to=jar.getBounds();let step=0;
   returning=setInterval(()=>{
    if(!alive(w)||!alive(jar)){closeTreat();return;}
    const t=++step/10;w.setPosition(Math.round(from.x+(to.x+8-from.x)*t),Math.round(from.y+(to.y+8-from.y)*t));
    if(step>=10){closeTreat();armExpiry();}
   },30);
  }else{closeTreat();armExpiry();}
 }
 function check(){
  const date=now(),today=dayKey(date);
  if(today!==day){close();day=today;plan=planJarTimes(date,random);next=getState().jarsShown;}
  if(!active()){close();return;}
  if(jar||date.getHours()<9||date.getHours()>=21)return;
  next=Math.max(next,getState().jarsShown);
  if(next<plan.length&&date>=plan[next]){next++;show();}
 }
 return {show,check,close,grab,release,cancelDrag:()=>release(null,true),clickThrough(sender,on){if(trusted(sender)&&!session?.active())jar.setIgnoreMouseEvents(!!on,{forward:true});},assetFailed(sender){if(alive(treat)&&sender===treat.webContents){unavailable(new Error('missing treat image'));session?.cancel();closeTreat();jarState();armExpiry();}else if(trusted(sender)){unavailable(new Error('missing jar image'));close();}}};
}
module.exports={createJarWindows};
