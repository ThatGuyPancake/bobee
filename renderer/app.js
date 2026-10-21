import { parseMessages, createPicker } from './messages.js';
import { SpritePlayer } from './sprite.js';
import { createBrain } from './brain.js';
import { createBubble } from './bubble.js';

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
  const zzz = document.getElementById('zzz');

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

  const bubble = createBubble(bubbleEl, { onResize: (h) => window.bobee.setHeight(h) });

  const b0 = await window.bobee.getBounds();
  let x = b0.x;
  const brain = createBrain({
    minX: b0.minX,
    maxX: b0.maxX,
    x: b0.x,
    happyMs: player.durationOf('happy', 2) || 750,
  });

  function showBubble(kind) {
    if (kind === 'click') bubble.showMessage({ text: picker.nextClick() });
    else if (kind === 'random') bubble.showMessage({ text: picker.nextRandom() });
    else if (kind === 'onfire') bubble.showMessage({ text: "you're on fire 🔥" });
  }

  window.__bobee = {
    showMessage: (m) => bubble.showMessage(m),
    playOverride: (img, opts) => player.playOverride(img, opts),
  };

  async function syncX() {
    const b = await window.bobee.getBounds();
    x = b.x;
    brain.setX(x);
  }

  window.bobee.onKeyPulse(() => brain.keyPulse());
  window.bobee.onIdle((s) => brain.setSystemIdle(s));
  window.bobee.onBounds(async (b) => {
    brain.setBounds(b.minX, b.maxX);
    await syncX();
  });
  window.bobee.onCommand((c) => {
    if (c === 'pause') brain.setPaused(true);
    else if (c === 'resume') brain.setPaused(false);
    else if (c === 'say') bubble.showMessage({ text: picker.nextRandom() });
  });

  // Pointer handling and click-through hit testing.
  let pressed = false;
  let grab = null; // pointer offset within the window, once known
  let clickThrough = true;
  const setThrough = (on) => {
    if (on === clickThrough) return;
    clickThrough = on;
    window.bobee.setClickThrough(on);
  };

  function opaqueAt(e) {
    if (bubble.visible() && bubbleEl.contains(e.target)) return true;
    const r = canvas.getBoundingClientRect();
    return player.isOpaqueAt(e.clientX - r.left, e.clientY - r.top);
  }

  window.addEventListener('mousemove', (e) => {
    if (pressed) {
      brain.pointerMove(e.screenX, e.screenY);
      if (grab) window.bobee.moveTo(e.screenX - grab.x, e.screenY - grab.y);
      return;
    }
    setThrough(!opaqueAt(e));
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
    const result = brain.pointerUp();
    if (result === 'drag') {
      window.bobee.dropToFloor();
      await syncX();
    }
  });

  let last = performance.now();
  function frame(now) {
    const dt = now - last;
    last = now;
    const out = brain.tick(dt);
    if (out.dx !== 0) {
      window.bobee.moveBy(out.dx, 0);
      x += out.dx;
      brain.setX(x);
    }
    player.play(out.animation);
    player.setFacing(out.facing);
    zzz.hidden = out.state !== 'sleep';
    if (out.bubble) showBubble(out.bubble);
    player.draw(now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
