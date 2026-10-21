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
  it('falls back for empty lists', () => {
    expect(parseMessages('{"random":[],"click":[]}').random).toEqual(DEFAULT_MESSAGES.random);
  });
  it('missing click falls back to random', () => {
    expect(parseMessages('{"random":["a"]}').click).toEqual(['a']);
  });
});

describe('createPicker', () => {
  it('never repeats consecutively', () => {
    const p = createPicker({ random: ['a', 'b', 'c'], click: ['x', 'y'] });
    let last = null;
    for (let i = 0; i < 200; i++) {
      const v = p.nextRandom();
      expect(v).not.toBe(last);
      last = v;
    }
  });
  it('handles a single-item list', () => {
    const p = createPicker({ random: ['only'], click: ['only'] });
    expect([p.nextRandom(), p.nextRandom(), p.nextRandom()]).toEqual(['only', 'only', 'only']);
  });
});
