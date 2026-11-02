import { it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { makePlan } from '../renderer/visits.js';
import { createBrain } from '../renderer/brain.js';
const require = createRequire(import.meta.url);
const { normalizeState } = require('../lib/store');
it('preserves validated settings across days and rejects invalid settings', () => {
  const s = normalizeState({ activeMinutes: 30, restMode: 'home', paused: true, displayId: 2, breakMinutes: 50, quietHours: true }, new Date());
  expect(s).toMatchObject({ activeMinutes: 30, restMode: 'home', paused: true, displayId: 2, breakMinutes: 50, quietHours: true });
  expect(normalizeState({ activeMinutes: 61, restMode: 'bad' }, new Date())).toMatchObject({ activeMinutes: 10, restMode: 'sleep' });
});
it('scales visit plans to the selected budget', () => {
  expect(makePlan(() => 1, false, 1, 0)).toEqual([]);
  expect(makePlan(() => 1, false, 1, 30).reduce((n, p) => n + p.dur, 0)).toBeLessThanOrEqual(30 * 60000);
  expect(makePlan(() => 1, false, 1, 30).reduce((n, p) => n + p.dur, 0)).toBeGreaterThan(20 * 60000);
});
it('supports off/home, sleep at work, quiet hours and always', () => {
  const brain = createBrain({ minX: 0, maxX: 100, x: 50 });
  brain.setPreferences({ activeMinutes: 0, restMode: 'home', quietHours: false });
  expect(brain.tick(100).visible).toBe(false);
  brain.setPreferences({ restMode: 'sleep' });
  expect(brain.tick(100)).toMatchObject({ visible: true, animation: 'sleep' });
  brain.setPreferences({ activeMinutes: 60 });
  expect(brain.tick(100).animation).not.toBe('sleep');
  brain.setPhase('night'); brain.setPreferences({ quietHours: true });
  expect(brain.tick(100).animation).toBe('sleep');
});
it('counts attended PC time for reminders and supports snooze and skip', () => {
  const { createBreaks } = require('../lib/breaks');
  const b = createBreaks();
  expect(b.tick(50 * 60000, false, 50)).toBe(false);
  expect(b.tick(50 * 60000, true, 50)).toBe(true);
  b.snooze(); expect(b.tick(9 * 60000, true, 50)).toBe(false);
  expect(b.tick(60000, true, 50)).toBe(true);
  b.skip(); expect(b.tick(60000, true, 50)).toBe(false);
});
it('applies a changed home preference to a bear already sleeping at work', () => {
  const b = createBrain({ minX: 0, maxX: 100 });
  b.setPreferences({ activeMinutes: 0, restMode: 'sleep' });
  b.pointerDown(0, 0); b.pointerMove(10, 0); b.pointerUp(); b.setX(40);
  expect(b.tick(100).state).toBe('sleep');
  b.setPreferences({ restMode: 'home' });
  let out; for (let i = 0; i < 100; i++) out = b.tick(100);
  expect(out).toMatchObject({ state: 'home', visible: false });
});
