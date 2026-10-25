import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { DEFAULT_STATE, normalizeState, dayKey, createStore, sanitizePatch } = createRequire(import.meta.url)(
  '../lib/store.js'
);

const d = new Date(2026, 9, 25, 9);

function fakeFs({ content = null } = {}) {
  const calls = [];
  return {
    calls,
    readFileSync(file) {
      calls.push(['read', file]);
      if (content === null) throw new Error('ENOENT');
      return content;
    },
    writeFileSync(file, data) {
      calls.push(['write', file, data]);
    },
    renameSync(from, to) {
      calls.push(['rename', from, to]);
    },
    mkdirSync(dir, opts) {
      calls.push(['mkdir', dir, opts]);
    },
  };
}

describe('dayKey', () => {
  it('uses local time', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});

describe('normalizeState', () => {
  it('gives defaults for null, with today as the day', () => {
    expect(normalizeState(null, d)).toEqual({ ...DEFAULT_STATE, day: dayKey(d) });
  });

  it('gives resting happiness for garbage', () => {
    expect(normalizeState('garbage', d).happiness).toBe(60);
    expect(normalizeState({ happiness: 'x' }, d).happiness).toBe(60);
  });

  it('caps happiness at 100 and never below 60', () => {
    expect(normalizeState({ happiness: 140 }, d).happiness).toBe(100);
    expect(normalizeState({ happiness: 10 }, d).happiness).toBe(60);
  });

  it('resets the day fields on a stale day, keeping mood and settings', () => {
    const s = normalizeState(
      { day: '2026-10-24', jarsShown: 2, lunchSnack: true, said: ['morning'], happiness: 80, outfits: false },
      new Date(2026, 9, 25, 9)
    );
    expect(s.jarsShown).toBe(0);
    expect(s.lunchSnack).toBe(false);
    expect(s.said).toEqual([]);
    expect(s.happiness).toBe(80);
    expect(s.outfits).toBe(false);
    expect(s.day).toBe('2026-10-25');
  });

  it('keeps the day fields on the same day', () => {
    const s = normalizeState({ day: '2026-10-25', jarsShown: 2, lunchSnack: true, said: ['morning'] }, d);
    expect(s).toMatchObject({ jarsShown: 2, lunchSnack: true, said: ['morning'] });
  });
});

describe('sanitizePatch', () => {
  it('keeps only known keys with the right types', () => {
    expect(sanitizePatch({ happiness: 70, jarsShown: 'x', evil: 1, said: ['a', 2], outfits: true })).toEqual({
      happiness: 70,
      outfits: true,
    });
    expect(sanitizePatch(null)).toEqual({});
  });
});

describe('createStore', () => {
  it('gives defaults when the file cannot be read', () => {
    const fs = fakeFs();
    const store = createStore('/x/bobee-state.json', { now: () => d, fs });
    expect(store.get()).toEqual({ ...DEFAULT_STATE, day: '2026-10-25' });
  });

  it('gives defaults for a broken file', () => {
    const fs = fakeFs({ content: '{not json' });
    const store = createStore('/x/bobee-state.json', { now: () => d, fs });
    expect(store.get().happiness).toBe(60);
  });

  it('flush writes a temp file, then renames it over the real one', () => {
    const fs = fakeFs();
    const store = createStore('/x/bobee-state.json', { now: () => d, fs });
    store.patch({ jarsShown: 1 });
    store.flush();
    const writes = fs.calls.filter((c) => c[0] === 'write');
    expect(writes.length).toBe(1);
    expect(writes[0][1]).toBe('/x/bobee-state.json.tmp');
    expect(JSON.parse(writes[0][2]).jarsShown).toBe(1);
    expect(fs.calls.filter((c) => c[0] === 'rename')).toEqual([
      ['rename', '/x/bobee-state.json.tmp', '/x/bobee-state.json'],
    ]);
  });

  it('flush creates the folder first, in case this is the first run', () => {
    const fs = fakeFs();
    const store = createStore('/x/bobee-state.json', { now: () => d, fs });
    store.patch({ jarsShown: 1 });
    store.flush();
    const i = fs.calls.findIndex((c) => c[0] === 'mkdir');
    expect(i).toBeGreaterThanOrEqual(0);
    expect(fs.calls[i][2]).toEqual({ recursive: true });
    expect(i).toBeLessThan(fs.calls.findIndex((c) => c[0] === 'write'));
  });

  it('flush writes only when something changed', () => {
    const fs = fakeFs();
    const store = createStore('/x/s.json', { now: () => d, fs });
    store.flush();
    expect(fs.calls.some((c) => c[0] === 'write')).toBe(false);
    store.patch({ outfits: false });
    store.flush();
    store.flush();
    expect(fs.calls.filter((c) => c[0] === 'write').length).toBe(1);
  });

  it('keeps going when the write fails', () => {
    const fs = fakeFs();
    fs.writeFileSync = () => {
      throw new Error('EACCES');
    };
    const store = createStore('/x/s.json', { now: () => d, fs });
    store.patch({ jarsShown: 2 });
    expect(() => store.flush()).not.toThrow();
    expect(store.get().jarsShown).toBe(2);
  });

  it('get resets the day fields when the day changes', () => {
    let now = new Date(2026, 9, 25, 23, 0);
    const store = createStore('/x/s.json', { now: () => now, fs: fakeFs() });
    store.patch({ jarsShown: 2, said: ['morning'], happiness: 75 });
    now = new Date(2026, 9, 26, 1, 0);
    const s = store.get();
    expect(s).toMatchObject({ jarsShown: 0, said: [], happiness: 75, day: '2026-10-26' });
  });
});
