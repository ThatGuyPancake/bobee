// A message is one bubble ("hi!") or a few bubbles shown one after another
// (["Why did the chicken cross the road?", "To get to the other side!"]).
// Internally every message is a list of strings.

export const GROUPS = ['sweet', 'jokes', 'facts'];

export const DEFAULT_MESSAGES = {
  sweet: [["you're doing great ✨"], ['drink some water 💧'], ["you've got this 💛"]],
  jokes: [['What do you call a bear with no teeth?', 'A gummy bear! 🐻']],
  facts: [['Octopuses have three hearts 🐙']],
  click: [['hehe, hi!'], ['boop!']],
  // the day's rhythm, treats and holidays: said on cue, never at random
  morning: [['good morning ☀️']],
  lunch: [['lunch time! 🥪']],
  evening: [["don't stay up too late 🌙"]],
  treat: [['ooh, snacks? 🍯']],
  yum: [['yum! 🍪']],
  full: [["I'm so full! 🐻"]],
  winter: [['brr, cozy scarf time 🧣']],
  christmas: [['Merry Christmas! 🎄']],
  newyear: [['Happy New Year! 🎉']],
  valentine: [["Happy Valentine's ❤️"]],
  easter: [['Happy Easter! 🐣']],
  spring: [['spring is here 🌸']],
  summer: [['summer vibes 😎']],
  halloween: [['boo! 🎃']],
};

export const EXTRA_GROUPS = [
  'morning', 'lunch', 'evening', 'treat', 'yum', 'full', 'winter',
  'christmas', 'newyear', 'valentine', 'easter', 'spring', 'summer', 'halloween',
];

function toItem(v) {
  if (typeof v === 'string') return v.trim() ? [v] : null;
  if (Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.trim())) {
    return [...v];
  }
  return null;
}

function toList(v) {
  if (!Array.isArray(v)) return [];
  return v.map(toItem).filter(Boolean);
}

const copyList = (list) => list.map((m) => [...m]);

function copyDefaults() {
  return Object.fromEntries(Object.entries(DEFAULT_MESSAGES).map(([k, list]) => [k, copyList(list)]));
}

export function parseMessages(text) {
  if (text == null) return copyDefaults();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.warn('Bobee: could not parse messages, using defaults:', err.message);
    return copyDefaults();
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return copyDefaults();

  const out = {
    // older files used "random"; treat those as sweet messages
    sweet: [...toList(data.sweet), ...toList(data.random)],
    jokes: toList(data.jokes),
    facts: toList(data.facts),
  };
  // each extra group comes from the file if it's valid, else its default
  const extras = Object.fromEntries(
    EXTRA_GROUPS.map((g) => {
      const list = toList(data[g]);
      return [g, list.length ? list : copyList(DEFAULT_MESSAGES[g])];
    })
  );
  if (GROUPS.every((g) => out[g].length === 0)) return { ...copyDefaults(), ...extras };
  const click = toList(data.click);
  out.click = click.length ? click : [...out.sweet, ...out.jokes, ...out.facts];
  return { ...out, ...extras };
}

const keyOf = (item) => JSON.stringify(item);

function makeNext(list, rand) {
  let last = null;
  return () => {
    if (new Set(list.map(keyOf)).size === 1) return list[0];
    let v;
    do {
      v = list[Math.floor(rand() * list.length)];
    } while (keyOf(v) === last);
    last = keyOf(v);
    return v;
  };
}

export function createPicker(messages, random = Math.random) {
  const groups = GROUPS.filter((g) => messages[g] && messages[g].length);
  const next = Object.fromEntries(groups.map((g) => [g, makeNext(messages[g], random)]));
  const named = new Map(); // pickers for next(group), made on first use
  return {
    // Pick a group first so each kind comes up about equally often. A happy
    // Bobee gives sweet extra weight (sweetWeight 2: twice each other group).
    nextRandom({ sweetWeight = 1 } = {}) {
      const weights = groups.map((g) => (g === 'sweet' ? Math.max(0, sweetWeight) : 1));
      let r = random() * weights.reduce((a, b) => a + b, 0);
      let i = 0;
      while (i < groups.length - 1 && r >= weights[i]) r -= weights[i++];
      return next[groups[i]]();
    },
    nextClick: makeNext(messages.click, random),
    // A line from one group (morning, yum, christmas...), or null if there's none.
    next(group) {
      if (!named.has(group)) {
        const own = Object.hasOwn(messages, group) ? messages[group] : null;
        const list = own && own.length ? own : Object.hasOwn(DEFAULT_MESSAGES, group) ? DEFAULT_MESSAGES[group] : null;
        if (!list || !list.length) return null;
        named.set(group, makeNext(list, random));
      }
      return named.get(group)();
    },
  };
}
