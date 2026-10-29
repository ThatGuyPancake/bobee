import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { planJarTimes, jarX, hitBobee, pickTreats, createJarSession } = require('../lib/jar');
const seeded = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
it('plans two or three local daytime showings at least an hour apart', () => {
  const counts = new Set();
  for(let seed=1;seed<=100000;seed+=997) {
    const times=planJarTimes(new Date(2026,9,25),seeded(seed)); counts.add(times.length);
    expect([2,3]).toContain(times.length);
    times.forEach((d,i)=>{expect(d.getHours()).toBeGreaterThanOrEqual(9);expect(d.getHours()).toBeLessThan(21);if(i) expect(d-times[i-1]).toBeGreaterThanOrEqual(3600000);});
  }
  expect([...counts].sort()).toEqual([2,3]);
});
it('also terminates with constant random sources',()=>{for(const r of [0,.5,.999]) expect(planJarTimes(new Date(),()=>r).length).toBeGreaterThanOrEqual(2);});
it('places jars away from Bobee and the right home zone, including negative monitors',()=>{
 for(const x of [0,-1920]) { const r=jarX({x,width:1920},{x:x+1720,width:200},()=>.5);expect(r).not.toBeNull();expect(r).toBeGreaterThanOrEqual(x);expect(r+48).toBeLessThanOrEqual(x+1620);expect(Math.abs(r+24-(x+1820))).toBeGreaterThanOrEqual(300); }
 expect(jarX({x:0,width:500},{x:300,width:200},()=>.5)).toBeNull();
});
it('uses inset body bounds for drops',()=>{
 const b={x:1720,y:900,width:200,height:200};expect(hitBobee({x:1820,y:1000},b)).toBe(true);expect(hitBobee({x:1725,y:1000},b)).toBe(false);expect(hitBobee({x:2000,y:1000},b)).toBe(false);
});
it('picks exactly three valid treats',()=>{expect(pickTreats(()=>0)).toEqual(['cookie','cookie','cookie']);expect(pickTreats(()=>.999)).toEqual(['berries','berries','berries']);});
it('consumes only hits; misses and cancellation return the held treat',()=>{
 const s=createJarSession(['cookie','honey','berries']); expect(s.grab()).toBe('cookie');expect(s.grab()).toBeNull();
 expect(s.release(true)).toEqual({result:'eaten',treat:'cookie',left:2});expect(s.grab()).toBe('honey');
 expect(s.release(false)).toEqual({result:'returned',treat:'honey',left:2});s.grab();s.cancel();s.cancel();expect(s.active()).toBe(false);expect(s.left()).toBe(2);
 expect(s.release(true)).toBeNull();s.grab();s.release(true);s.grab();s.release(true);expect(s.grab()).toBeNull();
});

