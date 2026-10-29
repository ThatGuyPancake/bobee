// Frame-clock driven so pause/resume cannot leave a delayed animation behind.
export function createTreatReaction({munchMs,happyMs,moment,say,wake,addMood}) {
 let phase=null,until=0,queued=0,full=false;
 function start(t){wake();moment('munch',munchMs);phase='munch';until=t+munchMs;}
 return {
  eat(t){addMood();if(phase)queued++;else start(t);},
  empty(){full=true;},
  tick(t){if(!phase||t<until)return;if(phase==='munch'){moment('happy',happyMs);say('yum');phase='happy';until=t+happyMs;}else{phase=null;if(queued){queued--;start(t);}else if(full){full=false;say('full');}}},
  cancel(){phase=null;queued=0;full=false;},
  active:()=>phase!==null,
 };
}
