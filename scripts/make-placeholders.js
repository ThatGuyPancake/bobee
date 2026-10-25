// Generates placeholder bear sprite strips (64x64 frames) with pngjs.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const F = 64;
const BROWN = [139, 90, 60, 255];
const DARK = [74, 44, 28, 255];
const CREAM = [236, 210, 170, 255];
const PINK = [242, 136, 155, 255];

function newImage(w, h) {
  return new PNG({ width: w, height: h });
}

function px(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = (img.width * y + x) << 2;
  img.data[i] = c[0];
  img.data[i + 1] = c[1];
  img.data[i + 2] = c[2];
  img.data[i + 3] = c[3];
}

function ellipse(img, ox, cx, cy, rx, ry, c) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      if (nx * nx + ny * ny <= 1) px(img, ox + x, y, c);
    }
  }
}

function rect(img, ox, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(img, ox + x + i, y + j, c);
}

// opts: dy (body/head offset), eyes ('dot'|'closed'), mouth ('none'|'open'),
// arms ('down'|'up'|'wave'), feet ([leftLift, rightLift]), lift (whole bear up)
function drawBear(img, ox, opts = {}) {
  const dy = (opts.dy || 0) - (opts.lift || 0);
  const fy = -(opts.lift || 0);
  const [lf, rf] = opts.feet || [0, 0];
  // ears
  ellipse(img, ox, 20, 15 + dy, 5, 5, BROWN);
  ellipse(img, ox, 44, 15 + dy, 5, 5, BROWN);
  ellipse(img, ox, 20, 16 + dy, 2.5, 2.5, CREAM);
  ellipse(img, ox, 44, 16 + dy, 2.5, 2.5, CREAM);
  // arms
  if (opts.arms === 'up') {
    ellipse(img, ox, 15, 33 + dy, 3.5, 6, BROWN);
    ellipse(img, ox, 49, 33 + dy, 3.5, 6, BROWN);
  } else if (opts.arms === 'wave') {
    ellipse(img, ox, 13 + (opts.wave || 0), 30 + dy, 3.5, 6, BROWN);
    ellipse(img, ox, 45, 47 + dy, 3.5, 6, BROWN);
  } else {
    ellipse(img, ox, 19, 47 + dy, 3.5, 6, BROWN);
    ellipse(img, ox, 45, 47 + dy, 3.5, 6, BROWN);
  }
  // body and belly
  ellipse(img, ox, 32, 46 + dy, 12, 11, BROWN);
  ellipse(img, ox, 32, 48 + dy, 7, 7, CREAM);
  // feet (bottom row at y=59, 4px above the edge)
  ellipse(img, ox, 24, 56 + fy - lf, 5, 3.5, BROWN);
  ellipse(img, ox, 40, 56 + fy - rf, 5, 3.5, BROWN);
  // head
  ellipse(img, ox, 32, 28 + dy, 15, 15, BROWN);
  // muzzle and nose
  ellipse(img, ox, 32, 33 + dy, 6.5, 4.5, CREAM);
  rect(img, ox, 30, 30 + dy, 4, 2, DARK);
  if (opts.mouth === 'open') ellipse(img, ox, 32, 36 + dy, 2, 2, DARK);
  // eyes
  if (opts.eyes === 'closed') {
    rect(img, ox, 23, 26 + dy, 4, 1, DARK);
    rect(img, ox, 37, 26 + dy, 4, 1, DARK);
  } else {
    rect(img, ox, 24, 24 + dy, 3, 4, DARK);
    rect(img, ox, 37, 24 + dy, 3, 4, DARK);
  }
  // blush
  ellipse(img, ox, 20, 32 + dy, 3, 2, PINK);
  ellipse(img, ox, 44, 32 + dy, 3, 2, PINK);
}

const ANIMS = {
  idle: [{}, { dy: 1 }],
  walk: [
    { feet: [3, 0] },
    { feet: [0, 0] },
    { feet: [0, 3] },
    { feet: [0, 0] },
  ],
  sleep: [{ eyes: 'closed' }, { eyes: 'closed', dy: 1 }],
  drag: [{ mouth: 'open', lift: 2, feet: [-1, 1] }],
  happy: [
    { arms: 'up' },
    { arms: 'up', lift: 3 },
  ],
  wave: [
    { arms: 'wave', wave: -1 },
    { arms: 'wave', wave: 1 },
  ],
  sip: [{}, { eyes: 'closed', dy: 1 }],
  yawn: [{ eyes: 'closed', mouth: 'open' }, { eyes: 'closed', mouth: 'open', dy: -1 }],
  pet: [{ eyes: 'closed' }, { eyes: 'closed', dy: 1 }],
  'sleep-pet': [{ eyes: 'closed' }, { eyes: 'closed', dy: -1 }],
};

function writePng(file, img) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(img));
}

const root = path.join(__dirname, '..');
for (const [name, frames] of Object.entries(ANIMS)) {
  const img = newImage(F * frames.length, F);
  frames.forEach((opts, i) => drawBear(img, i * F, opts));
  writePng(path.join(root, 'assets', 'placeholder', `${name}.png`), img);
}

// App icon: idle frame 1 scaled 4x (nearest neighbour).
const frame = newImage(F, F);
drawBear(frame, 0, ANIMS.idle[0]);
const icon = newImage(F * 4, F * 4);
for (let y = 0; y < icon.height; y++) {
  for (let x = 0; x < icon.width; x++) {
    const s = (F * (y >> 2) + (x >> 2)) << 2;
    const d = (icon.width * y + x) << 2;
    for (let k = 0; k < 4; k++) icon.data[d + k] = frame.data[s + k];
  }
}
writePng(path.join(root, 'build', 'icon.png'), icon);
console.log('placeholders written');
