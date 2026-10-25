import { describe, it, expect } from 'vitest';
import { createBrain, NAP_WAKE_MS } from '../renderer/brain.js';

// a seed whose first visit starts early enough to finish within 3 minutes
const VISIT_SEED = 1;

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

  it('click on a sleeping bear wakes him and he reacts', () => {
    const b = mk();
    b.setSystemIdle(300);
    expect(b.tick(100).state).toBe('sleep');
    b.pointerDown(5, 5);
    b.pointerUp();
    const o = b.tick(100);
    expect(o.state).toBe('happy');
    expect(o.bubble).toBe('click');
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

describe('brain: home and visits', () => {
  const MIN = 60 * 1000;
  const M = { yawnMs: 500, waveMs: 500 };
  const mkV = (o = {}) => createBrain({ random: seeded(11), minX: 0, maxX: 1000, x: 500, visits: true, ...M, ...o });
  const awake = (o) => o.state !== 'home' && o.state !== 'sleep';
  // the states in order, with repeats collapsed
  const seq = (out) => out.map((o) => o.state).filter((s, i, a) => i === 0 || a[i - 1] !== s);
  // true if each group in `want` is matched in that order (other states may sit between)
  const inOrder = (states, want) => {
    let i = 0;
    for (const s of states) if (i < want.length && want[i].includes(s)) i++;
    return i === want.length;
  };
  // no visit comes due for ~2 minutes, and he never walks on his own
  const late = (o = {}) => mkV({ random: () => 0.99, ...o });

  it('starts asleep at home', () => {
    const b = mkV();
    const o = b.tick(100);
    expect(o.state).toBe('home');
    expect(o.animation).toBe('sleep');
    expect(o.x).toBe(1000);
    expect(o.visible).toBe(true);
  });

  it('a visit wakes him, he wanders, then walks home and dozes off', () => {
    const b = mkV({ random: seeded(VISIT_SEED) });
    const out = run(b, 3 * MIN, 100);
    expect(inOrder(seq(out), [['waking'], ['wave'], ['idle', 'walk'], ['homing'], ['dozing'], ['home']])).toBe(true);
    expect(out.filter((o) => o.event === 'visit-start').length).toBe(1);
    expect(out.filter((o) => o.event === 'visit-end').length).toBe(1);
    expect(out[out.length - 1].state).toBe('home');
    expect(out[out.length - 1].x).toBe(1000);
    // he's always on screen
    expect(out.every((o) => o.visible && o.x >= 0 && o.x <= 1000)).toBe(true);
  });

  it('wakes with a yawn, then waves', () => {
    const b = mkV({ random: seeded(VISIT_SEED) });
    const out = run(b, 3 * MIN, 100);
    const i = out.findIndex((o) => o.state === 'waking');
    expect(out[i].animation).toBe('yawn');
    const len = out.slice(i).findIndex((o) => o.state !== 'waking');
    expect(len * 100).toBeGreaterThanOrEqual(400);
    expect(len * 100).toBeLessThanOrEqual(600);
    expect(out[i + len].state).toBe('wave');
  });

  it('awake at most 10 minutes per active hour', () => {
    for (const seed of [3, 9, 21]) {
      const b = mkV({ random: seeded(seed) });
      const out = run(b, 3 * 60 * MIN, 1000);
      for (let h = 0; h < 3; h++) {
        const n = out.slice(h * 3600, (h + 1) * 3600).filter(awake).length;
        expect(n).toBeLessThanOrEqual(10 * 60);
        expect(n).toBeGreaterThan(5 * 60);
      }
    }
  });

  it('no visit is ever longer than 2 minutes', () => {
    const b = mkV({ random: seeded(4) });
    let streak = 0;
    for (const o of run(b, 3 * 60 * MIN, 1000)) {
      streak = awake(o) ? streak + 1 : 0;
      expect(streak).toBeLessThanOrEqual(2 * 60);
    }
  });

  it('talks soon after waking and a few times during each visit', () => {
    const b = mkV({ random: seeded(4) });
    const out = run(b, 3 * 60 * MIN, 1000);
    const visits = [];
    let cur = null;
    out.forEach((o, i) => {
      if (o.event === 'visit-start') visits.push((cur = { start: i, talks: [] }));
      if (cur && o.bubble === 'random') cur.talks.push(i - cur.start);
      if (o.event === 'visit-end') cur = null;
    });
    expect(visits.length).toBeGreaterThanOrEqual(10);
    for (const v of visits) {
      expect(v.talks.length).toBeGreaterThanOrEqual(2);
      expect(v.talks[0]).toBeLessThanOrEqual(8);
    }
    // never while asleep
    for (const o of out) if (o.bubble === 'random') expect(awake(o)).toBe(true);
  });

  it('click while home wakes him in place, then he goes home after NAP_WAKE_MS', () => {
    expect(NAP_WAKE_MS).toBe(60000);
    const b = late();
    b.tick(100);
    b.pointerDown(0, 0);
    expect(b.pointerUp()).toBe('click');
    const o = b.tick(100);
    expect(o.state).toBe('happy');
    expect(o.bubble).toBe('click');
    expect(o.x).toBe(1000);
    expect(run(b, 58 * 1000, 1000).every(awake)).toBe(true);
    const after = run(b, 30 * 1000, 100);
    const s = seq(after);
    expect(s.includes('homing') || s.includes('dozing')).toBe(true);
    expect(after[after.length - 1].state).toBe('home');
    expect(after.some((x) => x.event === 'visit-start')).toBe(false);
  });

  it('drag from home, drop, stays awake ~60s, then walks back', () => {
    const b = late();
    b.tick(100);
    b.pointerDown(0, 0);
    expect(b.pointerMove(10, 0)).toBe(true);
    expect(b.tick(100).state).toBe('drag');
    expect(b.pointerUp()).toBe('drag');
    b.setX(200);
    const first = run(b, 70 * 1000, 1000);
    expect(first.slice(0, 55).every((o) => awake(o) && o.state !== 'homing')).toBe(true);
    expect(first.some((o) => o.state === 'homing')).toBe(true);
    const rest = run(b, 30 * 1000, 1000);
    const last = rest[rest.length - 1];
    expect(last.state).toBe('home');
    expect(last.x).toBe(1000);
  });

  it('a click on the way home wakes him in place', () => {
    const b = late();
    b.tick(100);
    b.pointerDown(0, 0);
    b.pointerMove(10, 0);
    b.pointerUp();
    b.setX(200);
    b.setPhase('night'); // keeps the next planned visit out of the way; he's already awake
    let o;
    for (let i = 0; i < 200 && (o = b.tick(500)).state !== 'homing'; i++);
    expect(o.state).toBe('homing');
    b.tick(2000);
    const stopAt = b.tick(100).x;
    b.pointerDown(0, 0);
    expect(b.pointerUp()).toBe('click');
    o = b.tick(100);
    expect(o.state).toBe('happy');
    expect(o.x).toBeCloseTo(stopAt, 6);
    // awake for another minute before heading home again
    expect(run(b, 55 * 1000, 1000).every((x) => awake(x) && x.state !== 'homing')).toBe(true);
    expect(run(b, 60 * 1000, 1000).pop().state).toBe('home');
  });

  it('night: no visits and a click only peeks', () => {
    const b = mkV({ peekMs: 800 });
    b.setPhase('night');
    expect(run(b, 2 * 60 * MIN, 1000).every((o) => o.state === 'home')).toBe(true);
    b.pointerDown(0, 0);
    expect(b.pointerUp()).toBe('click');
    const out = run(b, 1500, 100);
    expect(out.every((o) => o.state === 'home' && o.bubble === null)).toBe(true);
    const peeks = out.filter((o) => o.animation === 'sleep-peek').length;
    expect(peeks * 100).toBeGreaterThanOrEqual(700);
    expect(peeks * 100).toBeLessThanOrEqual(800);
    expect(out[out.length - 1].animation).toBe('sleep');
  });

  it('night: a drop away from home dozes off in place', () => {
    const b = mkV();
    b.setPhase('night');
    b.tick(100);
    b.pointerDown(0, 0);
    b.pointerMove(10, 0);
    b.pointerUp();
    b.setX(300);
    const out = run(b, 5000, 100);
    expect(out[0].state).toBe('dozing');
    const last = out[out.length - 1];
    expect(last.state).toBe('sleep');
    expect(last.x).toBe(300);
  });

  it('visits come back after night', () => {
    const b = mkV({ random: seeded(3) });
    b.setPhase('night');
    run(b, 30 * MIN, 1000);
    b.setPhase('morning');
    expect(run(b, 2 * 60 * MIN, 1000).some((o) => o.event === 'visit-start')).toBe(true);
  });

  it('typing never wakes him at home', () => {
    const b = mkV();
    for (let i = 0; i < 50; i++) {
      b.keyPulse();
      expect(b.tick(100).state).toBe('home');
    }
  });

  it('screen idle mid-visit sends him home, and visits wait', () => {
    const b = mkV({ random: seeded(VISIT_SEED) });
    let o;
    for (let i = 0; i < 300 && (o = b.tick(1000)).state !== 'walk'; i++);
    expect(o.state).toBe('walk');
    o = b.tick(3000); // a few steps away from home
    expect(o.x).toBeLessThan(1000);
    b.setSystemIdle(200);
    const out = run(b, 60 * 1000, 100);
    expect(inOrder(seq(out), [['homing'], ['dozing'], ['home']])).toBe(true);
    expect(out[out.length - 1].x).toBe(1000);
    expect(out.some((x) => x.event === 'visit-end')).toBe(true);
    // stays home for hours of idle screen
    expect(run(b, 3 * 60 * MIN, 1000).every((x) => x.state === 'home')).toBe(true);
    // and the next due visit starts when she's back
    b.setSystemIdle(0);
    expect(run(b, 15 * MIN, 1000).some((x) => x.event === 'visit-start')).toBe(true);
  });

  it('moment returns to where it started', () => {
    const a = mk();
    a.tick(100);
    a.moment('pet', 500);
    const out = run(a, 1000, 100);
    expect(out[0].animation).toBe('pet');
    expect(out.filter((o) => o.animation === 'pet').length).toBeLessThanOrEqual(5);
    expect(out[out.length - 1].state).toBe('idle');

    const b = mkV();
    b.tick(100);
    b.moment('sleep-pet', 500);
    const sleepy = run(b, 1000, 100);
    expect(sleepy[0].animation).toBe('sleep-pet');
    expect(sleepy.every((o) => o.state === 'home')).toBe(true);
    expect(sleepy[sleepy.length - 1].animation).toBe('sleep');
  });

  it('moment is ignored while dragging or with no duration', () => {
    const b = mk();
    b.moment('pet', 0);
    expect(b.tick(100).state).toBe('idle');
    b.pointerDown(0, 0);
    b.pointerMove(50, 0);
    b.moment('pet', 500);
    expect(b.tick(100).animation).toBe('drag');
  });

  it('wakeHere wakes him without a visit', () => {
    const b = late();
    b.tick(100);
    b.wakeHere();
    const o = b.tick(100);
    expect(o.state).toBe('idle');
    expect(o.event).toBe(null);
    expect(o.bubble).toBe(null);
  });

  it('summon wakes him for a short visit with a wave', () => {
    const b = late();
    b.tick(100);
    b.summon();
    expect(b.tick(100).state).toBe('wave');
    const out = run(b, 90 * 1000, 1000);
    expect(out[out.length - 1].state).toBe('home');
  });

  it('pause sends him home asleep; resume keeps him there', () => {
    const b = mkV({ random: seeded(VISIT_SEED) });
    let o;
    for (let i = 0; i < 300 && !['idle', 'walk'].includes((o = b.tick(1000)).state); i++);
    b.setPaused(true);
    o = b.tick(100);
    expect(o.state).toBe('home');
    expect(o.x).toBe(1000);
    expect(run(b, 30 * MIN, 1000).every((x) => x.state === 'home' && x.bubble === null)).toBe(true);
    b.setPaused(false);
    expect(b.tick(100).state).toBe('home');
  });

  it('setBounds keeps him pinned to the home corner', () => {
    const b = mkV();
    b.tick(100);
    b.setBounds(0, 800);
    const o = b.tick(100);
    expect(o.state).toBe('home');
    expect(o.x).toBe(800);
  });

  it('evening visits are 30% shorter', () => {
    const longest = (phase) => {
      const b = mkV({ random: seeded(5) });
      b.setPhase(phase);
      const out = run(b, 2 * 60 * MIN, 1000).slice(3600);
      let streak = 0;
      let max = 0;
      for (const o of out) {
        streak = awake(o) ? streak + 1 : 0;
        max = Math.max(max, streak);
      }
      return max;
    };
    expect(longest('evening')).toBeLessThanOrEqual(72);
    expect(longest('day')).toBeGreaterThan(80);
  });
});

describe('brain: wave, sip and yawn', () => {
  const MOMENTS = { waveMs: 1500, sipMs: 1200, yawnMs: 1200 };

  it('waves hello when he wakes for a visit, then goes idle', () => {
    const b = createBrain({ random: seeded(VISIT_SEED), minX: 0, maxX: 1000, ...MOMENTS });
    const out = run(b, 3 * 60 * 1000);
    const i = out.findIndex((o) => o.state === 'wave');
    expect(i).toBeGreaterThan(0);
    expect(out[i - 1].state).toBe('waking');
    expect(out[i].animation).toBe('wave');
    const waved = out.slice(i).findIndex((o) => o.state !== 'wave');
    for (const o of out.slice(i, i + waved)) expect(o.dx).toBe(0);
    // the tick that starts a moment also counts down, so it shows for one tick less
    expect(waved * 100).toBeGreaterThanOrEqual(1400);
    expect(waved * 100).toBeLessThanOrEqual(1600);
    expect(out[i + waved].state).toBe('idle');
  });

  it('waves when greeted from the tray while he is already here', () => {
    const b = mk(MOMENTS);
    b.tick(100);
    b.summon();
    expect(b.tick(100).state).toBe('wave');
  });

  it('does not wave without a wave strip', () => {
    const b = createBrain({ random: seeded(VISIT_SEED), minX: 0, maxX: 1000 });
    const out = run(b, 3 * 60 * 1000);
    expect(out.some((o) => o.event === 'visit-start')).toBe(true);
    expect(out.some((o) => o.state === 'wave')).toBe(false);
  });

  it('sips his coffee now and then while idle, standing still', () => {
    // 0.75 is past the walk chance but inside the sip chance
    const b = mk({ random: () => 0.75, ...MOMENTS });
    const out = run(b, 20 * 1000);
    const sips = out.filter((o) => o.state === 'sip');
    expect(sips.length).toBeGreaterThan(0);
    for (const o of sips) {
      expect(o.animation).toBe('sip');
      expect(o.dx).toBe(0);
    }
    // each sip lasts sipMs, then he is idle again
    const i = out.findIndex((o) => o.state === 'sip');
    const len = out.slice(i).findIndex((o) => o.state !== 'sip');
    expect(len * 100).toBeGreaterThanOrEqual(1100);
    expect(out[i + len].state).toBe('idle');
  });

  it('never sips when the roll says walk or stay idle', () => {
    for (const r of [0.1, 0.95]) {
      const b = mk({ random: () => r, ...MOMENTS });
      expect(run(b, 30 * 1000).some((o) => o.state === 'sip')).toBe(false);
    }
  });

  it('yawns before falling asleep', () => {
    const b = mk(MOMENTS);
    b.tick(100);
    b.setSystemIdle(120);
    const out = run(b, 3000);
    expect(out[0].state).toBe('dozing');
    expect(out[0].animation).toBe('yawn');
    const len = out.findIndex((o) => o.state !== 'dozing');
    expect(len * 100).toBeGreaterThanOrEqual(1100);
    expect(out.slice(len).every((o) => o.state === 'sleep')).toBe(true);
  });

  it('wakes from a yawn when you come back', () => {
    const b = mk(MOMENTS);
    b.setSystemIdle(150);
    expect(b.tick(100).state).toBe('dozing');
    b.setSystemIdle(0);
    expect(b.tick(100).state).toBe('idle');
  });
});
