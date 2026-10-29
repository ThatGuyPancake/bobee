// Bobee's happiness and the parts of the day. No DOM, no Electron.
//
// Happiness rests at 60 and never goes lower. Pets, clicks and treats raise
// it; above 60 it settles back with a 3-hour half-life.

export const REST = 60;
const MAX = 100;
export const GAINS = { pet: 2, click: 1, treat: 8 };
export const HALF_LIFE_MS = 3 * 3600000;
// a clock jump (sleep, resume, time zone) counts as at most a day
export const MAX_ELAPSED_MS = 24 * 3600000;

const clampValue = (v) => Math.min(MAX, Math.max(REST, v));

export function settle(value, elapsedMs) {
  const t = Math.min(Math.max(0, elapsedMs), MAX_ELAPSED_MS);
  return Math.max(REST, REST + (value - REST) * 0.5 ** (t / HALF_LIFE_MS));
}

export function levelOf(v) {
  if (v >= 90) return 'overjoyed';
  if (v >= 75) return 'happy';
  return 'content';
}

// saved = { happiness, updatedAt } from bobee-state.json
export function createMood(saved, nowMs) {
  const s = saved && typeof saved === 'object' ? saved : {};
  let base = typeof s.happiness === 'number' && Number.isFinite(s.happiness) ? clampValue(s.happiness) : REST;
  const savedAt = typeof s.updatedAt === 'string' ? Date.parse(s.updatedAt) : NaN;
  let baseAt = Number.isNaN(savedAt) ? nowMs : savedAt;

  const value = (nowMs) => {
    base = settle(base, nowMs - baseAt);
    baseAt = nowMs; // consume this interval, including a capped gap or clock rollback
    return base;
  };
  value(nowMs);

  return {
    add(kind, nowMs) {
      base = Math.min(MAX, value(nowMs) + (GAINS[kind] || 0));
      baseAt = nowMs;
      return base;
    },
    value,
    level: (nowMs) => levelOf(value(nowMs)),
    snapshot: (nowMs) => ({ happiness: value(nowMs), updatedAt: new Date(nowMs).toISOString() }),
  };
}

// night 0-5, morning 6-10, day 11, lunch 12-13, day 14-19, evening 20-23
export function phaseOf(date) {
  const h = date.getHours();
  if (h < 6) return 'night';
  if (h < 11) return 'morning';
  if (h < 12) return 'day';
  if (h < 14) return 'lunch';
  if (h < 20) return 'day';
  return 'evening';
}
