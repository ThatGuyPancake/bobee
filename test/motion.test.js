import { describe, it, expect } from 'vitest';
import {
  smoothstep,
  walkSpeedFactor,
  WALK_MIN_FACTOR,
  squashAt,
  SQUASH_MS,
  hopOffset,
  HOP_MS,
  bobOffset,
  STEP_PX,
  breathScale,
  BREATH_MS,
  snapScale,
  wiggleAngle,
  WIGGLE_MS,
  tiltTarget,
  TILT_MAX,
  approach,
  toTransform,
  createMotion,
} from '../renderer/motion.js';
import { createBrain } from '../renderer/brain.js';

describe('smoothstep', () => {
  it('eases from 0 to 1 and clamps', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
    expect(smoothstep(0.25)).toBeLessThan(0.25);
  });
});

describe('walkSpeedFactor', () => {
  it('starts and ends slow, full speed in the middle', () => {
    expect(walkSpeedFactor(0, 100)).toBe(WALK_MIN_FACTOR);
    expect(walkSpeedFactor(100, 0)).toBe(WALK_MIN_FACTOR);
    expect(walkSpeedFactor(50, 50)).toBe(1);
    expect(walkSpeedFactor(12, 100)).toBeGreaterThan(WALK_MIN_FACTOR);
    expect(walkSpeedFactor(12, 100)).toBeLessThan(1);
  });
  it('never stops or exceeds full speed', () => {
    for (let d = 0; d <= 60; d += 3) {
      const f = walkSpeedFactor(d, 60 - d);
      expect(f).toBeGreaterThanOrEqual(WALK_MIN_FACTOR);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
  it('no ease-out with infinite remaining (walking off screen)', () => {
    expect(walkSpeedFactor(100, Infinity)).toBe(1);
  });
});

describe('squashAt', () => {
  it('squashes on impact, overshoots, then settles', () => {
    const hit = squashAt(0);
    expect(hit.sy).toBeLessThan(1);
    expect(hit.sx).toBeGreaterThan(1);
    const over = squashAt(150); // half a bounce later: stretched
    expect(over.sy).toBeGreaterThan(1);
    expect(over.sx).toBeLessThan(1);
    expect(squashAt(SQUASH_MS)).toEqual({ sx: 1, sy: 1 });
    expect(squashAt(-5)).toEqual({ sx: 1, sy: 1 });
  });
  it('dies away', () => {
    expect(Math.abs(1 - squashAt(300).sy)).toBeLessThan(Math.abs(1 - squashAt(0).sy));
  });
});

describe('hopOffset', () => {
  it('rises and comes back down in whole pixels', () => {
    expect(hopOffset(0)).toBe(0);
    expect(hopOffset(HOP_MS / 2, 7)).toBe(-7);
    expect(hopOffset(HOP_MS)).toBe(0);
    expect(hopOffset(-Infinity)).toBe(0);
    for (let t = 0; t <= HOP_MS; t += 13) {
      const y = hopOffset(t);
      expect(Number.isInteger(y)).toBe(true);
      expect(y).toBeLessThanOrEqual(0);
    }
  });
});

describe('bobOffset', () => {
  it('lifts once per step, in whole pixels', () => {
    expect(bobOffset(0)).toBe(0);
    expect(bobOffset(STEP_PX / 2, 2)).toBe(-2);
    expect(bobOffset(STEP_PX, 2)).toBe(0);
    expect(bobOffset(STEP_PX * 1.5, 2)).toBe(-2);
    for (let d = 0; d < 40; d += 0.7) expect(Number.isInteger(bobOffset(d))).toBe(true);
  });
});

describe('breathScale', () => {
  it('swells by about the amplitude over one period', () => {
    expect(breathScale(0)).toBe(1);
    expect(breathScale(BREATH_MS / 2, 0.015)).toBeCloseTo(1.015);
    expect(breathScale(BREATH_MS)).toBeCloseTo(1);
  });
});

describe('snapScale', () => {
  it('snaps to whole pixels', () => {
    expect(snapScale(1.015, 96) * 96).toBe(97);
    expect(snapScale(1.001, 96)).toBe(1);
    expect(snapScale(0.82, 96) * 96).toBe(79);
  });
});

describe('wiggleAngle', () => {
  it('rocks and stops', () => {
    expect(wiggleAngle(0)).toBe(0);
    expect(wiggleAngle(WIGGLE_MS)).toBe(0);
    expect(wiggleAngle(-Infinity)).toBe(0);
    const peak = Math.max(...Array.from({ length: 60 }, (_, i) => Math.abs(wiggleAngle(i * 10))));
    expect(peak).toBeGreaterThan(2);
    expect(peak).toBeLessThanOrEqual(5);
  });
});

describe('tiltTarget and approach', () => {
  it('tilts with drag direction, capped', () => {
    expect(tiltTarget(0)).toBe(0);
    expect(tiltTarget(1)).toBeGreaterThan(0);
    expect(tiltTarget(-1)).toBeLessThan(0);
    expect(tiltTarget(100)).toBe(TILT_MAX);
    expect(tiltTarget(-100)).toBe(-TILT_MAX);
  });
  it('approaches the target smoothly', () => {
    expect(approach(0, 10, 0)).toBe(0);
    const a = approach(0, 10, 16);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(10);
    expect(approach(0, 10, 10000)).toBeCloseTo(10);
  });
});

describe('toTransform', () => {
  it('is none when at rest', () => {
    expect(toTransform({})).toBe('none');
  });
  it('composes offset, swing, rock and scale', () => {
    expect(toTransform({ y: -2 })).toBe('translate(0px, -2px)');
    expect(toTransform({ rot: 3 })).toBe('rotate(3deg)');
    expect(toTransform({ swing: 5, pivot: 77 })).toBe(
      'translateY(-77px) rotate(5deg) translateY(77px)'
    );
    expect(toTransform({ sx: 1.1, sy: 0.9 })).toBe('scale(1.1, 0.9)');
  });
});

describe('createMotion', () => {
  it('is still when reduced motion is on', () => {
    const m = createMotion({ reduced: true });
    m.land(0);
    m.hop(0);
    m.wiggle(0);
    const p = m.update(50, { animation: 'walk', dx: 3, dragging: true });
    expect(toTransform(p)).toBe('none');
  });
  it('breathes while idle, but not while walking', () => {
    const m = createMotion();
    const idle = m.update(BREATH_MS / 2, { animation: 'idle' });
    expect(idle.sy).toBeGreaterThan(1);
    const walk = m.update(BREATH_MS / 2 + 16, { animation: 'walk', dx: 0 });
    expect(walk.sy).toBe(1);
  });
  it('bobs while walking', () => {
    const m = createMotion();
    const ys = [];
    for (let i = 0; i < 20; i++) ys.push(m.update(i * 16, { animation: 'walk', dx: 0.7 }).y);
    expect(Math.min(...ys)).toBeLessThan(0);
    expect(Math.max(...ys)).toBe(0);
  });
  it('a landing squashes then settles', () => {
    const m = createMotion();
    m.land(1000);
    expect(m.update(1000, { animation: 'happy' }).sy).toBeLessThan(1);
    expect(m.update(1000 + SQUASH_MS, { animation: 'happy' }).sy).toBe(1);
  });
  it('a hop goes up, then lands with a squash', () => {
    const m = createMotion();
    m.hop(0);
    expect(m.update(HOP_MS / 2, { animation: 'happy' }).y).toBeLessThan(0);
    const after = m.update(HOP_MS + 10, { animation: 'happy' });
    expect(after.y).toBe(0);
    expect(after.sy).toBeLessThan(1);
  });
  it('tilts toward the drag and rights itself after', () => {
    const m = createMotion();
    m.update(0, { animation: 'drag', dragging: true });
    m.dragVelocity(1);
    const held = m.update(16, { animation: 'drag', dragging: true });
    expect(held.swing).toBeGreaterThan(0);
    let p;
    for (let t = 32; t < 2000; t += 16) p = m.update(t, { animation: 'idle' });
    expect(p.swing).toBe(0);
  });
  it('a hover wiggle rocks him briefly', () => {
    const m = createMotion();
    m.wiggle(0);
    expect(m.update(WIGGLE_MS / 8, { animation: 'idle' }).rot).not.toBe(0);
    expect(m.update(WIGGLE_MS, { animation: 'idle' }).rot).toBe(0);
  });
});

describe('brain walk easing', () => {
  it('starts slow, speeds up, and slows into the target', () => {
    // random 0.1: idles a few seconds, then walks from 400 to 40
    const brain = createBrain({ random: () => 0.1, minX: 0, maxX: 400, x: 400, visits: false });
    const speeds = [];
    for (let t = 0; t < 20000; t += 16) {
      const o = brain.tick(16);
      if (o.state === 'walk') speeds.push(Math.abs(o.dx) / 0.016);
      else if (speeds.length) break;
    }
    expect(speeds.length).toBeGreaterThan(10);
    const top = Math.max(...speeds);
    expect(top).toBeLessThanOrEqual(40 + 1e-6);
    expect(top).toBeGreaterThan(35);
    expect(speeds[0]).toBeLessThan(top / 2);
    expect(speeds[speeds.length - 1]).toBeLessThan(top / 2);
  });
});
