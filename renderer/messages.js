export const DEFAULT_MESSAGES = {
  random: [
    'drink some water 💧',
    "I'm proud of you",
    "you're doing great ✨",
    'take a deep breath 🌿',
    "you've got this 💛",
  ],
  click: ['hehe, hi! 🐝', 'boop!', "you're the best ✨"],
};

const validList = (v) =>
  Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.length > 0);

export function parseMessages(text) {
  const defaults = () => ({
    random: [...DEFAULT_MESSAGES.random],
    click: [...DEFAULT_MESSAGES.click],
  });
  if (text == null) return defaults();
  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.warn('Bobee: could not parse messages, using defaults:', err.message);
    return defaults();
  }
  if (!data || typeof data !== 'object') return defaults();
  const random = validList(data.random) ? data.random : DEFAULT_MESSAGES.random;
  const click = validList(data.click) ? data.click : validList(data.random) ? data.random : DEFAULT_MESSAGES.click;
  return { random: [...random], click: [...click] };
}

function makeNext(list, rand) {
  let last = null;
  return () => {
    if (new Set(list).size === 1) return list[0];
    let v;
    do {
      v = list[Math.floor(rand() * list.length)];
    } while (v === last);
    last = v;
    return v;
  };
}

export function createPicker(messages, random = Math.random) {
  return {
    nextRandom: makeNext(messages.random, random),
    nextClick: makeNext(messages.click, random),
  };
}
