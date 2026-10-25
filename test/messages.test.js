import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_MESSAGES, EXTRA_GROUPS, parseMessages, createPicker } from '../renderer/messages.js';

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

describe('extra groups (rhythm, treats, holidays)', () => {
  it('lists the 14 extra groups', () => {
    expect(EXTRA_GROUPS).toEqual([
      'morning', 'lunch', 'evening', 'treat', 'yum', 'full', 'winter',
      'christmas', 'newyear', 'valentine', 'easter', 'spring', 'summer', 'halloween',
    ]);
  });

  it('has the exact default lines', () => {
    const want = {
      morning: 'good morning ☀️',
      lunch: 'lunch time! 🥪',
      evening: "don't stay up too late 🌙",
      treat: 'ooh, snacks? 🍯',
      yum: 'yum! 🍪',
      full: "I'm so full! 🐻",
      winter: 'brr, cozy scarf time 🧣',
      christmas: 'Merry Christmas! 🎄',
      newyear: 'Happy New Year! 🎉',
      valentine: "Happy Valentine's ❤️",
      easter: 'Happy Easter! 🐣',
      spring: 'spring is here 🌸',
      summer: 'summer vibes 😎',
      halloween: 'boo! 🎃',
    };
    for (const [g, line] of Object.entries(want)) expect(DEFAULT_MESSAGES[g]).toEqual([[line]]);
  });

  it('an older file without the new groups gets the defaults, the rest unchanged', () => {
    const m = parseMessages('{"sweet":["hi"]}');
    expect(m.morning).toEqual([['good morning ☀️']]);
    for (const g of EXTRA_GROUPS) expect(m[g]).toEqual(DEFAULT_MESSAGES[g]);
    expect(m.sweet).toEqual([['hi']]);
    expect(m.jokes).toEqual([]);
    expect(m.facts).toEqual([]);
    expect(m.click).toEqual([['hi']]);
  });

  it('keeps a valid group from the file', () => {
    expect(parseMessages('{"sweet":["a"],"yum":["nom"]}').yum).toEqual([['nom']]);
  });

  it('a broken group falls back to its default', () => {
    const m = parseMessages('{"sweet":["a"],"yum":5,"full":[""]}');
    expect(m.yum).toEqual(DEFAULT_MESSAGES.yum);
    expect(m.full).toEqual(DEFAULT_MESSAGES.full);
  });

  it('the new groups stay out of random bubbles and click lines', () => {
    const m = parseMessages('{"sweet":["a"],"morning":["gm"]}');
    expect(m.click).toEqual([['a']]);
    const p = createPicker(m);
    for (let i = 0; i < 50; i++) expect(p.nextRandom()).toEqual(['a']);
  });
});

describe('picker.next and weighted sweet', () => {
  it('next(group) picks from that group', () => {
    const p = createPicker(parseMessages(null));
    expect(p.next('full')).toEqual(["I'm so full! 🐻"]);
    expect(p.next('morning')).toEqual(['good morning ☀️']);
  });

  it('next(group) uses the default for a group the messages lack', () => {
    const p = createPicker({ sweet: [['a']], click: [['a']] });
    expect(p.next('yum')).toEqual(['yum! 🍪']);
    expect(p.next('nope')).toBe(null);
  });

  it('sweetWeight 2 makes sweet twice as likely as each other group', () => {
    const seq = [0, 0.25, 0.5, 0.75];
    let i = 0;
    const random = () => seq[i++ % seq.length];
    const p = createPicker({ sweet: [['s']], jokes: [['j']], facts: [['f']], click: [['c']] }, random);
    const got = [0, 1, 2, 3].map(() => p.nextRandom({ sweetWeight: 2 })[0]);
    expect(got).toEqual(['s', 's', 'j', 'f']);
  });

  it('without a weight, 0.4 lands on jokes; with sweetWeight 2 it lands on sweet', () => {
    const p = createPicker({ sweet: [['s']], jokes: [['j']], facts: [['f']], click: [['c']] }, () => 0.4);
    expect(p.nextRandom()[0]).toBe('j');
    expect(p.nextRandom({ sweetWeight: 1 })[0]).toBe('j');
    expect(p.nextRandom({ sweetWeight: 2 })[0]).toBe('s');
  });
});
