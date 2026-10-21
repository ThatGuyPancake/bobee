// A message is one bubble ("hi!") or a few bubbles shown one after another
// (["Why did the chicken cross the road?", "To get to the other side!"]).
// Internally every message is a list of strings.

export const GROUPS = ['sweet', 'jokes', 'facts'];

export const DEFAULT_MESSAGES = {
  sweet: [["you're doing great ✨"], ['drink some water 💧'], ["you've got this 💛"]],
  jokes: [['What do you call a bear with no teeth?', 'A gummy bear! 🐻']],
  facts: [['Octopuses have three hearts 🐙']],
  click: [['hehe, hi!'], ['boop!']],
};

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

function copyDefaults() {
  return Object.fromEntries(
    Object.entries(DEFAULT_MESSAGES).map(([k, list]) => [k, list.map((m) => [...m])])
  );
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
  if (GROUPS.every((g) => out[g].length === 0)) return copyDefaults();
  const click = toList(data.click);
  out.click = click.length ? click : [...out.sweet, ...out.jokes, ...out.facts];
  return out;
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
  return {
    // Pick a group first so each kind comes up about equally often.
    nextRandom() {
      const g = groups[Math.floor(random() * groups.length)];
      return next[g]();
    },
    nextClick: makeNext(messages.click, random),
  };
}
