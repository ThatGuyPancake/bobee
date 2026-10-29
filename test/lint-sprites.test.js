import { describe, it, expect } from 'vitest';
import path from 'path';
import { lintImage, lintFile, defaultFiles } from '../scripts/lint-sprites.js';

// A blank strip of `frames` 96x96 frames, plus a helper to fill rectangles.
function strip(frames = 1) {
  const width = 96 * frames, height = 96;
  const data = Buffer.alloc(width * height * 4);
  const img = { width, height, data };
  img.fill = (x0, y0, x1, y1, a = 255) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[(y * width + x) * 4 + 3] = a;
    return img;
  };
  return img;
}

describe('lintImage', () => {
  it('passes a clean blob standing on the bottom row', () => {
    expect(lintImage(strip().fill(20, 10, 70, 95), { master: true })).toEqual([]);
  });
  it('flags partly transparent pixels with frame and position', () => {
    const p = lintImage(strip(2).fill(20, 10, 70, 95).fill(116, 10, 166, 95).fill(130, 40, 130, 40, 128));
    expect(p).toEqual(['frame 1 pixel (34,40) is partly transparent (alpha 128)']);
  });
  it('flags isolated pixels', () => {
    const p = lintImage(strip().fill(20, 10, 70, 95).fill(80, 50, 80, 50).fill(85, 50, 86, 50));
    expect(p).toContain('frame 0 pixel (80,50) is an isolated pixel (0 opaque neighbours)');
    expect(p).toContain('frame 0 pixel (85,50) is an isolated pixel (1 opaque neighbour)');
    expect(p).toContain('frame 0 pixel (86,50) is an isolated pixel (1 opaque neighbour)');
  });
  it('flags pixels touching the side or top edge but not the ground', () => {
    const p = lintImage(strip().fill(0, 10, 40, 95));
    expect(p.some((m) => m.includes('pixel (0,10) touches the frame edge'))).toBe(true);
    expect(p.some((m) => m.includes('(20,95) touches'))).toBe(false);
    expect(lintImage(strip().fill(20, 0, 40, 95)).some((m) => m.includes('(20,0) touches'))).toBe(true);
  });
  it('flags widths that are not a multiple of 96', () => {
    expect(lintImage({ width: 100, height: 96, data: Buffer.alloc(100 * 96 * 4) })).toEqual([
      'width 100 is not a multiple of 96',
    ]);
  });
  it('flags frames whose feet sit on different rows', () => {
    const p = lintImage(strip(2).fill(20, 10, 70, 95).fill(116, 10, 166, 93));
    expect(p).toEqual(['feet are not on the same ground row: frame 0: row 95, frame 1: row 93']);
  });
  it('requires masters to stand on the bottom row with a free top margin', () => {
    const p = lintImage(strip().fill(20, 2, 70, 90), { master: true });
    expect(p).toContain('frame 0 feet are on row 90, expected the bottom row 95');
    expect(p).toContain('frame 0 starts on row 2, keep the top 4 rows free');
  });
  it('lets hop strips leave the ground', () => {
    expect(lintImage(strip(2).fill(20, 10, 70, 95).fill(116, 10, 166, 90), { hops: true })).toEqual([]);
  });
});

describe('Bobee sprites', () => {
  const files = defaultFiles(path.join(__dirname, '..'));
  it('include the master and every animation strip', () => {
    const names = files.map((f) => path.basename(f));
    for (const n of ['bobee-master.png', 'idle.png', 'walk.png', 'sleep.png', 'drag.png', 'happy.png', 'wave.png', 'sip.png', 'yawn.png']) {
      expect(names).toContain(n);
    }
  });
  for (const file of files) {
    it(`${path.basename(file)} is clean`, () => {
      expect(lintFile(file)).toEqual([]);
    });
  }
});

// Prop discovery and generated anchors are part of the shipped art contract.
it('discovers all eight outfit props for lint', () => {
  const names = ['santa-hat', 'party-hat', 'heart-clip', 'bunny-ears', 'flower-crown', 'pumpkin-hat', 'scarf', 'sunglasses'];
  const files = defaultFiles();
  for (const name of names) expect(files.some(f => f.endsWith(path.join('props', name + '.png')))).toBe(true);
});
it('has an in-frame head anchor for every generated sprite frame', async () => {
  const fs = await import('node:fs');
  const { PNG } = await import('pngjs');
  const { NAMES } = await import('../renderer/sprite.js');
  const anchors = JSON.parse(fs.readFileSync(new URL('../assets/bobee/anchors.json', import.meta.url)));
  for (const name of NAMES) {
    const png = PNG.sync.read(fs.readFileSync(new URL('../assets/bobee/' + name + '.png', import.meta.url)));
    expect(anchors[name]).toHaveLength(png.width / 96);
    for (const point of anchors[name]) {
      expect(point).toHaveLength(2);
      for (const v of point) { expect(Number.isInteger(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThan(96); }
    }
  }
  expect(anchors.pet[1][0] - anchors.pet[0][0]).toBe(1);
  expect(anchors['sleep-pet'][3][0] - anchors['sleep-pet'][0][0]).toBe(-1);
});
it('keeps every outfit prop inside every anchored animation frame', async () => {
  const fs = await import('node:fs'); const { PNG } = await import('pngjs');
  const anchors = JSON.parse(fs.readFileSync('assets/bobee/anchors.json'));
  const props = JSON.parse(fs.readFileSync('assets/props/props.json'));
  for(const [name, {pivot}] of Object.entries(props)) {
    const p = PNG.sync.read(fs.readFileSync('assets/props/'+name+'.png'));
    for(const points of Object.values(anchors)) for(const [ax,ay] of points) {
      for(let y=0;y<96;y++) for(let x=0;x<96;x++) if(p.data[(y*96+x)*4+3]) {
        expect(x+ax-pivot[0],name).toBeGreaterThanOrEqual(0); expect(x+ax-pivot[0],name).toBeLessThan(96);
        expect(y+ay-pivot[1],name).toBeGreaterThanOrEqual(0); expect(y+ay-pivot[1],name).toBeLessThan(96);
      }
    }
  }
});
it('Halloween mask covers the muzzle and summer sunglasses include a hat', async () => {
  const fs=await import('node:fs'); const {PNG}=await import('pngjs');
  const props=JSON.parse(fs.readFileSync('assets/props/props.json'));
  const alphaAt=(name,x,y)=>{const p=PNG.sync.read(fs.readFileSync('assets/props/'+name+'.png')); const [px,py]=props[name].pivot; return p.data[((y-15+py)*96+x-48+px)*4+3];};
  expect(alphaAt('pumpkin-hat',48,50)).toBe(255);
  expect(alphaAt('pumpkin-hat',30,40)).toBe(255);
  expect(alphaAt('sunglasses',48,20)).toBe(255);
});
