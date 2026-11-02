// A short attended routine, never saved as hunger or absence debt.
export function createSnack({ walk, eat, moment, cancel = () => {} }) {
  let target = null, elapsed = 0, phase = null;
  function reset() { target = null; elapsed = 0; phase = null; cancel(); }
  return {
    jar(x) { reset(); if (Number.isFinite(x)) { target = x; phase = 'waiting'; } },
    cancel: reset,
    phase: () => phase,
    tick(dt, attended, x) {
      if (!phase) return;
      if (!attended) { reset(); return; }
      elapsed += Math.max(0, dt);
      if (phase === 'waiting' && elapsed >= 30000) { phase = 'mopey'; elapsed = 0; moment('mopey'); }
      else if (phase === 'mopey' && elapsed >= 3000) { phase = 'grumpy'; elapsed = 0; walk(target); }
      else if (phase === 'grumpy' && Math.abs(x - target) <= 3) { reset(); eat(); }
    },
  };
}
