import { expect, it } from 'vitest';
import { visitReaction } from '../renderer/rhythm.js';
it('greets once each morning and snacks once at lunch', () => {
  expect(visitReaction({ said: [], lunchSnack: false }, 'morning')).toEqual({ group: 'morning', patch: { said: ['morning'] }, munch: false });
  expect(visitReaction({ said: ['morning'], lunchSnack: false }, 'morning')).toBe(null);
  expect(visitReaction({ said: [], lunchSnack: false }, 'lunch')).toEqual({ group: 'lunch', patch: { lunchSnack: true }, munch: true });
  expect(visitReaction({ said: [], lunchSnack: true }, 'lunch')).toBe(null);
});
it('chooses an evening line half the time, with no greeting at night or by day', () => {
  expect(visitReaction({}, 'evening', () => 0.49).group).toBe('evening');
  expect(visitReaction({}, 'evening', () => 0.5)).toBe(null);
  expect(visitReaction({}, 'night')).toBe(null);
  expect(visitReaction({}, 'day')).toBe(null);
});
