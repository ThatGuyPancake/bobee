'use strict';
const path = require('node:path');
// Bobee's saved state: mood, today's counters and settings, kept in
// bobee-state.json on this PC only. A missing or broken file means defaults.

const SAVE_DELAY_MS = 10000;
const REST = 60;
const MAX = 100;

const DEFAULT_STATE = Object.freeze({
  version: 1,
  happiness: REST,
  updatedAt: null,
  day: null,
  jarsShown: 0,
  lunchSnack: false,
  said: Object.freeze([]),
  outfits: true,
});

// Fields that belong to one day and reset when the day changes.
const DAY_FIELDS = ['jarsShown', 'lunchSnack', 'said'];

const pad = (n) => String(n).padStart(2, '0');

function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

// Type checks for each key; a value that fails its check is dropped.
const VALID = {
  version: isNum,
  happiness: isNum,
  updatedAt: (v) => v === null || (typeof v === 'string' && !Number.isNaN(Date.parse(v))),
  day: (v) => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)),
  jarsShown: (v) => Number.isInteger(v) && v >= 0,
  lunchSnack: (v) => typeof v === 'boolean',
  said: (v) => Array.isArray(v) && v.every((s) => typeof s === 'string'),
  outfits: (v) => typeof v === 'boolean',
};

// Keep only the known keys whose values have the right type.
function sanitizePatch(p) {
  const out = {};
  if (!isObj(p)) return out;
  for (const k of Object.keys(DEFAULT_STATE)) {
    if (Object.prototype.hasOwnProperty.call(p, k) && VALID[k](p[k])) out[k] = p[k];
  }
  return out;
}

function normalizeState(raw, now) {
  const s = { ...DEFAULT_STATE, said: [], ...sanitizePatch(raw) };
  s.version = 1;
  s.happiness = Math.min(MAX, Math.max(REST, s.happiness));
  s.said = [...s.said];
  const today = dayKey(now);
  if (s.day !== today) {
    for (const k of DAY_FIELDS) s[k] = k === 'said' ? [] : DEFAULT_STATE[k];
    s.day = today;
  }
  return s;
}

function createStore(file, { now = () => new Date(), fs = require('node:fs') } = {}) {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    raw = null;
  }
  let state = normalizeState(raw, now());
  let dirty = false;
  let timer = null;

  function current() {
    if (state.day !== dayKey(now())) {
      state = normalizeState(state, now());
      dirty = true;
    }
    return state;
  }

  function flush() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!dirty) return;
    const tmp = file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
      fs.renameSync(tmp, file);
      dirty = false;
    } catch (err) {
      // keep going with what's in memory
      console.warn('[bobee] could not save state:', err && err.message);
    }
  }

  return {
    get() {
      const s = current();
      return { ...s, said: [...s.said] };
    },
    patch(p) {
      state = normalizeState({ ...current(), ...sanitizePatch(p) }, now());
      dirty = true;
      if (!timer) {
        timer = setTimeout(flush, SAVE_DELAY_MS);
        timer.unref?.();
      }
      return { ...state, said: [...state.said] };
    },
    flush,
  };
}

module.exports = { DEFAULT_STATE, DAY_FIELDS, SAVE_DELAY_MS, dayKey, normalizeState, sanitizePatch, createStore };
