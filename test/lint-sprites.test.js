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
    for (const n of ['bobee-master.png', 'idle.png', 'walk.png', 'sleep.png', 'drag.png', 'happy.png']) {
      expect(names).toContain(n);
    }
  });
  for (const file of files) {
    it(`${path.basename(file)} is clean`, () => {
      expect(lintFile(file)).toEqual([]);
    });
  }
});
