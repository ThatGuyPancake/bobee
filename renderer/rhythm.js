// A planned visit's one-off greeting. State comes fresh from the local store,
// whose daily fields reset at midnight (and after an overnight resume).
export function visitReaction(state, phase, random = Math.random) {
  if (phase === 'morning' && !state.said.includes('morning')) {
    return { group: 'morning', patch: { said: [...state.said, 'morning'] }, munch: false };
  }
  if (phase === 'lunch' && !state.lunchSnack) {
    return { group: 'lunch', patch: { lunchSnack: true }, munch: true };
  }
  if (phase === 'evening' && random() < 0.5) {
    return { group: 'evening', patch: {}, munch: false };
  }
  return null;
}
