import { parseMessages, createPicker } from './messages.js';
import { SpritePlayer } from './sprite.js';
import { createBrain } from './brain.js';
import { createBubble } from './bubble.js';
import { createMotion, toTransform } from './motion.js';

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
  let hidden = false; // true while Bobee is away on a trip

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
    // fully off screen once he has slid out of a window parked at the edge
    margin: (b0.width + canvas.offsetWidth) / 2,
  });

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

  function showBubble(kind) {
    if (kind === 'click') say(picker.nextClick());
    else if (kind === 'random') say(picker.nextRandom());
    else if (kind === 'onfire') say(["you're on fire 🔥"]);
  }

  window.__bobee = {
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
    if (c === 'pause') brain.setPaused(true);
    else if (c === 'resume') brain.setPaused(false);
    else if (c === 'say') {
      brain.summon(); // comes over for a short visit if he's away
      say(picker.nextRandom());
    }
  });

  // Pointer handling and click-through hit testing.
  let pressed = false;
  let moved = false;
  let grab = null; // pointer offset within the window, once known
  let clickThrough = true;
  let hovering = false;
  let lastMove = null; // { x, t } for drag speed
  const setThrough = (on) => {
    if (on === clickThrough) return;
    clickThrough = on;
    window.bobee.setClickThrough(on);
  };

  function opaqueAt(e) {
    if (hidden) return bubble.visible() && bubbleEl.contains(e.target);
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
    if (over && !hovering && !hidden && !bubbleEl.contains(e.target)) motion.wiggle(performance.now());
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
    const result = brain.pointerUp();
    const wasMoved = moved;
    moved = false;
    if (result === 'drag' || wasMoved) {
      syncing = true;
      window.bobee.dropToFloor();
      motion.land(performance.now());
      await syncX();
      syncing = false;
    } else if (result === 'click') {
      motion.hop(performance.now());
    }
  });

  let last = performance.now();
  let lastTransform = '';
  function frame(now) {
    const dt = Math.min(now - last, 100);
    last = now;
    const out = brain.tick(dt);
    // The window follows Bobee but stops at the screen edge; past it, he
    // slides out of the window, so the edge clips him as he walks off.
    if (!pressed && !syncing) {
      const winX = Math.min(bounds.maxX, Math.max(bounds.minX, out.x));
      if (Math.abs(winX - x) > 0.01) {
        window.bobee.moveBy(winX - x, 0);
        x = winX;
      }
      wrap.style.transform = `translateX(${Math.round(out.x - winX)}px)`;
    }
    if (hidden !== !out.visible) {
      hidden = !out.visible;
      wrap.classList.toggle('away', hidden);
      if (hidden) setThrough(true);
    }
    player.play(out.animation);
    player.setFacing(out.facing);
    if (out.bubble) showBubble(out.bubble);
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
