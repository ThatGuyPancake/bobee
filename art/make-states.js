// Builds every animation strip in assets/bobee/ from the clean master, art/bobee-master.png.
// Every frame is drawn in code: parts of the master (head, body, mug, feet, eyes, mouth)
// are moved by whole pixels or redrawn in the master's own colours, then the outer edge
// is shaved by clean-edges.js. No AI art.
// Run: node art/make-states.js [outDir] [preview.png]   (outDir defaults to assets/bobee)
// The optional preview is every strip at 4x on green, one row per animation.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');
const { cleanEdges } = require('./clean-edges.js');

const OUT_DIR = process.argv[2] || path.join(__dirname, '..', 'assets', 'bobee');
const PREVIEW = process.argv[3];

const F = 96; // frame size
const GROUND = 95; // feet stand on this row
const H = 112; // working canvas is taller so legs can dangle below the frame before placing

// colours sampled from the master
const C = {
  fur: [155, 91, 65],
  out: [84, 35, 34],
  shade: [120, 67, 50],
  dark: [38, 37, 36],
  muzzle: [238, 196, 145],
  cream: [252, 235, 219],
  steam: [213, 189, 170],
  steamDim: [165, 126, 109],
  pad: [195, 120, 89],
  light: [210, 138, 108],
  bean: [217, 142, 113],
  mouth: [120, 40, 45],
  tongue: [232, 112, 136],
  blush: [214, 120, 110],
  white: [252, 235, 219],
  zFill: [236, 242, 255],
  zLine: [72, 92, 150],
  drop: [150, 200, 235],
  dropLine: [70, 110, 170],
};

class Img {
  constructor(w, h, d) {
    this.w = w;
    this.h = h;
    this.d = d || Buffer.alloc(w * h * 4);
  }
  get(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    return this.d[i + 3] ? [this.d[i], this.d[i + 1], this.d[i + 2]] : null;
  }
  set(x, y, c) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (!c) {
      this.d[i + 3] = 0;
      return;
    }
    this.d[i] = c[0];
    this.d[i + 1] = c[1];
    this.d[i + 2] = c[2];
    this.d[i + 3] = 255;
  }
  clone() {
    return new Img(this.w, this.h, Buffer.from(this.d));
  }
  // copy src's opaque pixels onto this one at an offset, optionally only where keep(x, y) (src coords)
  blit(src, ox = 0, oy = 0, keep = null) {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        if (keep && !keep(x, y)) continue;
        const c = src.get(x, y);
        if (c) this.set(x + ox, y + oy, c);
      }
    return this;
  }
  bottom() {
    for (let y = this.h - 1; y >= 0; y--) for (let x = 0; x < this.w; x++) if (this.get(x, y)) return y;
    return -1;
  }
  top() {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.get(x, y)) return y;
    return -1;
  }
}

const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const sat = (c) => Math.max(...c) - Math.min(...c);
const paint = (img, pts, c, ox = 0, oy = 0) => pts.forEach(([x, y]) => img.set(x + ox, y + oy, c));

function readPng(file) {
  const p = PNG.sync.read(fs.readFileSync(file));
  return new Img(p.width, p.height, Buffer.from(p.data));
}
function writePng(file, img) {
  const p = new PNG({ width: img.w, height: img.h });
  img.d.copy(p.data);
  fs.writeFileSync(file, PNG.sync.write(p));
}

// ---------- the master and its parts (all coordinates are master pixels) ----------
const MASTER = readPng(path.join(__dirname, 'bobee-master.png'));
const HEAD_BOTTOM = 60; // rows 0..60 are the head and ears; the body starts below the chin
const EYES = { left: { x0: 32, x1: 41, cx: 37 }, right: { x0: 55, x1: 64, cx: 59 } }; // rows 38..46
// the mug, row by row [x0, x1], handle included; its rim is row 65
const MUG_ROWS = {
  65: [42, 56], 66: [41, 62], 67: [41, 62], 68: [41, 62], 69: [40, 58], 70: [41, 57], 71: [41, 57],
  72: [42, 56], 73: [42, 56], 74: [43, 55], 75: [42, 56], 76: [42, 56], 77: [41, 56], 78: [41, 57],
  79: [41, 58], 80: [42, 57], 81: [43, 56], 82: [44, 54], 83: [46, 52],
};
const inMug = (x, y) => MUG_ROWS[y] && x >= MUG_ROWS[y][0] && x <= MUG_ROWS[y][1];
// In the master his paws cover the mug's sides, so a mug drawn on its own (wave, sip) keeps the
// master's rim, coffee and handle (rows 65..68, the left half mirrored from the right) and gets
// a smooth body below: half-widths around column 49, outlined, cream with the master's shading.
const MUG_AXIS = 49;
const MUG_BODY = { 69: 8, 70: 7, 71: 7, 72: 7, 73: 7, 74: 6, 75: 6, 76: 6, 77: 6, 78: 6, 79: 6, 80: 6, 81: 5, 82: 5, 83: 3 };
for (const [y, hw] of Object.entries(MUG_BODY)) MUG_ROWS[y] = [MUG_AXIS - hw, Math.max(MUG_AXIS + hw, +y === 69 ? 58 : 0)];
const MUG = new Img(F, F);
for (let y = 65; y <= 68; y++)
  for (let x = MUG_ROWS[y][0]; x <= MUG_ROWS[y][1]; x++) MUG.set(x, y, MASTER.get(x < MUG_AXIS ? 2 * MUG_AXIS - x : x, y));
for (const [ys, hw] of Object.entries(MUG_BODY)) {
  const y = +ys;
  const L = MUG_AXIS - hw;
  const R = MUG_AXIS + hw;
  for (let x = L; x <= R; x++) {
    let c = C.cream;
    if (x === L || x === R || y === 83) c = C.out;
    else if (y === 82 || x === R - 1) c = y === 82 ? C.steam : C.steamDim;
    else if (x >= R - 3 || x === L + 1 || (y >= 80 && x <= L + 2)) c = C.steam;
    MUG.set(x, y, c);
  }
  if (y === 69) MUG.set(58, 69, C.out); // the handle's lower end
}

function canvas() {
  return new Img(F, H).blit(MASTER);
}

// The steam in the master: the pale pixels (and their warm edges) between the chin and the rim.
function removeSteam(b) {
  const isSteam = (x, y) => {
    const c = b.get(x, y);
    return c && lum(c) > 110;
  };
  const pts = [];
  for (let y = 53; y <= 64; y++) for (let x = 42; x <= 57; x++) if (isSteam(x, y)) pts.push([x, y]);
  const skip = new Set(pts.map((p) => p + ''));
  for (const [x, y] of pts) {
    let c = null;
    for (let dx = 1; dx < 12 && !c; dx++)
      for (const X of [x - dx, x + dx]) {
        const q = b.get(X, y);
        if (q && !skip.has([X, y] + '')) {
          c = q;
          break;
        }
      }
    b.set(x, y, c || C.fur);
  }
  return b;
}

// Two zig-zag wisps rising from the rim. t in [0, 1) is the phase; rim is the rim row.
function steam(b, t, rim = 65, { height = 11, dx = 0 } = {}) {
  const ZIG = [0, 1, 1, 0, -1, -1];
  const wisps = [
    { cx: 47 + dx, phase: 0 },
    { cx: 52 + dx, phase: 0.5 },
  ];
  for (const w of wisps) {
    const u = (t + w.phase) % 1;
    const bottom = rim - 1 - Math.round(u * (height - 6));
    const len = Math.max(3, 7 - Math.round(u * 4));
    for (let k = 0; k < len; k++) {
      const y = bottom - k;
      const x = w.cx + ZIG[(((y + Math.round(u * 6)) % 6) + 6) % 6];
      b.set(x, y, k === len - 1 ? C.steamDim : k >= 1 && k <= 2 ? C.cream : C.steam);
    }
  }
}

// Move the head (rows 0..60) by whole pixels. Moving it up stretches his neck: whatever of the
// old head still shows below the new chin is filled with plain fur (no second chin line), and
// the edge shave outlines the new shape.
function moveHead(b, dx, dy) {
  if (!dx && !dy) return b;
  const head = new Img(b.w, b.h).blit(b, 0, 0, (x, y) => y <= HEAD_BOTTOM);
  const n = new Img(b.w, b.h).blit(b, 0, 0, (x, y) => y > HEAD_BOTTOM);
  if (dy < 0 && !dx) {
    // a neck exactly as wide as the bottom of his chin, so no wider old head shows beside it
    let L = -1;
    let R = -1;
    for (let x = 0; x < b.w; x++)
      if (head.get(x, HEAD_BOTTOM)) {
        if (L < 0) L = x;
        R = x;
      }
    for (let y = HEAD_BOTTOM + dy + 1; y <= HEAD_BOTTOM; y++) for (let x = L; x <= R; x++) n.set(x, y, C.fur);
  }
  return n.blit(head, dx, dy);
}

// ---------- face ----------
function clearEyes(b, oy = 0, ox = 0) {
  for (const e of Object.values(EYES))
    for (let y = 38; y <= 46; y++) for (let x = e.x0; x <= e.x1; x++) b.set(x + ox, y + oy, C.fur);
}
// mirrored eye shape: pts are [dx, y] around the left eye's centre column
function eyeShape(b, pts, c, oy = 0, ox = 0) {
  for (const [dx, y] of pts) {
    b.set(EYES.left.cx + dx + ox, y + oy, c);
    b.set(EYES.right.cx - dx + ox, y + oy, c);
  }
}
const EYE = {
  // gentle downward curves, for sleep and content sips
  closed: [[-3, 42], [3, 42], [-2, 43], [-1, 43], [0, 43], [1, 43], [2, 43]],
  // ^ ^ for happy
  happy: [[-3, 43], [-2, 42], [-1, 41], [0, 41], [1, 41], [2, 42], [3, 43], [-3, 44], [3, 44]],
  // > < squeezed shut for the big yawn (the left eye's '>' points at the nose)
  tight: [[-2, 40], [-1, 40], [-1, 41], [0, 41], [1, 42], [2, 42], [1, 43], [0, 43], [-1, 44], [-2, 44], [0, 44]],
};
function eyes(b, kind, oy = 0, ox = 0) {
  if (kind === 'open') return;
  if (kind === 'sleepy') {
    // top half of the eye hidden under a lid
    for (const e of Object.values(EYES))
      for (let y = 38; y <= 42; y++) for (let x = e.x0; x <= e.x1; x++) b.set(x + ox, y + oy, C.fur);
    for (const e of Object.values(EYES)) for (let x = e.x0; x <= e.x1; x++) b.set(x + ox, 43 + oy, C.fur);
    eyeShape(b, [[-4, 44], [-3, 43], [-2, 43], [-1, 43], [0, 43], [1, 43], [2, 43], [3, 43]], C.dark, oy, ox);
    return;
  }
  clearEyes(b, oy, ox);
  eyeShape(b, EYE[kind], kind === 'closed' ? C.out : C.dark, oy, ox);
}

// mouth area below the nose: rows 47..52, x 43..53, keeping the nose's stem at (48,47)
function clearMouth(b, oy = 0, ox = 0) {
  for (let y = 47; y <= 51; y++)
    for (let x = 43; x <= 53; x++) {
      if (x === 48 && y === 47) continue;
      if (b.get(x + ox, y + oy)) b.set(x + ox, y + oy, C.muzzle);
    }
}
// an outlined mouth opening: rows of [x0, x1] starting at row y0, tongue in the last `tongue` rows
function openMouth(b, y0, rows, tongue, oy = 0, ox = 0) {
  const all = [];
  rows.forEach(([a, e], j) => {
    for (let x = a; x <= e; x++) all.push([x, y0 + j]);
  });
  const key = new Set(all.map((p) => p + ''));
  for (const [x, y] of all) {
    const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !key.has([x + dx, y + dy] + ''));
    const inTongue = y >= y0 + rows.length - 1 - tongue && !edge;
    b.set(x + ox, y + oy, edge ? C.out : inTongue ? C.tongue : C.mouth);
  }
}
function mouth(b, kind, oy = 0, ox = 0) {
  if (kind === 'normal') return;
  clearMouth(b, oy, ox);
  if (kind === 'o') openMouth(b, 48, [[47, 49], [46, 50], [46, 50], [47, 49]], 0, oy, ox);
  if (kind === 'smile') openMouth(b, 48, [[44, 52], [45, 51], [45, 51], [46, 50]], 1, oy, ox);
  if (kind === 'yawnS') openMouth(b, 48, [[47, 49], [46, 50], [46, 50], [46, 50], [47, 49]], 1, oy, ox);
  if (kind === 'yawnL')
    openMouth(b, 47, [[46, 50], [45, 51], [44, 52], [44, 52], [44, 52], [45, 51], [46, 50]], 2, oy, ox);
  if (kind === 'sip') {
    // little pursed lips
    clearMouth(b, oy, ox);
    paint(b, [[47, 49], [48, 49], [49, 49], [47, 50], [49, 50], [48, 50]], C.out, ox, oy);
    b.set(48 + ox, 50 + oy, C.mouth);
  }
}
function blush(b, oy = 0, ox = 0) {
  // a pinker, wider blush on the cheeks
  for (const cx of [32, 64])
    for (let y = 47; y <= 50; y++)
      for (let x = cx - 3; x <= cx + 3; x++) {
        const edge = (y === 47 || y === 50) && (x === cx - 3 || x === cx + 3);
        if (!edge && b.get(x + ox, y + oy)) b.set(x + ox, y + oy, C.blush);
      }
}

// ---------- body parts ----------
// Paint over the arms and mug, leaving the body's outer outline: a plain tummy to build on.
function plainTorso(b, { x0 = 30, x1 = 67, y0 = 62, y1 = 79 } = {}) {
  for (let y = y0; y <= y1; y++) {
    let L = -1;
    let R = -1;
    for (let x = 0; x < b.w; x++)
      if (b.get(x, y)) {
        if (L < 0) L = x;
        R = x;
      }
    if (L < 0) continue;
    for (let x = Math.max(L + 2, x0); x <= Math.min(R - 2, x1); x++) b.set(x, y, y === y0 ? C.shade : C.fur);
  }
  for (let y = y1 + 1; y <= 83; y++)
    for (let x = Math.max(x0, y <= 81 ? 40 : 42); x <= Math.min(x1, y <= 81 ? 58 : 55); x++) b.set(x, y, y === 83 ? C.shade : C.fur);
  return b;
}
// Draw the master's mug at an offset; `ring` outlines it where it meets the bear (up to column ringX1).
function drawMug(b, dx, dy, { ring = true, ringX1 = 99 } = {}) {
  if (ring)
    for (const y of Object.keys(MUG_ROWS).map(Number))
      for (let x = MUG_ROWS[y][0]; x <= MUG_ROWS[y][1]; x++)
        for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + ex;
          const Y = y + ey;
          if (!inMug(X, Y) && X <= ringX1) b.set(X + dx, Y + dy, C.out);
        }
  for (const y of Object.keys(MUG_ROWS).map(Number))
    for (let x = MUG_ROWS[y][0]; x <= MUG_ROWS[y][1]; x++) {
      const c = MUG.get(x, y);
      if (c) b.set(x + dx, y + dy, c);
    }
}
// A filled shape from an inside(x, y) test, outlined where it meets the outside.
// Outline pixels for which noLine(x, y) is true are filled instead (where a limb joins the body).
function shape(b, inside, box, { fill = C.fur, line = C.out, noLine = () => false, extra = null } = {}) {
  const [x0, y0, x1, y1] = box;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (!inside(x, y)) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !inside(x + dx, y + dy));
      b.set(x, y, edge && !noLine(x, y) ? line : (extra && extra(x, y)) || fill);
    }
}
const segDist = (px, py, ax, ay, bx, by) => {
  const vx = bx - ax;
  const vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - ax - t * vx, py - ay - t * vy);
};
// an arm from the body point (ax, ay) to the paw at (bx, by); no outline where it leaves the body
function arm(b, ax, ay, bx, by, r = 4.1) {
  const box = [Math.floor(Math.min(ax, bx) - r - 1), Math.floor(Math.min(ay, by) - r - 1), Math.ceil(Math.max(ax, bx) + r + 1), Math.ceil(Math.max(ay, by) + r + 1)];
  const inside = (x, y) => segDist(x, y, ax, ay, bx, by) <= r;
  // the pixel just inside the outline, on the side facing down/outward, gets the master's shade colour
  const side = bx < ax ? 1 : -1;
  const shadeAt = (x, y) => !inside(x + side, y + 1) || !inside(x, y + 1) ? C.shade : null;
  shape(b, inside, box, { noLine: (x, y) => Math.hypot(x - ax, y - ay) < r + 1.5, extra: (x, y) => (Math.hypot(x - ax, y - ay) < r + 1.5 ? null : [[side, 1], [0, 1]].some(([dx, dy]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ey]) => !inside(x + dx + ex, y + dy + ey))) ? C.shade : null) });
}
// a round paw; `palm` shows the pad and toe beans (for waving)
function paw(b, cx, cy, r = 4.2, { palm = false } = {}) {
  const inside = (x, y) => Math.hypot(x - cx, (y - cy) * 1.08) <= r;
  shape(b, inside, [Math.floor(cx - r - 1), Math.floor(cy - r - 1), Math.ceil(cx + r + 1), Math.ceil(cy + r + 1)]);
  if (palm) {
    const k = r / 4.4; // pad and beans grow with the paw
    shape(b, (x, y) => Math.hypot(x - cx, (y - cy - 1.4 * k) * 1.15) <= 2.3 * k, [cx - 6, cy - 4, cx + 6, cy + 7], { fill: C.pad, line: C.pad });
    const bs = Math.round(2.4 * k);
    for (const [bx, by] of [[-bs, -2 * k], [0, -3 * k], [bs, -2 * k]]) {
      const x = Math.round(cx + bx);
      const y = Math.round(cy + by);
      paint(b, k > 1.2 ? [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]] : [[x, y]], C.bean);
    }
  }
}

// ---------- effects (drawn after the edge is shaved; each has its own outline) ----------
function heart(b, x, y) {
  const p = ['.OO..OO.', 'OppOOppO', 'OpwppppO', 'OppppppO', '.OppppO.', '..OppO..', '...OO...'];
  const k = { O: C.out, p: C.tongue, w: C.white };
  p.forEach((r, j) => [...r].forEach((ch, i) => k[ch] && b.set(x + i, y + j, k[ch])));
}
// an outlined Z, 7x7 (small) or 8x8
function zee(b, x, y, big = false) {
  const g = big ? ['#####', '...##', '..##.', '.##..', '##...', '#####'] : ['####', '..##', '.##.', '##..', '####'];
  const pts = [];
  g.forEach((r, j) => [...r].forEach((ch, i) => ch === '#' && pts.push([x + 1 + i, y + 1 + j])));
  const key = new Set(pts.map((p) => p + ''));
  for (const [px, py] of pts)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) if (!key.has([px + dx, py + dy] + '')) b.set(px + dx, py + dy, C.zLine);
  paint(b, pts, C.zFill);
}
function sweatDrop(b, x, y) {
  paint(b, [[1, 0], [0, 1], [2, 1], [0, 2], [2, 2], [1, 3]], C.dropLine, x, y);
  paint(b, [[1, 1], [1, 2]], C.drop, x, y);
}

// ---------- placing a pose in its frame ----------
// shave the outer edge, then stand the lowest pixel on the ground row (minus `lift` for hops)
function place(pose, lift = 0) {
  const c = pose.clone();
  cleanEdges(c, { ground: c.bottom() });
  const f = new Img(F, F);
  f.blit(c, 0, GROUND - c.bottom() - lift);
  return f;
}
const shiftOf = (pose, lift = 0) => GROUND - pose.bottom() - lift;

// ---------- the animations ----------
const S = {};

// idle: steam keeps rising, he blinks once a loop (breathing comes from motion.js)
S.idle = [...Array(8)].map((_, i) => {
  const b = removeSteam(canvas());
  if (i === 5) eyes(b, 'closed');
  steam(b, i / 8);
  return place(b);
});

// walk: a waddle on two little legs, weight shifting from foot to foot, mug held steady
function walkBody() {
  const b = canvas();
  removeSteam(b);
  for (let y = 77; y < H; y++) for (let x = 0; x <= 27; x++) b.set(x, y, null); // the tail
  for (let y = 81; y < H; y++) for (let x = 0; x < F; x++) b.set(x, y, null); // the sitting feet
  // a rounded bottom under the mug
  const rows = { 81: [28, 69], 82: [29, 68], 83: [30, 67], 84: [32, 65] };
  for (const [y, [a, e]] of Object.entries(rows))
    for (let x = a; x <= e; x++) b.set(x, +y, +y === 84 || x === a || x === e ? C.out : +y === 83 ? C.shade : C.fur);
  // the arms' lower edge stays as the master drew it; the mug's bottom goes back on top
  for (let y = 80; y <= 83; y++) for (let x = 0; x < F; x++) if (inMug(x, y)) b.set(x, y, MASTER.get(x, y));
  return b;
}
// a fat, round leg: an outlined oval of fur with a soft pad at the bottom
function roundLeg(n, cx, cy, rx = 8.6, ry = 7.2) {
  const inside = (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
  const sole = (x, y) => ((x - cx) / (rx - 2.2)) ** 2 + ((y - cy - 2.6) / 2.6) ** 2 <= 1;
  shape(n, inside, [Math.floor(cx - rx - 1), Math.floor(cy - ry - 1), Math.ceil(cx + rx + 1), Math.ceil(cy + ry + 1)], {
    extra: (x, y) => (sole(x, y) ? (y <= cy + 1 ? C.light : C.pad) : null),
  });
  // three toe beans above the pad
  const ty = Math.round(cy);
  for (const bx of [-3, 0, 3]) n.set(Math.round(cx) + bx, ty - (bx ? 1 : 2), C.bean);
}
// a short leg with a round foot; the foot's bottom row is y0 + h - 1
function leg(n, x0, y0, h) {
  const bot = y0 + h - 1;
  const footH = 6;
  const top = bot - footH + 1;
  for (let y = y0; y < top + 2; y++) for (let x = x0 + 1; x <= x0 + 9; x++) n.set(x, y, x === x0 + 1 || x === x0 + 9 ? C.out : C.fur);
  const insets = [3, 1, 0, 0, 1, 3];
  const fx0 = x0 - 1;
  const fw = 13;
  for (let r = 0; r < footH; r++) {
    const y = top + r;
    const a = fx0 + insets[r];
    const e = fx0 + fw - 1 - insets[r];
    for (let x = a; x <= e; x++) {
      const edge = x === a || x === e || (r === 0 && (x < a + 2 || x > e - 2)) || r === footH - 1;
      const sole = r >= footH - 3 && !edge && x > a + 1 && x < e - 1;
      n.set(x, y, edge ? C.out : sole ? C.pad : C.fur);
    }
  }
  for (const bx of [4, 6, 8]) n.set(fx0 + bx, bot - 2, C.bean);
  // join the leg to the body: no outline across the top of the leg
  for (let x = x0 + 2; x <= x0 + 8; x++) for (let y = y0 - 1; y <= y0; y++) n.set(x, y, C.fur);
}
{
  const body = walkBody();
  // [left lift, right lift, body sway]: lifting a foot shifts his weight onto the other one
  const steps = [
    [0, 0, 0], [1, 0, 1], [3, 0, 1], [2, 0, 1],
    [0, 0, 0], [0, 1, -1], [0, 3, -1], [0, 2, -1],
  ];
  S.walk = steps.map(([l, r, sway], i) => {
    // fat round legs peek out from under his tummy; a lifted foot steps a pixel outward
    const n = new Img(F, H);
    roundLeg(n, 38 - (l >= 2 ? 1 : 0), 88 - l);
    roundLeg(n, 59 + (r >= 2 ? 1 : 0), 88 - r);
    n.blit(body, sway, 0);
    steam(n, i / 8, 65, { dx: sway });
    return place(n);
  });
}

// sleep: eyes shut, no steam, Zs drifting up beside his head (breathing comes from motion.js)
S.sleep = [...Array(6)].map((_, i) => {
  const b = removeSteam(canvas());
  eyes(b, 'closed');
  if (i >= 2 && i <= 3) mouth(b, 'o');
  const f = place(b);
  const oy = shiftOf(b);
  // each Z rises from beside his ear to near the top, staying inside the frame
  for (const [phase, big] of [[0, false], [0.5, true]]) {
    const u = (i / 6 + phase) % 1;
    zee(f, 77 + Math.round(u * 6), oy + 22 - Math.round(u * 18), big);
  }
  return f;
});

// drag: legs dangling and kicking, mouth open in surprise, a sweat drop
function dangle(b, dl, dr) {
  const CUT = 86;
  const legs = [
    [28, 43, dl],
    [56, 71, dr],
  ];
  const n = b.clone();
  for (const [x0, x1, d] of legs) {
    for (let y = CUT; y < H; y++) for (let x = x0; x <= x1; x++) n.set(x, y, null);
    for (let y = CUT; y < H - d; y++) for (let x = x0; x <= x1; x++) n.set(x, y + d, b.get(x, y));
    // stretch the leg over the gap
    let L = -1;
    let R = -1;
    for (let x = x0; x <= x1; x++)
      if (b.get(x, CUT)) {
        if (L < 0) L = x;
        R = x;
      }
    for (let y = CUT; y < CUT + d; y++) for (let x = L; x <= R; x++) n.set(x, y, x === L || x === R ? C.out : C.fur);
  }
  return n;
}
S.drag = [[5, 1], [2, 5], [5, 2], [1, 5]].map(([dl, dr], i) => {
  let b = removeSteam(canvas());
  mouth(b, 'o');
  b = dangle(b, dl, dr);
  sweatDrop(b, 69, 34 + (i % 2));
  return place(b);
});

// happy: a little hop with ^ ^ eyes and a smile, a heart floating up
S.happy = [0, 0, 2, 4, 3, 1].map((lift, i) => {
  let b = removeSteam(canvas());
  if (i === 1) b = moveHead(b, 0, 1); // crouch before the jump
  const oy = i === 1 ? 1 : 0;
  eyes(b, 'happy', oy);
  mouth(b, 'smile', oy);
  blush(b, oy);
  steam(b, i / 6);
  const f = place(b, lift);
  if (i > 0) heart(f, 78 + Math.round(i / 2), 20 - i * 3);
  return f;
});

// wave: holds the mug by its handle in one paw and waves hello with the other
S.wave = [
  [19, 53],
  [17, 49],
  [15, 47],
  [17, 46],
  [20, 47],
  [18, 50],
].map(([px, py], i) => {
  const b = removeSteam(canvas());
  plainTorso(b, { x1: 41 });
  drawMug(b, 0, 0, { ringX1: 48 });
  eyes(b, i === 2 || i === 3 ? 'happy' : 'open');
  mouth(b, 'smile');
  blush(b);
  steam(b, i / 6);
  paw(b, px + 3, py + 3, 6.6, { palm: true });
  return place(b);
});

// sip: lifts the mug to his mouth, eyes closed, a happy sigh, back down
S.sip = [
  // [mug lift, head down, eyes, mouth, steam]
  [3, 0, 'open', 'normal', true],
  [8, 0, 'open', 'sip', true],
  [13, 1, 'closed', 'sip', false],
  [13, 1, 'closed', 'sip', false],
  [7, 0, 'closed', 'normal', true],
  [2, 0, 'happy', 'normal', true],
].map(([lift, hd, eye, mo, st], i) => {
  let b = removeSteam(canvas());
  plainTorso(b);
  b = moveHead(b, 0, hd);
  eyes(b, eye, hd);
  mouth(b, mo, hd);
  if (eye === 'closed' || eye === 'happy') blush(b, hd);
  // two round paws grip the mug's sides
  const py = 72 - lift;
  drawMug(b, 0, -lift);
  paw(b, 37, py, 6.2);
  paw(b, 64, py - 4, 6.2);
  if (st) steam(b, i / 6, 65 - lift, { height: 9 });
  return place(b);
});

// yawn: stretches up tall, a big yawn with eyes squeezed shut, then settles sleepily
S.yawn = [
  // [head up, eyes, mouth]
  [0, 'sleepy', 'normal'],
  [1, 'closed', 'yawnS'],
  [2, 'tight', 'yawnL'],
  [2, 'tight', 'yawnL'],
  [1, 'closed', 'yawnS'],
  [0, 'sleepy', 'normal'],
].map(([up, eye, mo], i) => {
  let b = removeSteam(canvas());
  b = moveHead(b, 0, -up);
  eyes(b, eye, -up);
  mouth(b, mo, -up);
  steam(b, i / 6);
  return place(b);
});

// a small outlined heart, 7x5 (for sleep-pet, where a Z would be)
function smallHeart(b, x, y) {
  const p = ['.OO.OO.', 'OppOppO', 'OpwpppO', '.OpppO.', '..OOO..'];
  const k = { O: C.out, p: C.tongue, w: C.white };
  p.forEach((r, j) => [...r].forEach((ch, i) => k[ch] && b.set(x + i, y + j, k[ch])));
}
// a closed, content smile under the nose (no open mouth), for when he's asleep
function sleepSmile(b, oy = 0, ox = 0) {
  clearMouth(b, oy, ox);
  paint(b, [[44, 48], [45, 49], [46, 50], [47, 50], [48, 50], [49, 50], [50, 50], [51, 49], [52, 48]], C.out, ox, oy);
}

// pet: eyes closed and blushing, he leans into the stroke and back; hearts float up
S.pet = [0, 1, 1, 1, 1, 0].map((lean, i) => {
  let b = removeSteam(canvas());
  b = moveHead(b, lean, 0);
  eyes(b, 'closed', 0, lean);
  blush(b, 0, lean);
  steam(b, i / 6);
  const f = place(b);
  // the first heart rises from beside his ear, a second one follows it
  if (i >= 1) heart(f, 77 + (i >> 1), 26 - (i - 1) * 4);
  if (i >= 3) heart(f, 85, 26 - (i - 3) * 4);
  return f;
});

// sleep-pet: still asleep, he smiles, wiggles a little, and one heart rises instead of a Z
S['sleep-pet'] = [0, 1, 0, -1].map((wig, i) => {
  let b = removeSteam(canvas());
  b = moveHead(b, wig, 0);
  eyes(b, 'closed', 0, wig);
  sleepSmile(b, 0, wig);
  const f = place(b);
  const oy = shiftOf(b);
  smallHeart(f, 78, oy + 20 - i * 4);
  return f;
});

// one eye (his left, on the viewer's right) as the master drew it, or half-open under a lid
function oneEye(b, kind) {
  const e = EYES.right;
  for (let y = 38; y <= 46; y++) for (let x = e.x0; x <= e.x1; x++) b.set(x, y, MASTER.get(x, y) || C.fur);
  if (kind === 'half') {
    for (let y = 38; y <= 43; y++) for (let x = e.x0; x <= e.x1; x++) b.set(x, y, C.fur);
    paint(b, [[4, 44], [3, 43], [2, 43], [1, 43], [0, 43], [-1, 43], [-2, 43], [-3, 43]].map(([dx, y]) => [e.cx + dx, y]), C.dark);
  }
}
function sleepZs(f, oy, i, n) {
  for (const [phase, big] of [[0, false], [0.5, true]]) {
    const u = (i / n + phase) % 1;
    zee(f, 77 + Math.round(u * 6), oy + 22 - Math.round(u * 18), big);
  }
}

// sleep-peek: asleep, one eye opens a little, then all the way, then he's back to sleep
S['sleep-peek'] = ['closed', 'half', 'open', 'closed'].map((eye, i) => {
  const b = removeSteam(canvas());
  eyes(b, 'closed');
  if (eye !== 'closed') oneEye(b, eye);
  const f = place(b);
  if (eye === 'closed') sleepZs(f, shiftOf(b), i, 6);
  return f;
});

// a cookie in his paw: size 2 is whole, 1 is bitten
function cookie(b, x, y, size) {
  const shapes = {
    2: ['..OOO..', '.OccdO.', 'OcdcccO', 'OcccdcO', 'OdcccO.', '.OOOO..'],
    1: ['..OO...', '.OcO...', 'OcdO...', 'OccdO..', 'OdccO..', '.OOO...'],
  };
  const k = { O: C.out, c: C.muzzle, d: C.shade };
  shapes[size].forEach((r, j) => [...r].forEach((ch, i) => k[ch] && b.set(x + i, y + j, k[ch])));
}

// munch: mug in his lap, one paw holds a cookie up to his mouth; he chews it smaller,
// crumbs fall below his chin, and it's gone with a happy face at the end
S.munch = [
  // [mouth, cookie size, crumbs, eyes]
  ['o', 2, null, 'open'],
  ['normal', 2, null, 'closed'],
  ['o', 1, [[47, 56], [51, 58]], 'open'],
  ['normal', 1, null, 'closed'],
  ['o', 0, [[49, 57], [46, 59]], 'happy'],
  ['normal', 0, null, 'happy'],
].map(([mo, size, crumbs, eye]) => {
  const b = removeSteam(canvas());
  plainTorso(b, { x1: 41 });
  drawMug(b, 0, 0, { ringX1: 48 });
  eyes(b, eye);
  mouth(b, mo);
  if (eye !== 'open') blush(b);
  paw(b, 40, 57, 5.6);
  if (size) cookie(b, 38, 47, size);
  if (crumbs) for (const [x, y] of crumbs) paint(b, [[x, y], [x + 1, y]], C.muzzle);
  return place(b);
});

// ---------- write ----------
function strip(name, frames) {
  const s = new Img(F * frames.length, F);
  frames.forEach((f, i) => s.blit(f, i * F, 0));
  writePng(path.join(OUT_DIR, name + '.png'), s);
  return s;
}
for (const k of Object.keys(S)) strip(k, S[k]);

if (PREVIEW) {
  const rows = ['idle', 'walk', 'sleep', 'drag', 'happy', 'wave', 'sip', 'yawn', 'pet', 'sleep-pet', 'sleep-peek', 'munch'];
  const Z = 4;
  const cols = Math.max(...rows.map((r) => S[r].length));
  const pv = new Img(F * cols * Z, F * rows.length * Z);
  for (let i = 0; i < pv.w * pv.h; i++) pv.d.set([70, 170, 90, 255], i * 4);
  rows.forEach((r, j) =>
    S[r].forEach((fr, i) => {
      for (let y = 0; y < F; y++)
        for (let x = 0; x < F; x++) {
          const c = fr.get(x, y);
          if (!c) continue;
          for (let dy = 0; dy < Z; dy++) for (let dx = 0; dx < Z; dx++) pv.set((i * F + x) * Z + dx, (j * F + y) * Z + dy, c);
        }
    })
  );
  writePng(PREVIEW, pv);
}
console.log('done');

module.exports = { S };
