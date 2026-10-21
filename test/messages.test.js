import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_MESSAGES, parseMessages, createPicker } from '../renderer/messages.js';

describe('parseMessages', () => {
  it('falls back to defaults for null', () => {
    expect(parseMessages(null)).toEqual(DEFAULT_MESSAGES);
  });
  it('falls back to defaults for invalid JSON', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseMessages('{bad')).toEqual(DEFAULT_MESSAGES);
  });
  it('falls back when every group is empty', () => {
    expect(parseMessages('{"sweet":[],"jokes":[],"facts":[]}')).toEqual(DEFAULT_MESSAGES);
  });
  it('turns strings into one-bubble messages and keeps joke pairs', () => {
    const m = parseMessages('{"sweet":["I love you"],"jokes":[["Q?","A!"]],"facts":["fact"]}');
    expect(m.sweet).toEqual([['I love you']]);
    expect(m.jokes).toEqual([['Q?', 'A!']]);
    expect(m.facts).toEqual([['fact']]);
  });
  it('drops empty or malformed entries', () => {
    const m = parseMessages('{"sweet":["", "ok", 5, [], ["a", ""]]}');
    expect(m.sweet).toEqual([['ok']]);
  });
  it('missing click uses every random message', () => {
    expect(parseMessages('{"sweet":["a"],"facts":["b"]}').click).toEqual([['a'], ['b']]);
  });
  it('still reads the old "random" list as sweet messages', () => {
    expect(parseMessages('{"random":["hi"]}').sweet).toEqual([['hi']]);
  });
});

describe('createPicker', () => {
  it('never repeats consecutively within a group', () => {
    const p = createPicker({ sweet: [['a'], ['b'], ['c']], click: [['x'], ['y']] });
    let last = null;
    for (let i = 0; i < 200; i++) {
      const v = p.nextRandom()[0];
      expect(v).not.toBe(last);
      last = v;
    }
  });
  it('handles a single-item list', () => {
    const p = createPicker({ sweet: [['only']], click: [['only']] });
    expect([p.nextRandom(), p.nextRandom()]).toEqual([['only'], ['only']]);
  });
  it('gives each group a fair share even when lists differ in length', () => {
    const facts = Array.from({ length: 30 }, (_, i) => [`f${i}`]);
    const p = createPicker({ sweet: [['s1'], ['s2']], jokes: [['j']], facts, click: [['c']] });
    const n = { s: 0, j: 0, f: 0 };
    for (let i = 0; i < 3000; i++) n[p.nextRandom()[0][0]]++;
    for (const k of ['s', 'j', 'f']) expect(n[k]).toBeGreaterThan(800);
  });
});
