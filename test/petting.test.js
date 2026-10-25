import { describe, it, expect } from 'vitest';
import { createPetting, petMoment } from '../renderer/petting.js';

// x = 0, 10, 0, 10, 0: four strokes, three direction changes
const XS = [0, 10, 0, 10, 0];

function stroke(p, { start = 0, step = 200, xs = XS, over = true, button = false } = {}) {
  return xs.map((x, i) => p.sample(x, start + i * step, over, button));
}

describe('petting', () => {
  it('reports a pet on the sample that completes the third direction change', () => {
    const p = createPetting();
    expect(stroke(p)).toEqual([false, false, false, false, true]);
  });

  it('ignores strokes shorter than 6 px', () => {
    const p = createPetting();
    expect(stroke(p, { xs: [0, 4, 0, 4, 0, 4, 0] })).not.toContain(true);
  });

  it('ignores strokes spread over more than 1.5 s', () => {
    const p = createPetting();
    expect(stroke(p, { step: 500 })).not.toContain(true);
  });

  it('starts over when the pointer leaves him', () => {
    const p = createPetting();
    const out = [
      p.sample(0, 0, true, false),
      p.sample(10, 200, true, false),
      p.sample(0, 400, true, false),
      p.sample(5, 500, false, false),
      p.sample(10, 600, true, false),
      p.sample(0, 800, true, false),
      p.sample(10, 1000, true, false),
    ];
    expect(out).not.toContain(true);
  });

  it('gives no pet while a mouse button is held', () => {
    const p = createPetting();
    expect(stroke(p, { button: true })).not.toContain(true);
  });

  it('waits 4 s between pets', () => {
    const p = createPetting();
    expect(stroke(p)).toContain(true); // pet at t = 800
    expect(stroke(p, { start: 1000 })).not.toContain(true);
    expect(stroke(p, { start: 5000 })).toContain(true);
  });

  it('reports each pet once', () => {
    const p = createPetting();
    const out = stroke(p, { xs: [0, 10, 0, 10, 0, 10, 0], step: 100 });
    expect(out.filter(Boolean)).toHaveLength(1);
  });

  it('reset() forgets the strokes so far', () => {
    const p = createPetting();
    p.sample(0, 0, true, false);
    p.sample(10, 200, true, false);
    p.sample(0, 400, true, false);
    p.reset();
    expect([p.sample(10, 600, true, false), p.sample(0, 800, true, false)]).toEqual([false, false]);
  });
});

describe('petMoment', () => {
  it('plays sleep-pet while he sleeps, so he stays asleep', () => {
    expect(petMoment('home')).toBe('sleep-pet');
    expect(petMoment('sleep')).toBe('sleep-pet');
  });

  it('plays pet while he is awake', () => {
    for (const s of ['idle', 'walk', 'homing', 'dozing', 'waking', 'happy', 'sip', 'typing']) {
      expect(petMoment(s)).toBe('pet');
    }
  });
});
