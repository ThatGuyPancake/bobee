import {it,expect,vi} from 'vitest';
import {createRequire} from 'node:module';
const {restoreCompanion}=createRequire(import.meta.url)('../lib/resume');
it('restores the desktop window and refreshes bounds before resetting the renderer',()=>{
 const calls=[];const win={isDestroyed:()=>false,isMinimized:()=>true,restore:()=>calls.push('restore'),setAlwaysOnTop:()=>calls.push('top'),showInactive:()=>calls.push('show'),webContents:{invalidate:()=>calls.push('paint')}};
 restoreCompanion({win,paused:false,place:()=>calls.push('place'),bounds:()=>calls.push('bounds'),send:()=>calls.push('reset')});
 expect(calls).toEqual(['restore','place','top','show','paint','bounds','reset']);
});
it('does not show a paused companion or touch a destroyed window',()=>{
 const showInactive=vi.fn();const win={isDestroyed:()=>false,isMinimized:()=>false,setAlwaysOnTop(){},showInactive,webContents:{invalidate(){}}};
 restoreCompanion({win,paused:true,place(){},bounds(){},send(){}});expect(showInactive).not.toHaveBeenCalled();
 expect(()=>restoreCompanion({win:{isDestroyed:()=>true}})).not.toThrow();
});
it('reloads after resume only when the renderer has not reported back',()=>{
 const {restartIfUnresponsive}=createRequire(import.meta.url)('../lib/resume');
 const reload=vi.fn();const win={isDestroyed:()=>false,webContents:{reload}};
 restartIfUnresponsive(win,100,200,false);expect(reload).toHaveBeenCalledTimes(1);
 restartIfUnresponsive(win,201,200,false);restartIfUnresponsive(win,0,200,true);expect(reload).toHaveBeenCalledTimes(1);
});
