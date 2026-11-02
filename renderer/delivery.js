export const REVEAL_MS = 950;
export const VIEW_MS = 20000;
export const STOW_MS = 950;

// The durable receiver owns the ID. This controller only owns its visible phases.
export function createDelivery({ done, announce, changed = () => {}, random = Math.random, reduced = () => false }) {
  let id = null, phase = 'idle', revealTimer = null, viewTimer = null, stowTimer = null;
  const setPhase = next => { phase = next; changed(next); };
  function dismiss() {
    if (!id || phase !== 'showing') return false;
    clearTimeout(viewTimer); viewTimer = null;
    setPhase('stowing');
    const completedId = id;
    const finish = () => { stowTimer = null; done(completedId); }; // Main persists before queue advance.
    if (reduced()) finish();
    else stowTimer = setTimeout(finish, STOW_MS);
    return true;
  }
  function showing() {
    setPhase('showing');
    viewTimer = setTimeout(dismiss, VIEW_MS);
  }
  return {
    show(drawing) {
      clearTimeout(revealTimer); clearTimeout(viewTimer); clearTimeout(stowTimer);
      revealTimer = viewTimer = stowTimer = null;
      id = drawing?.id || null;
      setPhase(id ? 'waiting' : 'idle');
      if (id) announce(random() < 0.5 ? 'I have something for you' : 'Special delivery');
    },
    reveal() {
      if (!id || phase !== 'waiting') return false;
      setPhase('revealing');
      if (reduced()) showing();
      else revealTimer = setTimeout(showing, REVEAL_MS);
      return true;
    },
    dismiss,
    active: () => id !== null,
    phase: () => phase,
  };
}
