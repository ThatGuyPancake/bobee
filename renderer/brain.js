import { walkSpeedFactor } from './motion.js';
import { HOUR_MS, VISIT_BUDGET_MS, VISIT_MIN_MS, makePlan } from './visits.js';

const WALK_SPEED = 40; // px/s
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
// On a visit he says something soon after waking, then every so often.
const TALK_FIRST_MIN_MS = 2 * 1000;
const TALK_FIRST_MAX_MS = 4 * 1000;
const TALK_MIN_MS = 30 * 1000;
const TALK_MAX_MS = 45 * 1000;
const SUMMON_MS = 60 * 1000; // tray "Say something" visit
const EVENING_FACTOR = 0.7; // evening visits are shorter
// Easing at both ends of a walk makes it a little slower than distance / speed.
const WALK_EASE_SLACK_MS = 1500;
// Woken in place (a click, a drop, a treat): how long he stays up before
// heading home for a nap.
export const NAP_WAKE_MS = 60 * 1000;

// Asleep: at home in the corner, or in place where he was left.
const ASLEEP = new Set(['home', 'sleep']);
// On his way to sleep: no typing, no wandering.
const SETTLING = new Set(['homing', 'dozing']);
// While waking up he only stirs; keys don't start typing yet.
const QUIET = new Set([...ASLEEP, ...SETTLING, 'waking']);

export function createBrain({
  random = Math.random,
  minX = 0,
  maxX = 0,
  x = 0,
  happyMs = 750,
  // the moments last one or two plays of their strip; 0 turns a moment off
  waveMs = 0, // waves hello when he wakes for a visit or is greeted
  sipMs = 0, // sips his coffee now and then while idle
  yawnMs = 0, // yawns when he wakes and before he falls asleep
  peekMs = 0, // at night a click only makes him peek with one eye
  visits = true,
} = {}) {
  let lo = minX;
  let hi = Math.max(minX, maxX);
  let px = Math.min(hi, Math.max(lo, x));
  let state = 'idle';
  let facing = 'right';
  let clock = 0;
  let stateTimer = 0; // ms remaining in idle, a timed moment, waking or dozing
  let timedState = null; // the timed moment now playing (happy, wave, sip, pet...)
  let sleepMoment = null; // { name, left }: a moment played while he stays asleep
  let target = px;
  let paused = false;
  let phase = 'day';
  let mood = 'content';
  let systemIdle = 0;
  let lastPulseAt = -Infinity;
  let pulses = 0;
  let typingHappyUntil = -Infinity;
  let lastFireAt = -Infinity;
  let randomTimer = 0;
  let down = null; // { x, y } while pointer is down
  let dragging = false;
  let downWasAsleep = false;
  const bubbles = [];
  const events = [];
  let hourClock = 0; // active screen time into the current hour
  let awakeUsed = 0; // awake time used in the current hour
  let plan = []; // this hour's visits: { start, dur } in hourClock ms
  let planIdx = 0;
  let onVisit = false;
  let announced = false; // this visit reported 'visit-start', so it reports 'visit-end'
  let visitLeft = 0;
  let awakeLeft = 0; // woken in place: time until he heads home
  let talkTimer = 0; // on a visit: time until he says something
  let pendingRandom = false;
  let moveFrom = px; // where the current walk started, for easing
  let moveState = null;
  let bedIsHome = false; // dozing off in the corner (vs. where he was dropped)

  const rand = (a, b) => a + random() * (b - a);
  const clamp = (v) => Math.min(hi, Math.max(lo, v));
  const atHome = () => Math.abs(px - hi) < 1e-9;

  function enterIdle() {
    state = 'idle';
    timedState = null;
    stateTimer = rand(IDLE_MIN, IDLE_MAX);
  }

  // a timed moment, then back to idle; skipped when its duration is 0
  function startMoment(name, ms) {
    if (ms > 0) {
      state = name;
      timedState = name;
      stateTimer = ms;
    } else enterIdle();
  }

  // asleep where he stands: the corner is home, anywhere else is a nap in place
  function lieDown() {
    timedState = null;
    if (atHome()) {
      px = hi;
      state = 'home';
    } else state = 'sleep';
  }

  // yawn, then sleep
  function startDozing() {
    timedState = null;
    bedIsHome = atHome();
    if (yawnMs > 0) {
      state = 'dozing';
      stateTimer = yawnMs;
    } else lieDown();
  }

  // the walk home to the corner, then a yawn and sleep
  function goHome() {
    timedState = null;
    awakeLeft = 0;
    if (atHome()) {
      px = hi;
      startDozing();
      return;
    }
    target = hi;
    facing = target > px ? 'right' : 'left';
    state = 'homing';
  }

  // Settled in the corner: home is always the corner, wherever the window is.
  function pinnedHome() {
    return state === 'home' || (state === 'dozing' && bedIsHome);
  }

  // Straight to bed at home (Pause), ending any visit.
  function bedAtHome() {
    if (onVisit) endVisit();
    awakeLeft = 0;
    timedState = null;
    sleepMoment = null;
    px = hi;
    target = hi;
    state = 'home';
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

  // how long the walk home and the yawn take from here
  function homeMs() {
    return (Math.abs(hi - px) / WALK_SPEED) * 1000 + (atHome() ? 0 : WALK_EASE_SLACK_MS) + yawnMs;
  }

  function endVisit() {
    if (announced) events.push('visit-end');
    onVisit = false;
    announced = false;
    visitLeft = 0;
  }

  function beginVisit(ms) {
    onVisit = true;
    announced = true;
    visitLeft = ms;
    awakeLeft = 0;
    talkTimer = rand(TALK_FIRST_MIN_MS, TALK_FIRST_MAX_MS);
    events.push('visit-start');
  }

  // A planned visit: he wakes where he is, yawns, then waves hello.
  function startVisit(dur) {
    const left = VISIT_BUDGET_MS - awakeUsed;
    if (left < VISIT_MIN_MS) return;
    sleepMoment = null;
    beginVisit(Math.min(dur, left));
    timedState = null;
    if (yawnMs > 0) {
      state = 'waking';
      stateTimer = yawnMs;
    } else startMoment('wave', waveMs);
  }

  // Wake up right where he is, for NAP_WAKE_MS (unless he's on a visit).
  function wakeHere() {
    sleepMoment = null;
    if (ASLEEP.has(state) || SETTLING.has(state) || state === 'waking') enterIdle();
    if (visits && !onVisit) awakeLeft = NAP_WAKE_MS;
  }

  // A timed animation. Asleep, he stays asleep and goes on sleeping after it;
  // otherwise he goes back to idle.
  function playMoment(name, ms) {
    if (state === 'drag' || dragging || paused || !(ms > 0)) return;
    if (ASLEEP.has(state)) sleepMoment = { name, left: ms };
    else {
      sleepMoment = null;
      startMoment(name, ms);
    }
  }

  function faceCenter() {
    facing = px < (lo + hi) / 2 ? 'right' : 'left';
  }

  function animationFor() {
    if (sleepMoment) return sleepMoment.name;
    if (state === 'typing') return clock < typingHappyUntil ? 'happy' : 'idle';
    if (state === 'home') return 'sleep';
    if (state === 'homing') return 'walk';
    if (state === 'waking' || state === 'dozing') return 'yawn';
    return state;
  }

  resetRandomTimer();
  enterIdle();
  if (visits) {
    // He starts asleep in the corner; the first visit comes within a few minutes.
    px = hi;
    target = hi;
    state = 'home';
    plan = makePlan(random, false);
  }

  function tickVisits(dt, screenIdle) {
    const asleep = ASLEEP.has(state);
    if (screenIdle) {
      // nobody's watching: any visit ends and he heads home for a nap
      if (!asleep && !SETTLING.has(state) && state !== 'drag') {
        endVisit();
        goHome();
      }
      return;
    }
    if (!asleep) awakeUsed += dt;

    const due = planIdx < plan.length && hourClock >= plan[planIdx].start;
    if (due && phase === 'night') {
      planIdx++; // no visits at night
      return;
    }
    if (asleep) {
      if (due) startVisit(plan[planIdx++].dur);
      return;
    }
    if (state === 'drag' || SETTLING.has(state)) return; // a due visit waits until he's asleep
    if (onVisit) {
      if (due) planIdx++; // already here; skip that slot
      visitLeft -= dt;
      if (state !== 'waking') {
        talkTimer -= dt;
        if (talkTimer <= 0) {
          bubbles.push('random');
          talkTimer = rand(TALK_MIN_MS, TALK_MAX_MS);
        }
      }
      // a moment playing (a pet, a sip) finishes before he heads home
      if (state !== 'waking' && state !== timedState && visitLeft <= homeMs()) {
        endVisit();
        goHome();
      }
    } else if (due) {
      // a visit came due while he was awake anyway: make it a visit
      beginVisit(Math.min(plan[planIdx++].dur, Math.max(0, VISIT_BUDGET_MS - awakeUsed)));
    } else {
      awakeLeft -= dt;
      if (awakeLeft <= 0 && state !== timedState) goHome();
    }
  }

  return {
    tick(dtMs) {
      const dt = Math.max(0, dtMs);
      clock += dt;
      let dx = 0;

      if (sleepMoment && state !== 'drag') {
        sleepMoment.left -= dt;
        if (sleepMoment.left <= 0) sleepMoment = null;
      }

      if (state === 'drag') {
        // stays until pointerUp
      } else if (paused) {
        // paused: hidden, asleep at home (or idle without visits), nothing counted
      } else {
        const screenIdle = systemIdle >= SLEEP_IDLE_S;
        if (!screenIdle) {
          hourClock += dt;
          if (hourClock >= HOUR_MS) {
            hourClock -= HOUR_MS;
            awakeUsed = 0;
            plan = makePlan(random, false, phase === 'evening' ? EVENING_FACTOR : 1);
            planIdx = 0;
          }
        }

        if (visits) tickVisits(dt, screenIdle);
        else if (ASLEEP.has(state) || state === 'dozing') {
          if (!screenIdle) enterIdle(); // without visits he wakes when you come back
        } else if (screenIdle) startDozing();

        if (state !== 'walk' && state !== 'homing') moveState = null;
        if (state === 'idle') {
          stateTimer -= dt;
          if (stateTimer <= 0) {
            const r = random();
            const sip = sipMs > 0 ? (phase === 'morning' ? 0.4 : SIP_CHANCE) : 0;
            const happy = mood !== 'content' && happyMs > 0 ? 0.1 : 0;
            const wave = mood === 'overjoyed' && waveMs > 0 ? 0.05 : 0;
            const yawn = phase === 'evening' && yawnMs > 0 ? 0.1 : 0;
            // Extras first use the idle share, then trim walking if needed.
            const walk = Math.min(phase === 'morning' ? 0.5 : WALK_CHANCE, 1 - sip - happy - wave - yawn);
            if (r < walk) startWalk();
            else if (r < walk + sip) startMoment('sip', sipMs);
            else if (r < walk + sip + happy) startMoment('happy', happyMs);
            else if (r < walk + sip + happy + wave) startMoment('wave', waveMs);
            else if (r < walk + sip + happy + wave + yawn) startMoment('yawn', yawnMs);
            else enterIdle();
          }
        } else if (state === timedState) {
          stateTimer -= dt;
          if (stateTimer <= 0) enterIdle();
        } else if (state === 'waking') {
          stateTimer -= dt;
          if (stateTimer <= 0) startMoment('wave', waveMs);
        } else if (state === 'dozing') {
          stateTimer -= dt;
          if (stateTimer <= 0) lieDown();
        } else if (state === 'typing') {
          faceCenter();
          if (clock - lastPulseAt >= TYPING_END_MS) {
            pulses = 0;
            enterIdle();
          }
        } else if (state === 'walk' || state === 'homing') {
          if (state === 'walk') target = clamp(target);
          else target = hi;
          const dist = target - px;
          if (moveState !== state) {
            moveState = state;
            moveFrom = px;
          }
          const ease = walkSpeedFactor(Math.abs(px - moveFrom), Math.abs(dist));
          const step = Math.min((WALK_SPEED * ease * dt) / 1000, Math.abs(dist));
          const arrive = () => (state === 'homing' ? startDozing() : enterIdle());
          if (Math.abs(dist) < 1e-9 || (state === 'walk' && hi - lo < 1)) {
            arrive();
          } else {
            dx = Math.sign(dist) * step;
            px += dx;
            facing = dist > 0 ? 'right' : 'left';
            if (Math.abs(target - px) < 1e-9) {
              px = target;
              arrive();
            }
          }
        }

        if (!visits && !ASLEEP.has(state)) {
          randomTimer -= dt;
          if (randomTimer <= 0) {
            pendingRandom = true;
            resetRandomTimer();
          }
        }
        // only talk while he's awake
        if (pendingRandom && !QUIET.has(state)) {
          pendingRandom = false;
          bubbles.push('random');
        }
      }

      return {
        state,
        animation: animationFor(),
        facing,
        dx,
        x: px,
        visible: true, // he never leaves the screen; Pause hides the window instead
        event: events.length ? events.shift() : null,
        bubble: bubbles.length ? bubbles.shift() : null,
      };
    },

    keyPulse() {
      if (paused || state === 'drag') return;
      wake();
      if (QUIET.has(state)) return; // asleep or settling: typing doesn't wake him
      if (clock - lastPulseAt >= TYPING_END_MS) pulses = 0;
      lastPulseAt = clock;
      pulses++;
      state = 'typing';
      timedState = null;
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
      downWasAsleep = ASLEEP.has(state);
    },

    pointerMove(sx, sy) {
      if (!down) return false;
      if (!dragging && Math.hypot(sx - down.x, sy - down.y) > DRAG_THRESHOLD) {
        dragging = true;
        wake();
        sleepMoment = null;
        timedState = null;
        state = 'drag';
      }
      return dragging;
    },

    pointerUp() {
      if (!down) return null;
      const wasAsleep = downWasAsleep || ASLEEP.has(state);
      const wasDrag = dragging;
      down = null;
      dragging = false;
      downWasAsleep = false;
      wake();
      if (wasDrag) {
        if (paused && visits) bedAtHome();
        else if (paused) enterIdle();
        else if (visits && phase === 'night' && !onVisit) {
          startDozing(); // back to sleep where he lands
          bedIsHome = false; // px is stale until the app's setX after the drop
        }
        else {
          enterIdle();
          if (visits && !onVisit) awakeLeft = NAP_WAKE_MS;
        }
        return 'drag';
      }
      if (paused) {
        if (!visits) enterIdle();
        return 'click';
      }
      if (wasAsleep && visits && phase === 'night') {
        playMoment('sleep-peek', peekMs);
        return 'click';
      }
      wakeHere();
      startMoment('happy', happyMs);
      bubbles.push('click');
      return 'click';
    },

    moment: playMoment,

    // Wake in place (a click, a treat, the tray): up for NAP_WAKE_MS, then home.
    wakeHere() {
      if (paused || state === 'drag') return;
      wake(); // always her doing, so she's at the PC
      wakeHere();
    },

    setMood(level) {
      mood = level;
    },

    setPhase(p) {
      phase = p;
    },

    // Tray "Say something": a short visit if he's asleep or heading to bed,
    // a wave if he's already up.
    summon() {
      if (paused || state === 'drag') return;
      wake(); // she just used the tray
      if (ASLEEP.has(state) && visits && phase === 'night') {
        playMoment('sleep-peek', peekMs); // he only peeks at night
        return;
      }
      if (ASLEEP.has(state) || SETTLING.has(state) || state === 'waking') {
        wakeHere();
        onVisit = true; // a short visit, though not a planned one: no visit events
        visitLeft = SUMMON_MS;
        awakeLeft = 0;
        talkTimer = rand(TALK_MIN_MS, TALK_MAX_MS); // the tray already says something
        startMoment('wave', waveMs);
      } else if (state === 'idle' || state === 'walk' || state === 'sip') {
        if (visits && !onVisit) awakeLeft = NAP_WAKE_MS;
        startMoment('wave', waveMs); // greeted
      }
    },

    setSystemIdle(seconds) {
      systemIdle = seconds;
    },

    // Paused he's hidden. With visits he's put to bed at home right away, so
    // Resume shows him asleep in the corner.
    setPaused(p) {
      paused = !!p;
      if (!paused) return;
      bubbles.length = 0;
      pendingRandom = false;
      sleepMoment = null;
      if (state === 'drag') return; // pointerUp settles him
      if (visits) bedAtHome();
      else enterIdle();
    },

    setBounds(a, b) {
      lo = a;
      hi = Math.max(a, b);
      px = pinnedHome() ? hi : clamp(px); // home is always the corner
      target = state === 'homing' ? hi : clamp(target);
      if (ASLEEP.has(state)) state = atHome() ? 'home' : 'sleep';
    },

    // Where the window really is (after a drop, or a resync). A bear settled
    // in the corner stays there; the window follows him.
    setX(v) {
      px = pinnedHome() ? hi : clamp(v);
      if (ASLEEP.has(state)) state = atHome() ? 'home' : 'sleep';
    },
  };
}

