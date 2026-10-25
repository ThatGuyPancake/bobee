// Petting: moving the mouse back and forth over Bobee. Fed pointer samples,
// it reports a pet when the horizontal direction has changed `minTurns` times
// within the last `windowMs`, every stroke covering at least `minStroke` px,
// with no mouse button held. Pure: no DOM or Electron.

export function createPetting({ windowMs = 1500, minTurns = 3, minStroke = 6, cooldownMs = 4000 } = {}) {
  let samples = []; // { x, t }, oldest first
  let lastPet = -Infinity;

  // Direction changes in the samples. A stroke only counts once it has
  // travelled minStroke px, so a twitch of a pixel or two isn't a turn.
  function turns() {
    let dir = 0;
    let ext = samples[0].x; // the far end of the current stroke
    let n = 0;
    for (const { x } of samples) {
      if (dir === 0) {
        if (Math.abs(x - ext) >= minStroke) {
          dir = Math.sign(x - ext);
          ext = x;
        }
      } else if ((x - ext) * dir > 0) {
        ext = x;
      } else if ((ext - x) * dir >= minStroke) {
        n++;
        dir = -dir;
        ext = x;
      }
    }
    return n;
  }

  return {
    sample(x, t, overBobee, buttonDown) {
      if (!overBobee || buttonDown) {
        samples = [];
        return false;
      }
      samples.push({ x, t });
      while (samples.length && samples[0].t < t - windowMs) samples.shift();
      if (t - lastPet < cooldownMs || turns() < minTurns) return false;
      lastPet = t;
      samples = [];
      return true;
    },
    reset() {
      samples = [];
    },
  };
}

// Which strip a pet plays: asleep he smiles in his sleep and stays asleep.
export function petMoment(state) {
  return state === 'home' || state === 'sleep' ? 'sleep-pet' : 'pet';
}
