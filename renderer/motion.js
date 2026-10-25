// Code-driven motion layered on top of the frame animations: squash and
// stretch, hops, walk bob, breathing, hover wiggle and drag tilt. Everything
// here is pure (no DOM); app.js turns the result into a CSS transform on the
// canvas. Offsets are whole pixels and scales snap to whole-pixel sizes so
// the pixel art stays crisp.

const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function smoothstep(t) {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}

// Walk speed multiplier: slow at the start and end of a walk, full speed in
// the middle. Never below `min`, so he always gets there.
export const WALK_RAMP_PX = 24;
export const WALK_MIN_FACTOR = 0.2;
export function walkSpeedFactor(traveled, remaining, rampPx = WALK_RAMP_PX, min = WALK_MIN_FACTOR) {
  const d = Math.min(Math.max(0, traveled), Math.max(0, remaining));
  return min + (1 - min) * smoothstep(d / rampPx);
}

// Landing squash: flattens on impact, overshoots into a stretch, settles.
// A damped cosine on the vertical scale; width moves the other way so he
// keeps roughly the same volume. Returns { sx, sy }.
export const SQUASH_MS = 420;
export function squashAt(tMs, strength = 0.18) {
  if (!(tMs >= 0) || tMs >= SQUASH_MS) return { sx: 1, sy: 1 };
  const d = strength * Math.exp(-tMs / 110) * Math.cos((TAU * tMs) / 300);
  return { sx: 1 + d * 0.8, sy: 1 - d };
}

// A little jump: a parabola that peaks at `height` px halfway through.
// Returns a whole-pixel upward offset (negative is up).
export const HOP_MS = 260;
export function hopOffset(tMs, height = 7, durMs = HOP_MS) {
  if (!(tMs > 0) || tMs >= durMs) return 0;
  const u = tMs / durMs;
  return -Math.round(height * 4 * u * (1 - u)) || 0;
}

// Walk bob: lifts a pixel or two on each step, from distance walked. One step
// of the walk strip (4 frames at 9 fps) covers about 18 px at walking speed.
export const STEP_PX = 18;
export function bobOffset(distancePx, amp = 2, stepPx = STEP_PX) {
  return -Math.round(amp * Math.abs(Math.sin((Math.PI * distancePx) / stepPx))) || 0;
}

// Breathing: a slow, tiny vertical swell (amp 0.015 = 1.5%).
export const BREATH_MS = 3200;
export function breathScale(tMs, amp = 0.015, periodMs = BREATH_MS) {
  return 1 + amp * (0.5 - 0.5 * Math.cos((TAU * tMs) / periodMs));
}

// Snap a scale so `size * scale` is a whole number of pixels.
export function snapScale(scale, size) {
  return Math.round(size * scale) / size;
}

// Hover wiggle: a quick side-to-side rock that dies away. Degrees.
export const WIGGLE_MS = 600;
export function wiggleAngle(tMs, amp = 5, durMs = WIGGLE_MS) {
  if (!(tMs >= 0) || tMs >= durMs) return 0;
  const u = tMs / durMs;
  return amp * Math.sin(TAU * 2 * u) * (1 - u);
}

// Drag tilt: he swings opposite to the way he's dragged, like he's dangling.
// vx is pointer speed in px/ms; positive (moving right) tilts clockwise.
export const TILT_MAX = 12;
export function tiltTarget(vx, k = 6, max = TILT_MAX) {
  return clamp(vx * k, -max, max);
}

// Ease `current` toward `target` with a time constant, frame-rate independent.
export function approach(current, target, dtMs, tauMs = 90) {
  if (dtMs <= 0) return current;
  return target + (current - target) * Math.exp(-dtMs / tauMs);
}

const deg = (a) => Math.round(a * 100) / 100;

// Build the CSS transform. Origin is the bottom centre (his feet): `rot`
// rocks him on his feet, `swing` turns him around a point `pivot` px above
// them (where he's held while dragged).
export function toTransform({ x = 0, y = 0, sx = 1, sy = 1, rot = 0, swing = 0, pivot = 0 } = {}) {
  const parts = [];
  if (x || y) parts.push(`translate(${x}px, ${y}px)`);
  if (deg(swing)) {
    parts.push(`translateY(${-pivot}px) rotate(${deg(swing)}deg) translateY(${pivot}px)`);
  }
  if (deg(rot)) parts.push(`rotate(${deg(rot)}deg)`);
  if (sx !== 1 || sy !== 1) parts.push(`scale(${sx}, ${sy})`);
  return parts.length ? parts.join(' ') : 'none';
}

// Ties the pieces together. Call the event methods as things happen, then
// update(now, info) each frame for the transform parameters.
export function createMotion({ size = 96, reduced = false } = {}) {
  let reduce = reduced;
  let landAt = -Infinity;
  let landStrength = 0.18;
  let hopAt = -Infinity;
  let wiggleAt = -Infinity;
  let walked = 0;
  let tilt = 0;
  let dragVx = 0;
  let last = null;

  return {
    setReduced(on) {
      reduce = !!on;
    },
    land(now, strength = 0.18) {
      landAt = now;
      landStrength = strength;
    },
    hop(now) {
      hopAt = now;
    },
    wiggle(now) {
      if (now - wiggleAt < WIGGLE_MS * 2) return; // don't restart mid-wiggle
      wiggleAt = now;
    },
    // pointer velocity while dragging, px/ms
    dragVelocity(vx) {
      dragVx = vx;
    },

    // info: { animation, dx, dragging }
    update(now, { animation = 'idle', dx = 0, dragging = false } = {}) {
      const dt = last === null ? 0 : Math.min(100, now - last);
      last = now;
      if (reduce) {
        tilt = 0;
        return { x: 0, y: 0, sx: 1, sy: 1, rot: 0, swing: 0, pivot: 0 };
      }

      // a hop ends in a small landing squash
      if (hopAt > landAt && now - hopAt >= HOP_MS) this.land(hopAt + HOP_MS, 0.12);

      let y = hopOffset(now - hopAt);
      if (animation === 'walk') {
        walked += Math.abs(dx);
        y += bobOffset(walked);
      } else {
        walked = 0;
      }

      let { sx, sy } = squashAt(now - landAt, landStrength);
      const settled = sx === 1 && sy === 1 && y === 0;
      if (settled && !dragging && (animation === 'idle' || animation === 'sleep')) {
        sy = breathScale(now, animation === 'sleep' ? 0.025 : 0.015);
      }

      dragVx = dragging ? dragVx * Math.exp(-dt / 120) : 0;
      tilt = approach(tilt, dragging ? tiltTarget(dragVx) : 0, dt);
      if (Math.abs(tilt) < 0.3 && !dragging) tilt = 0;

      return {
        x: 0,
        y,
        sx: snapScale(sx, size),
        sy: snapScale(sy, size),
        rot: wiggleAngle(now - wiggleAt),
        swing: tilt,
        pivot: Math.round(size * 0.8), // dangles from near the top
      };
    },
  };
}
