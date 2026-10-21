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
  createBrain({ random: () => 0.1, minX: 0, maxX: 1000, x: 500, visits: false, ...o });

describe('brain', () => {
  it('starts idle and walks after <= 8s', () => {
    const b = mk();
    expect(b.tick(0).state).toBe('idle');
    const out = run(b, 8000);
    expect(out.some((o) => o.state === 'walk')).toBe(true);
  });

  it('walk dx never exceeds 40px/s and stays in bounds', () => {
    const b = createBrain({ visits: false, random: seeded(7), minX: 100, maxX: 600, x: 300 });
    let x = 300;
    for (const o of run(b, 60000)) {
      expect(Math.abs(o.dx)).toBeLessThanOrEqual((40 * 100) / 1000 + 1e-9);
      x += o.dx;
      expect(x).toBeGreaterThanOrEqual(100 - 1e-9);
      expect(x).toBeLessThanOrEqual(600 + 1e-9);
    }
  });

  it('facing matches walk direction', () => {
    const b = createBrain({ visits: false, random: seeded(3), minX: 0, maxX: 800, x: 400 });
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
    const b = createBrain({ random: () => 0.1, minX: 500, maxX: 500, x: 500, visits: false });
    for (const o of run(b, 30000)) {
      expect(Number.isNaN(o.dx)).toBe(false);
      expect(o.dx).toBe(0);
    }
  });

  it('setBounds shrinking mid-walk clamps target', () => {
    const b = createBrain({ random: () => 0.1, minX: 0, maxX: 1000, x: 100, visits: false });
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

describe('brain: visits', () => {
  const MIN = 60 * 1000;
  const mkV = (o = {}) => createBrain({ random: seeded(11), minX: 0, maxX: 1000, x: 500, ...o });
  const visibleAwake = (o) => o.visible && o.state !== 'sleep';

  it('says hello on launch, then leaves within 5 minutes', () => {
    const b = mkV();
    expect(b.tick(100).visible).toBe(true);
    const out = run(b, 5 * MIN + 2000, 1000);
    expect(out.some((o) => !o.visible && o.state === 'away')).toBe(true);
  });

  it('no visit is ever longer than 5 minutes', () => {
    const b = mkV();
    let streak = 0;
    for (const o of run(b, 6 * 60 * MIN, 1000)) {
      streak = visibleAwake(o) ? streak + 1 : 0;
      expect(streak).toBeLessThanOrEqual(5 * 60);
    }
  });

  it('visible at most 5 minutes per hour of active screen time, and still visits every hour', () => {
    const b = mkV({ random: seeded(3) });
    const out = run(b, 6 * 60 * MIN, 1000);
    for (let h = 0; h < 6; h++) {
      const hour = out.slice(h * 3600, (h + 1) * 3600);
      expect(hour.filter(visibleAwake).length).toBeLessThanOrEqual(5 * 60);
    }
    for (let h = 1; h < 6; h++) {
      const two = out.slice(h * 3600 - 1800, h * 3600 + 3600);
      expect(two.some(visibleAwake)).toBe(true);
    }
  });

  it('always shows him while the screen is idle, at a spot inside the bounds', () => {
    const b = mkV({ minX: 100, maxX: 900 });
    let o;
    for (let i = 0; i < 600 && (o = b.tick(1000)).visible; i++);
    expect(o.visible).toBe(false);
    b.setSystemIdle(130);
    o = b.tick(100);
    expect(o.visible).toBe(true);
    expect(o.state).toBe('sleep');
    expect(o.jumpTo).toBeGreaterThanOrEqual(100);
    expect(o.jumpTo).toBeLessThanOrEqual(900);
    // stays for hours of idle screen
    expect(run(b, 3 * 60 * MIN, 1000).every((x) => x.visible && x.state === 'sleep')).toBe(true);
  });

  it('idle-screen time does not use up his visit time', () => {
    const b = mkV();
    b.setSystemIdle(500);
    run(b, 50 * MIN, 1000); // asleep, visible, not counted
    b.setSystemIdle(0);
    // the launch visit still has its time left, so he stays a bit after waking
    const out = run(b, 20 * 1000, 1000);
    expect(out.every((o) => o.visible)).toBe(true);
  });

  it('leaves shortly after waking if he only came for the nap', () => {
    const b = mkV();
    let o;
    for (let i = 0; i < 600 && (o = b.tick(1000)).visible; i++);
    b.setSystemIdle(200);
    b.tick(1000);
    b.setSystemIdle(0);
    const out = run(b, 30 * 1000, 1000);
    expect(out[0].visible).toBe(true);
    expect(out[out.length - 1].visible).toBe(false);
  });

  it('typing does not bring him back, and he never moves while away', () => {
    const b = mkV();
    let o;
    for (let i = 0; i < 600 && (o = b.tick(1000)).visible; i++);
    b.keyPulse();
    o = b.tick(100);
    expect(o.visible).toBe(false);
    expect(o.dx).toBe(0);
  });

  it('pause shows him; summon brings him for a visit', () => {
    const b = mkV();
    let o;
    for (let i = 0; i < 600 && (o = b.tick(1000)).visible; i++);
    b.setPaused(true);
    expect(b.tick(100).visible).toBe(true);
    b.setPaused(false);

    const c = mkV();
    for (let i = 0; i < 600 && (o = c.tick(1000)).visible; i++);
    c.summon();
    o = c.tick(100);
    expect(o.visible).toBe(true);
    expect(o.jumpTo).not.toBeNull();
  });

  it('visits are spread out: one in each third of every hour', () => {
    const b = mkV({ random: seeded(9) });
    const out = run(b, 6 * 60 * MIN, 1000);
    for (let h = 1; h < 6; h++) {
      for (let t = 0; t < 3; t++) {
        const from = h * 3600 + t * 1200;
        expect(out.slice(from, from + 1200).some(visibleAwake)).toBe(true);
      }
    }
  });

  it('walks on from off screen and walks off screen when leaving', () => {
    const b = mkV({ minX: 0, maxX: 1000, margin: 200 });
    const first = b.tick(100);
    expect(first.state).toBe('enter');
    expect(first.animation).toBe('walk');
    expect([-200, 1200]).toContain(first.jumpTo);
    let x = first.jumpTo + first.dx;
    let sawExit = false;
    let o;
    for (let i = 0; i < 400; i++) {
      o = b.tick(1000);
      x += o.dx;
      if (o.state === 'exit') {
        sawExit = true;
        expect(o.animation).toBe('walk');
        expect(o.visible).toBe(true);
      }
      if (!o.visible) break;
    }
    expect(sawExit).toBe(true);
    expect(o.visible).toBe(false);
    expect(x <= -200 + 1e-6 || x >= 1200 - 1e-6).toBe(true);
  });

  it('never shows a random bubble while away', () => {
    const b = mkV();
    for (const o of run(b, 3 * 60 * MIN, 1000)) {
      if (o.bubble === 'random') expect(o.visible).toBe(true);
    }
  });
});
