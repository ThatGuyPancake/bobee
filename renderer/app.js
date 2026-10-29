import { parseMessages, createPicker } from './messages.js';
import { SpritePlayer } from './sprite.js';
import { createBrain } from './brain.js';
import { createBubble } from './bubble.js';
import { createMotion, toTransform } from './motion.js';
import { createPetting, petMoment } from './petting.js';
import { createTreatReaction } from './treats.js';
import { visitReaction } from './rhythm.js';
import { createMood, phaseOf } from './mood.js';
import { outfitFor, createOutfitLayer } from './outfits.js';

// strips with lettering (the sleep Zs), which must not be mirrored
const NO_MIRROR = new Set(['sleep', 'yawn', 'sleep-peek', 'sleep-pet']);

async function fetchText(url) {
  try {
    const r = await fetch(url);
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}

async function main() {
  const canvas = document.getElementById('bobee');
  const bubbleEl = document.getElementById('bubble');
  const wrap = document.getElementById('sprite-wrap');
  let paused = false; // Pause in the tray hides him completely

  // The clock. In dev builds BOBEE_DATE sets a pretend start time, which then
  // runs on at normal speed.
  const config = (await window.bobee.getConfig()) || {};
  const debugStart = config.debugDate ? new Date(config.debugDate) : null;
  const debugAt = performance.now();
  const useDebug = !!debugStart && !Number.isNaN(debugStart.getTime());
  if (config.debugDate && !useDebug) console.warn('[bobee] BOBEE_DATE is not a date:', config.debugDate);
  const now = () => (useDebug ? new Date(debugStart.getTime() + (performance.now() - debugAt)) : new Date());

  const savedState = await window.bobee.getState();
  const mood = createMood(savedState, Date.now());
  let lastSavedMood = savedState.happiness;
  function saveMood() {
    const snapshot = mood.snapshot(Date.now());
    lastSavedMood = snapshot.happiness;
    window.bobee.patchState(snapshot);
  }
  function addMood(kind) {
    mood.add(kind, Date.now());
    brain.setMood(mood.level(Date.now()));
    saveMood();
  }

  const picker = createPicker(parseMessages(await fetchText('/messages.json')));
  let fps = {};
  const spritesText = await fetchText('/assets/bobee/sprites.json');
  if (spritesText) {
    try {
      const j = JSON.parse(spritesText);
      if (j && typeof j === 'object') fps = j.fps && typeof j.fps === 'object' ? j.fps : j;
    } catch {
      /* ignore */
    }
  }

  const player = new SpritePlayer(canvas);
  await player.load(fps);

  let outfitsEnabled = savedState.outfits;
  let outfitLayer = null;
  let outfitDay = null;
  const loadPropImage = (url) => new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
  try {
    const [anchorsText, propsText] = await Promise.all([
      fetchText('/assets/bobee/anchors.json'), fetchText('/assets/props/props.json'),
    ]);
    if (!anchorsText || !propsText) throw new Error('missing outfit metadata');
    const anchors = JSON.parse(anchorsText), props = JSON.parse(propsText);
    if (!anchors || typeof anchors !== 'object' || !props || typeof props !== 'object') throw new Error('invalid outfit metadata');
    const entries = await Promise.all(Object.keys(props).map(async name => [name, await loadPropImage('/assets/props/' + name + '.png')]));
    if (entries.some(([, image]) => !image)) throw new Error('missing outfit image');
    outfitLayer = createOutfitLayer({ anchors, props, images: Object.fromEntries(entries) });
    player.setOverlay((ctx, info) => outfitLayer.draw(ctx, info));
  } catch (error) {
    console.warn('[bobee] outfits unavailable:', error.message);
  }
  function updateOutfits(force = false) {
    const date = now(), day = date.toDateString();
    if (!force && day === outfitDay) return;
    outfitDay = day;
    outfitLayer?.set(outfitsEnabled ? outfitFor(date) : null);
  }
  updateOutfits();


  // Squash, bob, breathing, wiggle and tilt on top of the frame animations.
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motion = createMotion({ size: canvas.offsetHeight || 96, reduced: reducedQuery.matches });
  reducedQuery.addEventListener('change', (q) => motion.setReduced(q.matches));

  const bubble = createBubble(bubbleEl, { onResize: (h) => window.bobee.setHeight(h) });

  const b0 = await window.bobee.getBounds();
  let x = b0.x; // window x
  let bounds = { minX: b0.minX, maxX: b0.maxX };
  const brain = createBrain({
    minX: b0.minX,
    maxX: b0.maxX,
    x: b0.x,
    happyMs: player.durationOf('happy', 2) || 750,
    waveMs: player.durationOf('wave', 2),
    sipMs: player.durationOf('sip', 1),
    yawnMs: player.durationOf('yawn', 1),
    peekMs: player.durationOf('sleep-peek', 1),
  });

  // morning, day, night...: checked once a minute
  const updatePhase = () => {
    brain.setPhase(phaseOf(now()));
    brain.setMood(mood.level(Date.now()));
    if (Math.abs(mood.value(Date.now()) - lastSavedMood) >= 0.5) saveMood();
  };
  updatePhase();
  setInterval(updatePhase, 60 * 1000);

  // Show a message's bubbles one after another (a joke's setup, then its
  // punchline). A new message cancels the rest of the previous one.
  const PART_GAP_MS = 3500;
  let partTimers = [];
  function say(parts) {
    partTimers.forEach(clearTimeout);
    partTimers = parts.map((text, i) =>
      setTimeout(() => bubble.showMessage({ text }), i * PART_GAP_MS)
    );
  }

  function stopTalking() {
    partTimers.forEach(clearTimeout);
    partTimers = [];
    bubble.hide();
  }

  const randomLine = () => picker.nextRandom({ sweetWeight: mood.level(Date.now()) === 'content' ? 1 : 2 });
  let visitToken = 0;
  let pendingGreeting = null;
  let skipFirstRandom = false;
  async function startGreeting() {
    const token = ++visitToken;
    const state = await window.bobee.getState();
    if (token !== visitToken || paused) return;
    pendingGreeting = visitReaction({ ...state, outfits: outfitsEnabled && !!outfitLayer }, phaseOf(now()), Math.random, outfitFor(now()).messages);
    if (pendingGreeting) {
      window.bobee.patchState(pendingGreeting.patch);
      skipFirstRandom = true;
    }
  }

  function showBubble(kind) {
    if (kind === 'click') say(picker.nextClick());
    else if (kind === 'random') {
      if (skipFirstRandom) skipFirstRandom = false;
      else say(randomLine());
    }
    else if (kind === 'onfire') say(["you're on fire 🔥"]);
  }

  const treats = createTreatReaction({
    munchMs: player.durationOf('munch', 1) || 750,
    happyMs: player.durationOf('happy', 2) || 750,
    wake: () => brain.wakeHere(), moment: (name, ms) => brain.moment(name, ms),
    say: group => say(picker.next(group)), addMood: () => addMood('treat'),
  });
  window.bobee.onJar(({ event }) => {
    if (paused) return;
    if (event === 'appear' && !['home', 'sleep'].includes(lastState)) say(picker.next('treat'));
    if (event === 'empty') treats.empty();
  });
  window.bobee.onTreatEaten(() => {
    if (paused) return;
    visitToken++; pendingGreeting = null; skipFirstRandom = false;
    treats.eat(performance.now());
  });
  let lastState = 'idle';
  window.__bobee = {
    state: () => lastState, // for debugging: what he's doing right now
    now: () => now(),
    showMessage: (m) => bubble.showMessage(m),
    playOverride: (img, opts) => player.playOverride(img, opts),
  };

  let syncing = false; // true while reading the window position after a drag
  async function syncX() {
    const b = await window.bobee.getBounds();
    x = b.x;
    brain.setX(x);
  }

  window.bobee.onKeyPulse(() => brain.keyPulse());
  window.bobee.onIdle((s) => brain.setSystemIdle(s));
  window.bobee.onBounds(async (b) => {
    bounds = { minX: b.minX, maxX: b.maxX };
    brain.setBounds(b.minX, b.maxX);
    await syncX();
  });
  window.bobee.onCommand((c) => {
    if (c === 'outfits-on' || c === 'outfits-off') {
      outfitsEnabled = c === 'outfits-on';
      updateOutfits(true);
      if (!outfitsEnabled && pendingGreeting && outfitFor(now()).messages.includes(pendingGreeting.group)) {
        pendingGreeting = null;
        skipFirstRandom = false;
      }
    } else if (c === 'system-resume') {
      treats.cancel();
      visitToken++;
      pendingGreeting = null;
      skipFirstRandom = false;
      pressed = false;
      moved = false;
      grab = null;
      lastMove = null;
      petting.reset();
      stopTalking();
      brain.resumeFromSleep();
      updatePhase();
      updateOutfits(true);
      saveMood();
      // Refresh daily fields now; visit-start also reads a fresh store snapshot.
      window.bobee.getState().catch((e) => console.error('[bobee] resume state', e));
    } else if (c === 'pause') {
      paused = true;
      treats.cancel();
      visitToken++;
      pendingGreeting = null;
      skipFirstRandom = false;
      wrap.classList.add('away');
      stopTalking();
      setThrough(true);
      brain.setPaused(true); // he's put to bed at home while hidden
    } else if (c === 'resume') {
      paused = false;
      wrap.classList.remove('away');
      brain.setPaused(false);
      if (lastState !== 'home') brain.setX(bounds.maxX);
    } else if (c === 'say' && !paused) {
      brain.summon(); // wakes him for a short visit if he's asleep
      say(randomLine());
    }
  });

  // Pointer handling and click-through hit testing.
  let pressed = false;
  let moved = false;
  let grab = null; // pointer offset within the window, once known
  let clickThrough = true;
  let hovering = false;
  let lastMove = null; // { x, t } for drag speed
  const petting = createPetting();
  const setThrough = (on) => {
    if (on === clickThrough) return;
    clickThrough = on;
    window.bobee.setClickThrough(on);
  };

  function opaqueAt(e) {
    if (paused) return false;
    if (bubble.visible() && bubbleEl.contains(e.target)) return true;
    // the wrapper, not the canvas: the canvas's own motion transform would
    // shift its box around as he squashes and tilts
    const r = wrap.getBoundingClientRect();
    return player.isOpaqueAt(e.clientX - r.left, e.clientY - r.top);
  }

  window.addEventListener('mousemove', (e) => {
    if (pressed) {
      const isDrag = brain.pointerMove(e.screenX, e.screenY);
      if (isDrag && grab) {
        moved = true;
        window.bobee.moveTo(e.screenX - grab.x, e.screenY - grab.y);
        const t = performance.now();
        if (lastMove && t > lastMove.t) motion.dragVelocity((e.screenX - lastMove.x) / (t - lastMove.t));
        lastMove = { x: e.screenX, t };
      }
      return;
    }
    const over = opaqueAt(e);
    if (over && !hovering && !bubbleEl.contains(e.target)) motion.wiggle(performance.now());
    // stroking him back and forth is a pet; asleep, he smiles and sleeps on
    const onBear = over && !bubbleEl.contains(e.target);
    if (petting.sample(e.screenX, performance.now(), onBear, e.buttons !== 0)) {
      const name = petMoment(lastState);
      brain.moment(name, player.durationOf(name, 1));
      addMood('pet');
    }
    hovering = over;
    setThrough(!over);
  });

  canvas.addEventListener('mousedown', async (e) => {
    if (e.button !== 0 || !opaqueAt(e)) return;
    pressed = true;
    brain.pointerDown(e.screenX, e.screenY);
    const sx = e.screenX;
    const sy = e.screenY;
    const b = await window.bobee.getBounds();
    if (pressed) grab = { x: sx - b.x, y: sy - b.y };
  });

  window.addEventListener('mouseup', async () => {
    if (!pressed) return;
    pressed = false;
    grab = null;
    lastMove = null;
    const wasAsleep = lastState === 'home' || lastState === 'sleep';
    const result = brain.pointerUp();
    if (result === 'click' && !paused) addMood('click');
    const wasMoved = moved;
    moved = false;
    if (result === 'drag' || wasMoved) {
      syncing = true;
      window.bobee.dropToFloor();
      motion.land(performance.now());
      await syncX();
      syncing = false;
    } else if (result === 'click' && !(wasAsleep && phaseOf(now()) === 'night')) {
      motion.hop(performance.now()); // at night he only peeks, without a hop
    }
  });

  let last = performance.now();
  let lastTransform = '';
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    treats.tick(now);
    const out = brain.tick(dt);
    // The window follows Bobee; he always stays on screen.
    if (!pressed && !syncing) {
      const winX = Math.min(bounds.maxX, Math.max(bounds.minX, out.x));
      if (Math.abs(winX - x) > 0.01) {
        window.bobee.moveBy(winX - x, 0);
        x = winX;
      }
    }
    if (out.event === 'visit-start') {
      skipFirstRandom = false;
      startGreeting().catch((e) => console.error('[bobee] greeting', e));
    } else if (out.event === 'visit-end') {
      visitToken++;
      pendingGreeting = null;
      skipFirstRandom = false;
    }
    // Let the wake-up yawn and wave finish before eating or greeting.
    if (pendingGreeting && (out.state === 'idle' || out.state === 'walk')) {
      const greeting = pendingGreeting;
      pendingGreeting = null;
      if (greeting.munch) brain.moment('munch', player.durationOf('munch', 2));
      say(picker.next(greeting.group));
    }
    player.play(out.animation);
    // the sleep Zs are lettering, so don't mirror him while he yawns and sleeps
    player.setFacing(NO_MIRROR.has(out.animation) ? 'right' : out.facing);
    lastState = out.state;
    if (out.bubble && !paused && !treats.active()) showBubble(out.bubble);
    updateOutfits();
    outfitLayer?.blush(mood.level(Date.now()) !== 'content' && out.animation === 'idle' && Math.floor(now / 250) % 20 === 0);
    player.draw(now);
    const m = motion.update(now, { animation: out.animation, dx: out.dx, dragging: out.state === 'drag' });
    const tf = toTransform(m);
    if (tf !== lastTransform) {
      canvas.style.transform = tf;
      lastTransform = tf;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main().catch((e) => console.error('[bobee]', e));
