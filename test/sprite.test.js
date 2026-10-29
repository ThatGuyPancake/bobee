import { describe, it, expect } from 'vitest';
import { FRAME, stripInfo, frameIndex } from '../renderer/sprite.js';

describe('stripInfo', () => {
  it('splits a strip into square frames', () => {
    expect(FRAME).toBe(64);
    expect(stripInfo(256)).toEqual({ count: 4, frameWidth: 64, frameHeight: 64 });
    expect(stripInfo(64)).toEqual({ count: 1, frameWidth: 64, frameHeight: 64 });
  });
  it('uses the strip height as the frame size', () => {
    expect(stripInfo(384, 96)).toEqual({ count: 4, frameWidth: 96, frameHeight: 96 });
    expect(stripInfo(96, 96)).toEqual({ count: 1, frameWidth: 96, frameHeight: 96 });
  });
  it('treats non-multiples as a single frame', () => {
    expect(stripInfo(100)).toEqual({ count: 1, frameWidth: 100, frameHeight: 64 });
  });
  it('handles zero width or height', () => {
    expect(stripInfo(0)).toEqual({ count: 1, frameWidth: 64, frameHeight: 64 });
    expect(stripInfo(128, 0)).toEqual({ count: 2, frameWidth: 64, frameHeight: 64 });
  });
});

describe('frameIndex', () => {
  it('advances and wraps', () => {
    expect(frameIndex(0, 8, 4)).toBe(0);
    expect(frameIndex(125, 8, 4)).toBe(1);
    expect(frameIndex(500, 8, 4)).toBe(0);
    expect(frameIndex(999, 8, 1)).toBe(0);
  });
});

describe('animations', () => {
  it('registers every strip with a frame rate', async () => {
    const { NAMES, DEFAULT_FPS } = await import('../renderer/sprite.js');
    for (const n of ['idle', 'walk', 'sleep', 'drag', 'happy', 'wave', 'sip', 'yawn', 'pet', 'sleep-pet', 'sleep-peek', 'munch']) {
      expect(NAMES).toContain(n);
      expect(DEFAULT_FPS[n]).toBeGreaterThan(0);
    }
    expect(DEFAULT_FPS.walk).toBeGreaterThanOrEqual(8);
    expect(DEFAULT_FPS.happy).toBeGreaterThanOrEqual(8);
  });
});


it('draws overlays after the sprite inside the mirrored transform, then disables them', async () => {
  const {SpritePlayer}=await import('../renderer/sprite.js');
  const calls=[]; const ctx=Object.fromEntries(['clearRect','save','restore','translate','scale','drawImage'].map(k=>[k,(...a)=>calls.push([k,...a])]));
  const player=new SpritePlayer({getContext:()=>ctx});
  player.strips.idle={img:{},count:8,frameWidth:96,frameHeight:96,fps:4};
  player.setFacing('left'); player.setOverlay((c,info)=>calls.push(['overlay',info]));
  player.draw(100); calls.length=0; player.draw(600);
  expect(calls.map(c=>c[0])).toEqual(['clearRect','save','translate','scale','drawImage','overlay','restore']);
  expect(calls.find(c=>c[0]==='overlay')[1]).toEqual({animation:'idle',frame:frameIndex(500,4,8),dx:0,dy:0,scale:1});
  player.setOverlay(null); calls.length=0; player.draw(700); expect(calls.some(c=>c[0]==='overlay')).toBe(false);
});
it('does not dress placeholder or override art with unrelated head anchors', async () => {
  const {SpritePlayer}=await import('../renderer/sprite.js');
  let count=0; const ctx=Object.fromEntries(['clearRect','save','restore','translate','scale','drawImage'].map(k=>[k,()=>{}]));
  const player=new SpritePlayer({getContext:()=>ctx}); player.setOverlay(()=>count++);
  player.strips.idle={img:{},count:8,frameWidth:64,frameHeight:64,fps:4}; player.draw(0);
  player.playOverride({width:96,height:96},{durationMs:1000}); player.draw(10);
  expect(count).toBe(0);
});
