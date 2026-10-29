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
