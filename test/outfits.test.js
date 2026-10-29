import { it, expect } from 'vitest';
import { easterSunday, outfitFor } from '../renderer/outfits.js';
const d = (y,m,day) => new Date(y,m-1,day,12);
it.each([[2025,4,20],[2026,4,5],[2027,3,28],[2028,4,16],[2029,4,1],[2030,4,21]])('Easter %i', (y,m,day) => {
  expect(easterSunday(y)).toEqual(new Date(y,m-1,day));
});
it.each([
 [2026,12,10,'santa-hat','scarf',null,['christmas','winter']],
 [2026,12,31,'party-hat','scarf',null,['newyear','winter']],
 [2026,1,1,'party-hat','scarf',null,['newyear','winter']],
 [2026,1,2,null,'scarf',null,['winter']],
 [2028,2,29,null,'scarf',null,['winter']],
 [2028,3,1,null,null,null,[]],
 [2026,2,14,'heart-clip','scarf',null,['valentine','winter']],
 [2026,4,3,'bunny-ears',null,null,['easter','spring']],
 [2026,4,6,'bunny-ears',null,null,['easter','spring']],
 [2026,4,7,'flower-crown',null,null,['spring']],
 [2026,7,1,null,null,'sunglasses',['summer']],
 [2026,10,24,'pumpkin-hat',null,null,['halloween']],
 [2026,10,31,'pumpkin-hat',null,null,['halloween']],
 [2026,11,1,null,null,null,[]],
 [2026,3,19,null,null,null,[]],
 [2026,3,20,'flower-crown',null,null,['spring']],
 [2026,5,31,'flower-crown',null,null,['spring']],
 [2026,6,1,null,null,null,[]],
 [2026,6,20,null,null,null,[]],
 [2026,6,21,null,null,'sunglasses',['summer']],
 [2026,8,31,null,null,'sunglasses',['summer']],
 [2026,9,1,null,null,null,[]],
 [2026,12,26,'santa-hat','scarf',null,['christmas','winter']],
 [2026,12,27,null,'scarf',null,['winter']],
])('calendar %i-%i-%i',(y,m,day,hat,neck,face,messages)=>{
  expect(outfitFor(d(y,m,day))).toEqual({hat,neck,face,messages});
});

it('draws scaled anchored props, hides summer face pieces asleep, and clears outfits', async()=>{
  const {createOutfitLayer}=await import('../renderer/outfits.js');
  const calls=[]; const images={cap:{width:96,height:96},scarf:{width:96,height:96}};
  const layer=createOutfitLayer({anchors:{idle:[[48,15]],sleep:[[48,15]],yawn:[[48,15]]},props:{cap:{slot:'face',pivot:[48,15]},scarf:{slot:'neck',pivot:[48,-13]}},images});
  const ctx={drawImage:(...a)=>calls.push(a),fillRect:()=>{}};
  layer.set({face:'cap',neck:'scarf'}); layer.draw(ctx,{animation:'idle',frame:0,dx:2,dy:3,scale:2});
  expect(calls).toEqual([[images.scarf,2,59,192,192],[images.cap,2,3,192,192]]);
  calls.length=0; layer.draw(ctx,{animation:'sleep',frame:0,dx:0,dy:0,scale:1}); expect(calls).toHaveLength(1);
  calls.length=0; layer.set(null); layer.draw(ctx,{animation:'idle',frame:0,dx:0,dy:0,scale:1}); expect(calls).toHaveLength(0);
  layer.set({face:'cap'}); layer.draw(ctx,{animation:'missing',frame:0,dx:0,dy:0,scale:1}); expect(calls).toHaveLength(0);
});
it('draws two cheek marks only on idle when blush is enabled',async()=>{
  const {createOutfitLayer}=await import('../renderer/outfits.js'); const marks=[];
  const layer=createOutfitLayer({anchors:{idle:[[48,15]],walk:[[48,15]]},props:{},images:{}});
  const ctx={fillRect:(...a)=>marks.push(a)}; layer.blush(true);
  layer.draw(ctx,{animation:'walk',frame:0,dx:0,dy:0,scale:1}); expect(marks).toHaveLength(0);
  layer.draw(ctx,{animation:'idle',frame:0,dx:0,dy:0,scale:1}); expect(marks).toHaveLength(2);
  layer.blush(false); layer.draw(ctx,{animation:'idle',frame:0,dx:0,dy:0,scale:1}); expect(marks).toHaveLength(2);
});
