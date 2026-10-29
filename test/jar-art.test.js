import {it,expect} from 'vitest';
import fs from 'node:fs';
import {PNG} from 'pngjs';
import {lintFile} from '../scripts/lint-sprites.js';
it('ships clean correctly sized jar and treat art',()=>{
 for(const [name,size] of [['jar',48],['jar-open',48],['cookie',32],['honey',32],['berries',32]]) {
 const file='assets/props/'+name+'.png';const png=PNG.sync.read(fs.readFileSync(file));expect(png.width).toBe(size);expect(png.height).toBe(size);expect(lintFile(file)).toEqual([]);
 }
});
