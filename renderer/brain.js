const WALK_SPEED = 40; // px/s
const IDLE_MIN = 3000;
const IDLE_MAX = 8000;
const WALK_CHANCE = 0.7;
const SLEEP_IDLE_S = 120;
const DRAG_THRESHOLD = 4;
const TYPING_END_MS = 3000;
const TYPING_HAPPY_EVERY = 30;
const TYPING_HAPPY_MS = 1000;
const ONFIRE_STREAK = 300;
const ONFIRE_COOLDOWN_MS = 30 * 60 * 1000;
const RANDOM_MIN_MS = 20 * 60 * 1000;
const RANDOM_MAX_MS = 40 * 60 * 1000;

export function createBrain({
  random = Math.random,
  minX = 0,
  maxX = 0,
  x = 0,
  happyMs = 750,
} = {}) {
  let lo = minX;
  let hi = Math.max(minX, maxX);
  let px = Math.min(hi, Math.max(lo, x));
  let state = 'idle';
  let facing = 'right';
  let clock = 0;
  let stateTimer = 0; // ms remaining in idle/happy
  let target = px;
  let paused = false;
  let systemIdle = 0;
  let lastPulseAt = -Infinity;
  let pulses = 0;
  let typingHappyUntil = -Infinity;
  let lastFireAt = -Infinity;
  let randomTimer = 0;
  let down = null; // { x, y } while pointer is down
  let dragging = false;
  let downWasSleep = false;
  const bubbles = [];

  const rand = (a, b) => a + random() * (b - a);
  const clamp = (v) => Math.min(hi, Math.max(lo, v));

  function enterIdle() {
    state = 'idle';
    stateTimer = rand(IDLE_MIN, IDLE_MAX);
  }

  function startWalk() {
    if (hi - lo < 1) {
      enterIdle();
      return;
    }
    let t = clamp(lo + random() * (hi - lo));
    if (Math.abs(t - px) < 1) t = px - lo > hi - px ? lo : hi;
    if (Math.abs(t - px) < 1) {
      enterIdle();
      return;
    }
    target = t;
    facing = t > px ? 'right' : 'left';
    state = 'walk';
  }

  function wake() {
    systemIdle = 0;
  }

  function resetRandomTimer() {
    randomTimer = rand(RANDOM_MIN_MS, RANDOM_MAX_MS);
  }
  resetRandomTimer();
  enterIdle();

  function center() {
    return (lo + hi) / 2;
  }

  function faceCenter() {
    facing = px < center() ? 'right' : 'left';
  }

  function animationFor() {
    if (state === 'typing') return clock < typingHappyUntil ? 'happy' : 'idle';
    return state;
  }

  return {
    tick(dtMs) {
      const dt = Math.max(0, dtMs);
      clock += dt;
      let dx = 0;

      if (state === 'drag') {
        // stays until pointerUp
      } else if (paused) {
        if (state !== 'idle') enterIdle();
      } else {
        if (state === 'sleep') {
          if (systemIdle < SLEEP_IDLE_S) enterIdle();
        } else if (systemIdle >= SLEEP_IDLE_S) {
          state = 'sleep';
        }

        if (state === 'idle') {
          stateTimer -= dt;
          if (stateTimer <= 0) {
            if (random() < WALK_CHANCE) startWalk();
            else enterIdle();
          }
        } else if (state === 'happy') {
          stateTimer -= dt;
          if (stateTimer <= 0) enterIdle();
        } else if (state === 'typing') {
          faceCenter();
          if (clock - lastPulseAt >= TYPING_END_MS) {
            pulses = 0;
            enterIdle();
          }
        } else if (state === 'walk') {
          target = clamp(target);
          const dist = target - px;
          const step = Math.min(WALK_SPEED * dt / 1000, Math.abs(dist));
          if (hi - lo < 1 || Math.abs(dist) < 1e-9) {
            enterIdle();
          } else {
            dx = Math.sign(dist) * step;
            px += dx;
            facing = dist > 0 ? 'right' : 'left';
            if (Math.abs(target - px) < 1e-9) enterIdle();
          }
        }

        if (state !== 'sleep') {
          randomTimer -= dt;
          if (randomTimer <= 0) {
            bubbles.push('random');
            resetRandomTimer();
          }
        }
      }

      return {
        state,
        animation: animationFor(),
        facing,
        dx,
        bubble: bubbles.length ? bubbles.shift() : null,
      };
    },

    keyPulse() {
      if (paused || state === 'drag') return;
      wake();
      if (clock - lastPulseAt >= TYPING_END_MS) pulses = 0;
      lastPulseAt = clock;
      pulses++;
      state = 'typing';
      faceCenter();
      if (pulses % TYPING_HAPPY_EVERY === 0) typingHappyUntil = clock + TYPING_HAPPY_MS;
      if (pulses >= ONFIRE_STREAK && clock - lastFireAt >= ONFIRE_COOLDOWN_MS) {
        lastFireAt = clock;
        pulses = 0;
        bubbles.push('onfire');
      }
    },

    pointerDown(sx, sy) {
      down = { x: sx, y: sy };
      dragging = false;
      downWasSleep = state === 'sleep';
    },

    pointerMove(sx, sy) {
      if (!down) return false;
      if (!dragging && Math.hypot(sx - down.x, sy - down.y) > DRAG_THRESHOLD) {
        dragging = true;
        wake();
        state = 'drag';
      }
      return dragging;
    },

    pointerUp() {
      if (!down) return null;
      const wasSleep = downWasSleep;
      const wasDrag = dragging;
      down = null;
      dragging = false;
      downWasSleep = false;
      wake();
      if (wasDrag) {
        enterIdle();
        return 'drag';
      }
      if (wasSleep || state === 'sleep') {
        enterIdle();
      } else {
        state = 'happy';
        stateTimer = happyMs;
        bubbles.push('click');
      }
      return 'click';
    },

    setSystemIdle(seconds) {
      systemIdle = seconds;
    },

    setPaused(p) {
      paused = !!p;
    },

    setBounds(a, b) {
      lo = a;
      hi = Math.max(a, b);
      px = clamp(px);
      target = clamp(target);
    },

    setX(v) {
      px = clamp(v);
    },
  };
}
