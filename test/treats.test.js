import {it,expect} from 'vitest';
import {createTreatReaction} from '../renderer/treats.js';
it('queues munch then happy and full without interrupting the last mouthful',()=>{
 const calls=[];const r=createTreatReaction({munchMs:750,happyMs:1000,moment:(...a)=>calls.push(a),say:g=>calls.push(g),wake:()=>calls.push('wake'),addMood:()=>calls.push('mood')});
 r.eat(100);r.empty();expect(calls).toEqual(['mood','wake',['munch',750]]);r.tick(849);expect(calls).toHaveLength(3);r.tick(850);expect(calls.slice(-2)).toEqual([['happy',1000],'yum']);r.tick(1850);expect(calls.at(-1)).toBe('full');
});
it('serializes rapid treats and discards delayed reactions on pause',()=>{
 const calls=[];const r=createTreatReaction({munchMs:100,happyMs:100,moment:n=>calls.push(n),say:g=>calls.push(g),wake:()=>{},addMood:()=>{}});
 r.eat(0);r.eat(10);r.tick(100);r.tick(200);expect(calls).toEqual(['munch','happy','yum','munch']);r.cancel();r.tick(10000);expect(calls).toHaveLength(4);
});

