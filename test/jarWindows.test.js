import {it,expect,vi,afterEach} from 'vitest';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createJarWindows}=require('../lib/jarWindows');
const made=[];
class Window {
 constructor(opts){this.bounds=opts;this.handlers={};this.sent=[];this.webContents={send:(...v)=>this.sent.push(v),setWindowOpenHandler(){},on:(n,f)=>{this.handlers[n]=f;}};made.push(this);}
 setAlwaysOnTop(){} setIgnoreMouseEvents(on){this.through=on;} once(n,f){this.handlers[n]=f;} on(n,f){this.handlers[n]=f;} loadURL(){this.handlers['ready-to-show']?.();return Promise.resolve();} showInactive(){} getBounds(){return this.bounds;}setPosition(x,y){this.bounds={...this.bounds,x,y};} setOpacity(v){this.opacity=v;}isDestroyed(){return !!this.dead;}close(){this.dead=true;this.handlers.closed?.();}
}
afterEach(()=>{vi.useRealTimers();made.length=0;});
function setup(extra={}) {
 vi.useFakeTimers();let cursor={x:300,y:800},state={day:'2026-10-29',jarsShown:0},events=[];
 const control=createJarWindows({BrowserWindow:Window,screen:{getCursorScreenPoint:()=>cursor},base:process.cwd(),getArea:()=>({x:0,y:0,width:1920,height:1080}),getBobee:()=>({x:1720,y:880,width:200,height:200}),getState:()=>state,patchState:p=>Object.assign(state,p),send:(...a)=>events.push(a),active:()=>true,now:()=>new Date(2026,9,29,20),random:()=>.1,...extra});
 return {control,events,state,cursor:p=>cursor=p};
}
it('feeds a hit once, returns a miss, and ignores duplicate release',async()=>{
 const s=setup();expect(s.control.show()).toBe(true);const jar=made[0];s.control.grab(jar.webContents);expect(made).toHaveLength(2);s.cursor({x:1820,y:1000});s.control.release(jar.webContents);s.control.release(jar.webContents);expect(s.events.filter(([n])=>n==='treat-eaten')).toHaveLength(1);
 s.control.grab(jar.webContents);s.cursor({x:500,y:500});s.control.release(jar.webContents);vi.advanceTimersByTime(350);expect(made.at(-1).dead).toBe(true);s.control.grab(jar.webContents);expect(made).toHaveLength(4);s.control.close();expect(made.every(w=>w.dead)).toBe(true);
});
it('cancels capture loss without consuming and recovers for another drag',()=>{
 const s=setup();s.control.show();const jar=made[0];s.control.grab(jar.webContents);s.cursor({x:1820,y:1000});s.control.release(jar.webContents,true);vi.advanceTimersByTime(350);expect(s.events.some(([n])=>n==='treat-eaten')).toBe(false);s.control.grab(jar.webContents);expect(made).toHaveLength(3);s.control.close();
});
it('closes all windows and timers immediately on pause/display/exit cancellation',()=>{
 const s=setup();s.control.show();s.control.grab(made[0].webContents);s.control.close();vi.advanceTimersByTime(400000);expect(made.every(w=>w.dead)).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it('expires unattended jars but never interrupts a held treat',()=>{
 const s=setup();s.control.show();s.control.grab(made[0].webContents);vi.advanceTimersByTime(300001);expect(made[0].dead).not.toBe(true);s.control.release(made[0].webContents,true);vi.advanceTimersByTime(1400);expect(made[0].dead).toBe(true);s.control.close();
});
it('skips failed windows and recovers a treat creation failure',()=>{
 let fail=false;class Failing extends Window{constructor(o){if(fail)throw Error('window failure');super(o);}}
 const s=setup({BrowserWindow:Failing,log:()=>{}});s.control.show();fail=true;s.control.grab(made[0].webContents);fail=false;s.control.grab(made[0].webContents);expect(made).toHaveLength(2);s.control.close();
});
it('enforces saved daily limits and handles rollover',()=>{
 let date=new Date(2026,9,29,20);const s=setup({now:()=>date});s.control.check();expect(s.state.jarsShown).toBe(1);s.control.close();s.control.check();expect(s.state.jarsShown).toBe(2);s.control.close();s.control.check();expect(s.state.jarsShown).toBe(3);s.control.close();s.control.check();expect(made).toHaveLength(3);
 date=new Date(2026,9,30,20);s.state.jarsShown=0;s.state.day='2026-10-30';s.control.check();expect(made).toHaveLength(4);s.control.close();
});
it('rejects untrusted messages and never shows while inactive',()=>{
 const s=setup({active:()=>false});expect(s.control.show()).toBe(false);s.control.grab({});expect(made).toHaveLength(0);s.control.close();
});
it('recovers missing treat art and accepts a new grab without consuming',()=>{
 const s=setup();s.control.show();const jar=made[0];s.control.grab(jar.webContents);s.control.assetFailed(made[1].webContents);expect(made[1].dead).toBe(true);s.control.grab(jar.webContents);expect(made).toHaveLength(3);expect(s.events.some(([n])=>n==='treat-eaten')).toBe(false);s.control.close();
});
it('bounds recovery after a missing release and does not keep timers after cancellation',()=>{
 const s=setup();s.control.show();s.control.grab(made[0].webContents);vi.advanceTimersByTime(30400);expect(made[1].dead).toBe(true);s.control.grab(made[0].webContents);expect(made).toHaveLength(3);s.control.close();expect(vi.getTimerCount()).toBe(0);
});
it('fades after the third hit and emits empty only once',()=>{
 const s=setup();s.control.show();const jar=made[0];s.cursor({x:1820,y:1000});for(let i=0;i<3;i++){s.control.grab(jar.webContents);s.control.release(jar.webContents);}
 expect(s.events.filter(([n,p])=>n==='jar'&&p.event==='empty')).toHaveLength(1);vi.advanceTimersByTime(1000);expect(jar.dead).toBe(true);s.control.close();
});
