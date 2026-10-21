import { describe, it, expect } from 'vitest';
import { createBrain } from '../renderer/brain.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function run(brain, ms, step = 100) {
  const out = [];
  for (let t = 0; t < ms; t += step) out.push(brain.tick(step));
  return out;
}

const mk = (o = {}) =>
  createBrain({ random: () => 0.1, minX: 0, maxX: 1000, x: 500, ...o });

describe('brain', () => {
  it('starts idle and walks after <= 8s', () => {
    const b = mk();
    expect(b.tick(0).state).toBe('idle');
    const out = run(b, 8000);
    expect(out.some((o) => o.state === 'walk')).toBe(true);
  });

  it('walk dx never exceeds 40px/s and stays in bounds', () => {
    const b = createBrain({ random: seeded(7), minX: 100, maxX: 600, x: 300 });
    let x = 300;
    for (const o of run(b, 60000)) {
      expect(Math.abs(o.dx)).toBeLessThanOrEqual((40 * 100) / 1000 + 1e-9);
      x += o.dx;
      expect(x).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(x).toBeLessThanOrEqual(600 + 1e-9);
    }
  });

  it('facing matches walk direction', () => {
    const b = createBrain({ random: seeded(3), minX: 0, maxX: 800, x: 400 });
    let walked = 0;
    for (const o of run(b, 60000)) {
      if (o.state === 'walk' && o.dx !== 0) {
        walked++;
        expect(o.dx > 0).toBe(o.facing === 'right');
      }
    }
    expect(walked).toBeGreaterThan(0);
  });

  it('zero-width bounds produce no NaN dx', () => {
    const b = createBrain({ random: () => 0.1, minX: 500, maxX: 500, x: 500 });
    for (const o of run(b, 30000)) {
      expect(Number.isNaN(o.dx)).toBe(false);
      expect(o.dx).toBe(0);
    }
  });

  it('setBounds shrinking mid-walk clamps target', () => {
    const b = createBrain({ random: () => 0.1, minX: 0, maxX: 1000, x: 100 });
    let x = 100;
    let sawWalk = false;
    for (let i = 0; i < 100 && !sawWalk; i++) {
      const o = b.tick(100);
      x += o.dx;
      if (o.state === 'walk') sawWalk = true;
    }
    expect(sawWalk).toBe(true);
    b.setBounds(0, 200);
    x = Math.min(x, 200); // owner clamps its own position to the new bounds
    for (const o of run(b, 30000)) {
      x += o.dx;
      expect(x).toBeLessThanOrEqual(200 + 1e-9);
      expect(x).toBeGreaterThanOrEqual(-1e-9);
      expect(Number.isNaN(o.dx)).toBe(false);
    }
  });

  it('sleeps when system idle >= 120', () => {
    const b = mk();
    b.setSystemIdle(120);
    const o = b.tick(100);
    expect(o.state).toBe('sleep');
    expect(o.animation).toBe('sleep');
  });

  it('key wakes and stale idle does not re-sleep', () => {
    const b = mk();
    b.setSystemIdle(200);
    expect(b.tick(100).state).toBe('sleep');
    b.keyPulse();
    for (const o of run(b, 5000)) expect(o.state).not.toBe('sleep');
  });

  it('click vs drag', () => {
    const b = mk();
    b.pointerDown(100, 100);
    b.pointerMove(102, 101);
    expect(b.pointerUp()).toBe('click');
    const o = b.tick(16);
    expect(o.state).toBe('happy');
    expect(o.bubble).toBe('click');
    expect(b.tick(16).bubble).toBe(null);

    const c = mk();
    c.pointerDown(100, 100);
    expect(c.pointerMove(110, 100)).toBe(true);
    expect(c.tick(16).state).toBe('drag');
    expect(c.pointerUp()).toBe('drag');
    expect(c.tick(16).state).toBe('idle');
  });

  it('happy from click lasts happyMs', () => {
    const b = mk({ happyMs: 500 });
    b.pointerDown(0, 0);
    b.pointerUp();
    expect(b.tick(100).state).toBe('happy');
    expect(b.tick(300).state).toBe('happy');
    expect(b.tick(200).state).toBe('idle');
  });

  it('click on sleeping bear wakes without happy', () => {
    const b = mk();
    b.setSystemIdle(300);
    b.tick(100);
    b.pointerDown(5, 5);
    b.pointerUp();
    const o = b.tick(100);
    expect(o.state).toBe('idle');
    expect(o.bubble).toBe(null);
    expect(b.tick(100).state).toBe('idle');
  });

  it('keys ignored during drag', () => {
    const b = mk();
    b.pointerDown(0, 0);
    b.pointerMove(50, 0);
    b.keyPulse();
    expect(b.tick(100).state).toBe('drag');
    b.keyPulse();
    expect(b.tick(100).state).toBe('drag');
  });

  it('typing: state, happy every 30 pulses, ends after 3s', () => {
    const b = mk();
    b.keyPulse();
    expect(b.tick(100).state).toBe('typing');
    let sawHappy = false;
    for (let i = 0; i < 29; i++) {
      b.keyPulse();
      const o = b.tick(100);
      expect(o.state).toBe('typing');
      if (o.animation === 'happy') sawHappy = true;
    }
    expect(sawHappy).toBe(true);
    // last tick was 100 ms after the final pulse
    expect(b.tick(2800).state).toBe('typing'); // 2900 ms
    expect(b.tick(200).state).toBe('idle'); // 3100 ms
  });

  it('facing during typing points to the screen center', () => {
    const l = mk({ x: 100 });
    l.keyPulse();
    expect(l.tick(100).facing).toBe('right');
    const r = mk({ x: 900 });
    r.keyPulse();
    expect(r.tick(100).facing).toBe('left');
  });

  it('on-fire once per 30 min', () => {
    const b = mk();
    const burst = () => {
      let n = 0;
      for (let i = 0; i < 300; i++) {
        b.keyPulse();
        if (b.tick(100).bubble === 'onfire') n++;
      }
      return n;
    };
    expect(burst()).toBe(1);
    run(b, 5000); // typing ends
    expect(burst()).toBe(0);
    run(b, 31 * 60 * 1000);
    // typing never calls him back from a trip, so wait until he's here
    for (let i = 0; i < 600 && b.tick(1000).state === 'away'; i++);
    expect(burst()).toBe(1);
  });

  it('random bubble within 20-40 min, none while paused', () => {
    const b = mk();
    const early = run(b, 19 * 60 * 1000, 1000).filter((o) => o.bubble === 'random');
    expect(early.length).toBe(0);
    const rest = run(b, 21 * 60 * 1000, 1000).filter((o) => o.bubble === 'random');
    expect(rest.length).toBe(1);

    const p = mk();
    p.setPaused(true);
    const out = run(p, 60 * 60 * 1000, 1000);
    expect(out.filter((o) => o.bubble === 'random').length).toBe(0);
  });

  it('click while paused: no bubble, no happy', () => {
    const b = mk();
    b.setPaused(true);
    b.pointerDown(0, 0);
    expect(b.pointerUp()).toBe('click');
    const o = b.tick(100);
    expect(o.bubble).toBe(null);
    expect(o.state).toBe('idle');
  });

  it('paused: idle, dx 0, keys ignored', () => {
    const b = mk();
    b.setPaused(true);
    b.keyPulse();
    for (const o of run(b, 20000)) {
      expect(o.state).toBe('idle');
      expect(o.dx).toBe(0);
    }
  });
});

describe('brain: away trips', () => {
  const MIN = 60 * 1000;
  function untilAway(b) {
    for (let i = 0; i < 2 * 3600; i++) {
      const o = b.tick(1000);
      if (o.state === 'away') return o;
    }
    throw new Error('never went away');
  }

  it('goes away at least once in an hour of screen time, then comes back visible', () => {
    const b = mk();
    const out = run(b, 60 * MIN, 1000);
    const awayIdx = out.findIndex((o) => o.state === 'away');
    expect(awayIdx).toBeGreaterThan(-1);
    expect(out[awayIdx].visible).toBe(false);
    const back = out.slice(awayIdx).find((o) => o.state !== 'away');
    expect(back.visible).toBe(true);
  });

  it('is never away more than 5 minutes per hour of screen time', () => {
    const b = createBrain({ random: seeded(3), minX: 0, maxX: 1000, x: 500 });
    const out = run(b, 5 * 60 * MIN, 1000);
    for (let h = 0; h < 5; h++) {
      const hour = out.slice(h * 3600, (h + 1) * 3600);
      const awaySec = hour.filter((o) => o.state === 'away').length;
      expect(awaySec).toBeLessThanOrEqual(5 * 60);
    }
    expect(out.some((o) => o.state === 'away')).toBe(true);
  });

  it('comes back at a random spot inside the bounds', () => {
    const b = createBrain({ random: seeded(5), minX: 100, maxX: 900, x: 500 });
    const out = run(b, 60 * MIN, 1000);
    const i = out.findIndex((o) => o.state === 'away');
    const back = out.slice(i).find((o) => o.jumpTo != null);
    expect(back).toBeTruthy();
    expect(back.jumpTo).toBeGreaterThanOrEqual(100);
    expect(back.jumpTo).toBeLessThanOrEqual(900);
    expect(back.visible).toBe(true);
  });

  it('always comes back when it is time to sleep', () => {
    const b = mk();
    let o = untilAway(b);
    b.setSystemIdle(130);
    o = b.tick(100);
    expect(o.state).toBe('sleep');
    expect(o.visible).toBe(true);
    expect(o.jumpTo).not.toBeNull();
  });

  it('typing does not bring him back early, and he never walks while away', () => {
    const b = mk();
    let o = untilAway(b);
    b.keyPulse();
    o = b.tick(100);
    expect(o.state).toBe('away');
    expect(o.dx).toBe(0);
  });

  it('does not leave while paused, and pausing brings him back', () => {
    const p = mk();
    p.setPaused(true);
    expect(run(p, 60 * MIN, 1000).some((o) => o.state === 'away')).toBe(false);

    const b = mk();
    let o = untilAway(b);
    b.setPaused(true);
    o = b.tick(100);
    expect(o.state).toBe('idle');
    expect(o.visible).toBe(true);
  });

  it('sleeping time does not count as screen time', () => {
    const b = mk();
    b.setSystemIdle(500);
    const out = run(b, 3 * 60 * MIN, 1000);
    expect(out.every((o) => o.state === 'sleep')).toBe(true);
  });
});
