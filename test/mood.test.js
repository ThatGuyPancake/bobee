import { describe, it, expect } from 'vitest';
import {
  REST,
  GAINS,
  HALF_LIFE_MS,
  MAX_ELAPSED_MS,
  settle,
  createMood,
  levelOf,
  phaseOf,
} from '../renderer/mood.js';

const H = 3600000;

describe('settle', () => {
  it('halves the distance to rest every 3 hours', () => {
    expect(Math.abs(settle(80, 3 * H) - 70)).toBeLessThan(1e-9);
    expect(settle(80, 0)).toBe(80);
  });

  it('never goes below rest', () => {
    expect(settle(50, H)).toBe(60);
  });

  it('caps the elapsed time at 24 h', () => {
    expect(settle(100, 72 * H)).toBe(settle(100, 24 * H));
  });

  it('has the planned constants', () => {
    expect(REST).toBe(60);
    expect(GAINS).toEqual({ pet: 2, click: 1, treat: 8 });
    expect(HALF_LIFE_MS).toBe(3 * H);
    expect(MAX_ELAPSED_MS).toBe(24 * H);
  });
});

describe('createMood', () => {
  it('a treat adds 8, and it caps at 100', () => {
    expect(createMood({}, 0).add('treat', 0)).toBe(68);
    const m = createMood({}, 0);
    let v = 0;
    for (let i = 0; i < 10; i++) v = m.add('treat', 0);
    expect(v).toBe(100);
  });

  it('pets and clicks add 2 and 1', () => {
    const m = createMood({}, 0);
    expect(m.add('pet', 0)).toBe(62);
    expect(m.add('click', 0)).toBe(63);
  });

  it('settles back between changes', () => {
    const m = createMood({ happiness: 80 }, 0);
    expect(Math.abs(m.value(3 * H) - 70)).toBeLessThan(1e-9);
    expect(Math.abs(m.add('click', 3 * H) - 71)).toBeLessThan(1e-9);
  });

  it('settles from the saved time on resume, capped at 24 h', () => {
    const m = createMood({ happiness: 90, updatedAt: new Date(0).toISOString() }, 3 * 86400000);
    expect(m.value(3 * 86400000)).toBe(settle(90, 24 * H));
  });

  it('ignores a broken saved value', () => {
    expect(createMood({ happiness: 'x' }, 0).value(0)).toBe(60);
    expect(createMood({ happiness: 140 }, 0).value(0)).toBe(100);
    expect(createMood(null, 0).value(0)).toBe(60);
  });

  it('reports its level and a snapshot to save', () => {
    const m = createMood({ happiness: 90 }, 0);
    expect(m.level(0)).toBe('overjoyed');
    expect(m.snapshot(1000)).toEqual({ happiness: m.value(1000), updatedAt: new Date(1000).toISOString() });
  });

  it('a clock that runs backwards does not raise him', () => {
    const m = createMood({ happiness: 80 }, 10 * H);
    expect(m.value(5 * H)).toBe(80);
  });
});

describe('levelOf', () => {
  it('has the three levels', () => {
    expect(levelOf(74.9)).toBe('content');
    expect(levelOf(75)).toBe('happy');
    expect(levelOf(89.999)).toBe('happy');
    expect(levelOf(90)).toBe('overjoyed');
  });
});

describe('phaseOf', () => {
  const at = (h, m = 0) => phaseOf(new Date(2026, 9, 25, h, m));
  it('follows the day', () => {
    expect(at(0)).toBe('night');
    expect(at(5, 59)).toBe('night');
    expect(at(6)).toBe('morning');
    expect(at(10, 59)).toBe('morning');
    expect(at(11)).toBe('day');
    expect(at(12)).toBe('lunch');
    expect(at(13, 59)).toBe('lunch');
    expect(at(14)).toBe('day');
    expect(at(19, 59)).toBe('day');
    expect(at(20)).toBe('evening');
    expect(at(23, 59)).toBe('evening');
  });
});

it('keeps settling after a capped overnight gap', () => {
  const m = createMood({ happiness: 100, updatedAt: new Date(0).toISOString() }, 72 * H);
  const resumed = m.value(72 * H);
  expect(m.value(75 * H)).toBeCloseTo(60 + (resumed - 60) / 2, 10);
});
it('a backward clock change never restores happiness already settled', () => {
  const m = createMood({ happiness: 100, updatedAt: new Date(0).toISOString() }, 0);
  expect(m.value(3 * H)).toBe(80);
  expect(m.value(H)).toBe(80);
});
