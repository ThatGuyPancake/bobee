'use strict';
const JAR_SIZE=48, TREAT_SIZE=32, JAR_TTL_MS=300000, HIT_INSET=12, MIN_GAP=300;
const TREATS=Object.freeze(['cookie','honey','berries']);
const unit=random=>Math.max(0,Math.min(.999999999,random()));
function planJarTimes(day,random=Math.random) {
  const count=unit(random)<.5?3:2;
  // Ordered samples in a compressed interval, then insert the mandatory gaps.
  const span=(12-(count-1))*3600000;
  return Array.from({length:count},()=>unit(random)*span).sort((a,b)=>a-b).map((offset,i)=>{
    const d=new Date(day);d.setHours(9,0,0,0);return new Date(d.getTime()+offset+i*3600000);
  });
}
function pickTreats(random=Math.random) {return Array.from({length:3},()=>TREATS[Math.floor(unit(random)*TREATS.length)]);}
function jarX(wa,bobee,random=Math.random) {
  if(wa.width<2*MIN_GAP+JAR_SIZE)return null;
  const lo=wa.x,hi=wa.x+wa.width-300-JAR_SIZE,center=bobee.x+bobee.width/2;
  const intervals=[[lo,Math.min(hi,center-MIN_GAP-JAR_SIZE/2)],[Math.max(lo,center+MIN_GAP-JAR_SIZE/2),hi]].filter(([a,b])=>b>=a);
  const total=intervals.reduce((n,[a,b])=>n+b-a+1,0);if(!total)return null;
  let p=Math.floor(unit(random)*total);for(const [a,b] of intervals){if(p<=b-a)return Math.round(a+p);p-=b-a+1;}return null;
}
function hitBobee(p,b) {return p.x>=b.x+HIT_INSET&&p.x<b.x+b.width-HIT_INSET&&p.y>=b.y+HIT_INSET&&p.y<b.y+b.height-HIT_INSET;}
function createJarSession(treats) {
  const queue=[...treats];let held=null;
  return {grab(){if(held||!queue.length)return null;held=queue.shift();return held;},release(hit){if(!held)return null;const treat=held;held=null;if(!hit)queue.unshift(treat);return {result:hit?'eaten':'returned',treat,left:queue.length};},cancel(){if(held){queue.unshift(held);held=null;}},left:()=>queue.length+(held?1:0),active:()=>held!==null};
}
module.exports={JAR_SIZE,TREAT_SIZE,TREATS,JAR_TTL_MS,HIT_INSET,MIN_GAP,planJarTimes,pickTreats,jarX,hitBobee,createJarSession};

