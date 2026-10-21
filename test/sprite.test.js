import { describe, it, expect } from 'vitest';
import { FRAME, stripInfo, frameIndex } from '../renderer/sprite.js';

describe('stripInfo', () => {
  it('splits a strip into square frames', () => {
    expect(FRAME).toBe(64);
    expect(stripInfo(256)).toEqual({ count: 4, frameWidth: 64 });
    expect(stripInfo(64)).toEqual({ count: 1, frameWidth: 64 });
  });
  it('treats non-multiples as a single frame', () => {
    expect(stripInfo(100)).toEqual({ count: 1, frameWidth: 100 });
  });
  it('handles zero width', () => {
    expect(stripInfo(0)).toEqual({ count: 1, frameWidth: 64 });
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
