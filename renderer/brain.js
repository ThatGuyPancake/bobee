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
// Visits: Bobee is usually off screen and pops in for short visits. Each
// visit lasts at most VISIT_MAX_MS, and he is visible at most
// VISIT_BUDGET_MS per hour of active screen time. While the screen is idle
// (sleep) or paused he is always shown, and that time does not count.
const HOUR_MS = 60 * 60 * 1000;
const VISIT_BUDGET_MS = 5 * 60 * 1000;
const VISIT_MIN_MS = 60 * 1000;
const VISIT_MAX_MS = 5 * 60 * 1000;
const VISIT_GAP_MIN_MS = 10 * 60 * 1000;
const VISIT_GAP_MAX_MS = 40 * 60 * 1000;
const WAKE_GRACE_MS = 5 * 1000; // after waking up, he lingers this long, then leaves
const SUMMON_MS = 60 * 1000; // tray "Say something" visit

export function createBrain({
  random = Math.random,
  minX = 0,
  maxX = 0,
  x = 0,
  happyMs = 750,
  visits = true,
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
  let hourClock = 0; // active screen time into the current hour
  let visibleUsed = 0; // visit time used in the current hour
  let present = true; // on screen at all
  let onVisit = false; // present because of a visit (vs. sleep/pause/grace)
  let visitLeft = 0;
  let graceLeft = 0;
  let nextVisitIn = 0; // active screen time until the next visit
  let pendingRandom = false; // a random bubble came due while he was away
  let jumpTo = null; // where to reappear, reported once

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

  function leave() {
    present = false;
    onVisit = false;
    state = 'away';
    nextVisitIn = rand(VISIT_GAP_MIN_MS, VISIT_GAP_MAX_MS);
  }

  // Reappear at a random spot. visitMs > 0 starts a counted visit.
  function appear(visitMs) {
    jumpTo = clamp(lo + random() * (hi - lo));
    px = jumpTo;
    target = px;
    present = true;
    onVisit = visitMs > 0;
    visitLeft = visitMs;
    graceLeft = 0;
    enterIdle();
  }

  function startVisit() {
    const left = VISIT_BUDGET_MS - visibleUsed;
    if (left < VISIT_MIN_MS) {
      // budget spent: try again early in the next hour
      nextVisitIn = HOUR_MS - hourClock + rand(0, VISIT_GAP_MIN_MS);
      return;
    }
    appear(Math.min(rand(VISIT_MIN_MS, VISIT_MAX_MS), left));
  }

  // He starts with a hello visit, so she sees him when the app launches.
  if (visits) {
    onVisit = true;
    visitLeft = Math.min(rand(VISIT_MIN_MS, VISIT_MAX_MS), VISIT_BUDGET_MS);
  }

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
        // paused: always shown, frozen, not counted
        if (!present) appear(0);
        else if (state !== 'idle') enterIdle();
      } else {
        const screenIdle = systemIdle >= SLEEP_IDLE_S;
        if (!screenIdle) {
          hourClock += dt;
          if (hourClock >= HOUR_MS) {
            hourClock -= HOUR_MS;
            visibleUsed = 0;
          }
        }

        if (visits) {
          if (screenIdle) {
            if (!present) appear(0); // always show him while the screen is idle
          } else if (present && state !== 'sleep') {
            if (onVisit) {
              visibleUsed += dt;
              visitLeft -= dt;
              if (visitLeft <= 0) leave();
            } else {
              if (graceLeft <= 0) graceLeft = WAKE_GRACE_MS;
              graceLeft -= dt;
              if (graceLeft <= 0) leave();
            }
          } else if (!present) {
            nextVisitIn -= dt;
            if (nextVisitIn <= 0) startVisit();
          }
        }

        if (state === 'sleep') {
          if (!screenIdle) enterIdle();
        } else if (screenIdle) {
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
            pendingRandom = true;
            resetRandomTimer();
          }
        }
        // only talk while he's on screen and awake
        if (pendingRandom && present && state !== 'sleep') {
          pendingRandom = false;
          bubbles.push('random');
        }
      }

      const jump = jumpTo;
      jumpTo = null;
      return {
        state,
        animation: animationFor(),
        facing,
        dx,
        visible: present,
        jumpTo: jump,
        bubble: bubbles.length ? bubbles.shift() : null,
      };
    },

    keyPulse() {
      if (paused || state === 'drag') return;
      if (state === 'away') {
        wake();
        return;
      }
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
      if (paused || wasSleep || state === 'sleep') {
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

    // Tray "Say something": bring him over for a short visit if he's away.
    summon() {
      if (!present) appear(SUMMON_MS);
    },

    setPaused(p) {
      paused = !!p;
      if (paused) bubbles.length = 0;
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
