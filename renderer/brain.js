import { walkSpeedFactor } from './motion.js';

const WALK_SPEED = 40; // px/s
const EXIT_SPEED = 60; // px/s, a bit quicker when heading off screen
const IDLE_MIN = 3000;
const IDLE_MAX = 8000;
const WALK_CHANCE = 0.7;
const SIP_CHANCE = 0.2; // when an idle spell ends and he doesn't walk, he sometimes sips his coffee
const SLEEP_IDLE_S = 120;
const DRAG_THRESHOLD = 4;
const TYPING_END_MS = 3000;
const TYPING_HAPPY_EVERY = 30;
const TYPING_HAPPY_MS = 1000;
const ONFIRE_STREAK = 300;
const ONFIRE_COOLDOWN_MS = 30 * 60 * 1000;
const RANDOM_MIN_MS = 20 * 60 * 1000;
const RANDOM_MAX_MS = 40 * 60 * 1000;
// Visits: Bobee is usually off screen. Each hour of active screen time gets
// VISITS_PER_HOUR evenly spaced visits, each nudged later by up to
// VISIT_JITTER_MS so it doesn't feel mechanical; he's never gone long. Visits last VISIT_MIN_MS to
// VISIT_MAX_MS (walking on and off included) and add up to at most
// VISIT_BUDGET_MS per hour. While the screen is idle (sleep) or paused he is
// always shown, and that time does not count.
const HOUR_MS = 60 * 60 * 1000;
const VISITS_PER_HOUR = 6;
const VISIT_BUDGET_MS = 10 * 60 * 1000;
const VISIT_MIN_MS = 85 * 1000;
const VISIT_MAX_MS = 100 * 1000;
const VISIT_JITTER_MS = 2 * 60 * 1000;
// On a visit he says something soon after arriving, then every so often.
const TALK_FIRST_MIN_MS = 2 * 1000;
const TALK_FIRST_MAX_MS = 4 * 1000;
const TALK_MIN_MS = 30 * 1000;
const TALK_MAX_MS = 45 * 1000;
const WAKE_GRACE_MS = 5 * 1000; // after a nap-only appearance, linger, then leave
const SUMMON_MS = 60 * 1000; // tray "Say something" visit

const MOVING = new Set(['walk', 'enter', 'exit']);
const PASSING = new Set(['enter', 'exit']); // walking on or off screen
const TIMED = new Set(['happy', 'wave', 'sip']); // short one-off moments, then back to idle

export function createBrain({
  random = Math.random,
  minX = 0,
  maxX = 0,
  x = 0,
  happyMs = 750,
  // the new moments last one or two plays of their strip; 0 turns a moment off
  waveMs = 0, // waves hello when he arrives on a visit or is greeted
  sipMs = 0, // sips his coffee now and then while idle
  yawnMs = 0, // yawns before falling asleep
  visits = true,
  margin = 0, // how far past the bounds counts as fully off screen
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
  let visibleUsed = 0; // visible time used in the current hour
  let plan = []; // this hour's visits: { start, dur } in hourClock ms
  let planIdx = 0;
  let present = true; // on screen at all
  let onVisit = false; // present because of a visit (vs. nap/pause)
  let visitLeft = 0;
  let graceLeft = 0;
  let pendingRandom = false; // a random bubble came due while he was away
  let talkTimer = 0; // on a visit: time until he says something
  let jumpTo = null; // where to teleport the window, reported once
  let moveFrom = px; // where the current walk started, for easing
  let moveState = null;

  const rand = (a, b) => a + random() * (b - a);
  const clamp = (v) => Math.min(hi, Math.max(lo, v));
  const clampWide = (v) => Math.min(hi + margin, Math.max(lo - margin, v));

  function enterIdle() {
    state = 'idle';
    stateTimer = rand(IDLE_MIN, IDLE_MAX);
  }

  // a timed moment (wave, sip); skipped when its duration is 0
  function startMoment(name, ms) {
    if (ms > 0) {
      state = name;
      stateTimer = ms;
    } else enterIdle();
  }

  // the screen went idle: yawn first, then sleep
  function startSleep() {
    if (yawnMs > 0) {
      state = 'yawn';
      stateTimer = yawnMs;
    } else state = 'sleep';
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

  function makePlan(withHello) {
    const slot = HOUR_MS / VISITS_PER_HOUR;
    const out = [];
    for (let i = 0; i < VISITS_PER_HOUR; i++) {
      const dur = rand(VISIT_MIN_MS, VISIT_MAX_MS);
      const start = withHello && i === 0 ? 0 : i * slot + rand(0, VISIT_JITTER_MS);
      out.push({ start, dur });
    }
    return out;
  }

  // Nearest point fully off screen.
  function exitTarget() {
    return px - lo <= hi - px ? lo - margin : hi + margin;
  }

  function exitMs() {
    return (Math.abs(exitTarget() - px) / EXIT_SPEED) * 1000;
  }

  // Start walking off screen.
  function leave() {
    target = exitTarget();
    facing = target > px ? 'right' : 'left';
    state = 'exit';
  }

  function gone() {
    present = false;
    onVisit = false;
    state = 'away';
  }

  // Walk on from a random edge to a random spot.
  function walkIn(visitMs) {
    const fromLeft = random() < 0.5;
    px = fromLeft ? lo - margin : hi + margin;
    jumpTo = px;
    target = clamp(lo + random() * (hi - lo));
    facing = target > px ? 'right' : 'left';
    present = true;
    onVisit = visitMs > 0;
    visitLeft = visitMs;
    graceLeft = 0;
    talkTimer = rand(TALK_FIRST_MIN_MS, TALK_FIRST_MAX_MS);
    state = 'enter';
  }

  // Appear in place right away (nobody is watching: nap or pause).
  function popIn() {
    jumpTo = clamp(lo + random() * (hi - lo));
    px = jumpTo;
    target = px;
    present = true;
    onVisit = false;
    graceLeft = 0;
    enterIdle();
  }

  function startVisit(dur) {
    const left = VISIT_BUDGET_MS - visibleUsed;
    if (left < VISIT_MIN_MS) return;
    walkIn(Math.min(dur, left));
  }

  // the end of a walk: gone if he was leaving, a wave hello if he just came on screen
  function arrive() {
    if (state === 'exit') gone();
    else if (state === 'enter') startMoment('wave', waveMs);
    else enterIdle();
  }

  function center() {
    return (lo + hi) / 2;
  }

  function faceCenter() {
    facing = px < center() ? 'right' : 'left';
  }

  function animationFor() {
    if (state === 'typing') return clock < typingHappyUntil ? 'happy' : 'idle';
    if (PASSING.has(state)) return 'walk';
    return state;
  }

  resetRandomTimer();
  enterIdle();
  if (visits) {
    // Starts off screen; the first planned visit (a hello) begins right away.
    present = false;
    state = 'away';
    plan = makePlan(true);
  }

  function tickVisits(dt, screenIdle) {
    if (screenIdle) {
      // always show him while the screen is idle, in place, to nap
      if (!present || PASSING.has(state)) popIn();
      return;
    }
    if (present && state !== 'sleep') visibleUsed += dt;

    const due = planIdx < plan.length && hourClock >= plan[planIdx].start;
    if (!present) {
      if (due) startVisit(plan[planIdx++].dur);
      return;
    }
    if (state === 'sleep' || state === 'exit' || state === 'drag') return;
    if (onVisit) {
      if (due) planIdx++; // already here; skip that slot
      visitLeft -= dt;
      if (px >= lo && px <= hi) {
        // talk once he's fully on screen, even while still walking in
        talkTimer -= dt;
        if (talkTimer <= 0) {
          bubbles.push('random');
          talkTimer = rand(TALK_MIN_MS, TALK_MAX_MS);
        }
      }
      if (state !== 'enter' && visitLeft <= exitMs()) leave();
    } else if (due) {
      // a visit is due while he's lingering after a nap: make it a visit
      onVisit = true;
      visitLeft = Math.min(plan[planIdx++].dur, Math.max(0, VISIT_BUDGET_MS - visibleUsed));
      talkTimer = rand(TALK_FIRST_MIN_MS, TALK_FIRST_MAX_MS);
    } else {
      if (graceLeft <= 0) graceLeft = WAKE_GRACE_MS;
      graceLeft -= dt;
      if (graceLeft <= 0) leave();
    }
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
        if (visits && (!present || PASSING.has(state))) popIn();
        else if (state !== 'idle') enterIdle();
      } else {
        const screenIdle = systemIdle >= SLEEP_IDLE_S;
        if (!screenIdle) {
          hourClock += dt;
          if (hourClock >= HOUR_MS) {
            hourClock -= HOUR_MS;
            visibleUsed = 0;
            plan = makePlan(false);
            planIdx = 0;
          }
        }

        if (visits) tickVisits(dt, screenIdle);

        if (state === 'sleep' || state === 'yawn') {
          if (!screenIdle) enterIdle();
        } else if (screenIdle && state !== 'away') {
          startSleep();
        }

        if (!MOVING.has(state)) moveState = null;
        if (state === 'idle') {
          stateTimer -= dt;
          if (stateTimer <= 0) {
            const r = random();
            if (r < WALK_CHANCE) startWalk();
            else if (r < WALK_CHANCE + SIP_CHANCE && sipMs > 0) startMoment('sip', sipMs);
            else enterIdle();
          }
        } else if (TIMED.has(state)) {
          stateTimer -= dt;
          if (stateTimer <= 0) enterIdle();
        } else if (state === 'yawn') {
          stateTimer -= dt;
          if (stateTimer <= 0) state = 'sleep';
        } else if (state === 'typing') {
          faceCenter();
          if (clock - lastPulseAt >= TYPING_END_MS) {
            pulses = 0;
            enterIdle();
          }
        } else if (MOVING.has(state)) {
          if (state === 'walk') target = clamp(target);
          const dist = target - px;
          if (moveState !== state) {
            moveState = state;
            moveFrom = px;
          }
          // ease in and out; heading off screen he keeps his pace to the edge
          const ease = walkSpeedFactor(
            Math.abs(px - moveFrom),
            state === 'exit' ? Infinity : Math.abs(dist)
          );
          const speed = (state === 'exit' ? EXIT_SPEED : WALK_SPEED) * ease;
          const step = Math.min((speed * dt) / 1000, Math.abs(dist));
          if (Math.abs(dist) < 1e-9 || (state === 'walk' && hi - lo < 1)) {
            arrive();
          } else {
            dx = Math.sign(dist) * step;
            px += dx;
            facing = dist > 0 ? 'right' : 'left';
            if (Math.abs(target - px) < 1e-9) arrive();
          }
        }

        if (!visits && state !== 'sleep') {
          randomTimer -= dt;
          if (randomTimer <= 0) {
            pendingRandom = true;
            resetRandomTimer();
          }
        }
        // only talk while he's on screen, awake, and not leaving
        if (pendingRandom && present && state !== 'sleep' && state !== 'exit') {
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
        x: px, // where Bobee is; may be past the bounds while walking on/off
        visible: present,
        jumpTo: jump,
        bubble: bubbles.length ? bubbles.shift() : null,
      };
    },

    keyPulse() {
      if (paused || state === 'drag') return;
      if (!present || PASSING.has(state)) {
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

    // Tray "Say something": bring him over for a short visit if he's away
    // or on his way out.
    summon() {
      if (!present) walkIn(SUMMON_MS);
      else if (!paused && (state === 'idle' || state === 'walk' || state === 'sip')) startMoment('wave', waveMs); // greeted
      else if (state === 'exit') {
        onVisit = true;
        visitLeft = SUMMON_MS;
        target = clamp(lo + random() * (hi - lo));
        facing = target > px ? 'right' : 'left';
        state = 'enter';
      }
    },

    setSystemIdle(seconds) {
      systemIdle = seconds;
    },

    setPaused(p) {
      paused = !!p;
      if (paused) bubbles.length = 0;
    },

    setBounds(a, b) {
      lo = a;
      hi = Math.max(a, b);
      if (state === 'exit') target = exitTarget();
      else if (state === 'enter') target = clamp(target);
      if (PASSING.has(state) || state === 'away') px = clampWide(px);
      else {
        px = clamp(px);
        target = clamp(target);
      }
    },

    setX(v) {
      px = clampWide(v);
    },
  };
}
