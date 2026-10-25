// Draws Bobee's clean master frames from simple shapes and a fixed palette.
// Run: node art/make-master.js  ->  art/bobee-master.png, art/bobee-master-nomug.png
// The outer outline is worked out from the silhouette, so it is always exactly 1px.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const S = 96;
const CX = 48; // the bear is mirrored around the line between columns 47 and 48

const C = {
  out: [84, 35, 34],
  line: [107, 60, 49], // softer line where one part overlaps another
  fur: [155, 91, 65],
  furLight: [175, 102, 74],
  furShade: [129, 73, 55],
  earIn: [217, 142, 113],
  muzzle: [238, 196, 145],
  muzzleShade: [209, 160, 112],
  belly: [214, 160, 118],
  dark: [38, 37, 36],
  shine: [252, 245, 235],
  cheek: [232, 128, 122],
  pad: [195, 120, 89],
  bean: [222, 150, 118],
  mug: [252, 235, 219],
  mugShade: [213, 189, 170],
  coffee: [92, 45, 40],
  steam: [240, 228, 216],
};

// --- tiny canvas with a part label per pixel -------------------------------------------
function canvas() {
  return { col: new Array(S * S).fill(null), part: new Array(S * S).fill(-1) };
}
const inside = (x, y) => x >= 0 && y >= 0 && x < S && y < S;
const ellipse = (cx, cy, rx, ry) => (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
const rect = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const and = (...fs) => (x, y) => fs.every((f) => f(x, y));
const mirror = (f) => (x, y) => f(x, y) || f(2 * CX - 1 - x, y);

// Paint `color` wherever `shape` is true. A new part id makes it its own piece for inner lines.
function paint(cv, shape, color, part) {
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (shape(x, y)) {
        cv.col[y * S + x] = color;
        if (part !== undefined) cv.part[y * S + x] = part;
      }
}
function dots(cv, list, color) {
  for (const [x, y] of list) if (inside(x, y)) cv.col[y * S + x] = color;
}

// --- the bear ------------------------------------------------------------------------
const P = { ears: 0, body: 1, legs: 2, head: 3, arms: 4, mug: 5, paws: 6 };

function draw({ mug }) {
  const cv = canvas();

  // ears (behind the head)
  paint(cv, mirror(ellipse(25, 13.5, 8.5, 8.5)), C.fur, P.ears);
  paint(cv, mirror(ellipse(26, 14.5, 4.5, 4.5)), C.earIn);

  // body
  paint(cv, ellipse(CX, 72, 23.5, 21), C.fur, P.body);
  paint(cv, and(ellipse(CX, 72, 23.5, 21), (x, y) => !ellipse(CX - 3, 69, 22, 20)(x, y)), C.furShade);
  if (!mug) paint(cv, ellipse(CX, 72, 12.5, 12), C.belly);

  // legs: feet stick out forward, soles on the ground row
  const foot = (cx) => ellipse(cx, 88, 10.5, 8);
  paint(cv, mirror(foot(32)), C.fur, P.legs);
  paint(cv, mirror(ellipse(31, 90, 5.5, 4)), C.pad);
  for (const [x, y] of [[25, 86], [28, 84], [32, 84], [35, 86]]) paint(cv, mirror(rect(x, y, x + 1, y + 1)), C.bean);

  // head
  const head = ellipse(CX, 31, 30, 24);
  paint(cv, head, C.fur, P.head);
  paint(cv, and(head, ellipse(CX - 9, 15, 15, 7), (x, y) => !ellipse(CX - 6, 21, 17, 8)(x, y)), C.furLight);
  paint(cv, and(head, (x, y) => !ellipse(CX, 29.5, 29, 23)(x, y) && y > 34), C.furShade);

  // face
  paint(cv, ellipse(CX, 40, 10, 7.5), C.muzzle);
  paint(cv, and(ellipse(CX, 40, 10, 7.5), (x, y) => y >= 46), C.muzzleShade);
  paint(cv, mirror(ellipse(29, 40, 4.5, 2.5)), C.cheek);
  paint(cv, mirror(ellipse(35, 32, 4.5, 5)), C.dark); // eyes
  dots(cv, [[33, 29], [34, 29], [33, 30], [34, 30], [37, 34], [59, 29], [60, 29], [59, 30], [60, 30], [63, 34]], C.shine);
  // nose: a rounded triangle
  paint(cv, rect(45, 36, 50, 36), C.dark);
  paint(cv, rect(44, 37, 51, 37), C.dark);
  paint(cv, rect(45, 38, 50, 38), C.dark);
  paint(cv, rect(46, 39, 49, 39), C.dark);
  dots(cv, [[46, 37], [47, 37]], C.shine);
  // mouth: a small "w"
  dots(cv, [[47, 40], [48, 40], [44, 40], [45, 41], [46, 41], [49, 41], [50, 41], [51, 40]], C.out);

  if (mug) {
    // arms wrap round to the front to hold the mug
    paint(cv, mirror(ellipse(31, 66, 7, 9.5)), C.fur, P.arms);
    // mug body with the handle tucked inside the silhouette
    paint(cv, rect(41, 60, 54, 75), C.mug, P.mug);
    paint(cv, rect(42, 61, 53, 62), C.coffee);
    paint(cv, rect(51, 63, 54, 75), C.mugShade);
    paint(cv, (x, y) => (x === 55 || x === 58) && y >= 64 && y <= 69, C.mug, P.mug);
    paint(cv, (x, y) => x >= 55 && x <= 58 && (y === 63 || y === 70), C.mug, P.mug);
    paint(cv, rect(56, 64, 57, 69), C.fur, P.arms); // fur seen through the handle
    // little paws hugging the bottom of the mug
    paint(cv, ellipse(40.5, 72, 3.5, 4), C.fur, P.paws);
    paint(cv, ellipse(55.5, 73, 3.5, 4), C.fur, P.paws);
    // steam, drawn over the chin
    dots(cv, [[45, 58], [45, 57], [44, 56], [44, 55], [45, 54], [45, 53], [44, 52], [44, 51]], C.steam);
    dots(cv, [[50, 58], [50, 57], [51, 56], [51, 55], [50, 54], [50, 53], [51, 52], [51, 51]], C.steam);
  } else {
    // paws resting free at the sides of the belly
    paint(cv, mirror(ellipse(29, 69, 6, 10)), C.fur, P.arms);
    paint(cv, mirror(ellipse(30, 75, 3, 2.5)), C.pad);
  }
  return finish(cv);
}

// Clean the silhouette, then add the outer outline and the inner part lines.
function finish(cv) {
  const solid = (x, y) => inside(x, y) && cv.col[y * S + x] !== null;
  // drop lone pixels and slivers so every edge pixel has at least two neighbours
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        if (!solid(x, y)) continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => solid(x + dx, y + dy)).length;
        if (n <= 1) {
          cv.col[y * S + x] = null;
          cv.part[y * S + x] = -1;
          changed = true;
        }
      }
  }
  const out = cv.col.slice();
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      if (!solid(x, y)) continue;
      const i = y * S + x;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      // the ground row counts as an edge so the soles get an outline
      if (y === S - 1 || nb.some(([dx, dy]) => !solid(x + dx, y + dy))) out[i] = C.out;
      else if (nb.some(([dx, dy]) => cv.part[(y + dy) * S + x + dx] < cv.part[i] && cv.part[(y + dy) * S + x + dx] >= 0))
        out[i] = C.line;
    }
  return out;
}

function toPng(cols) {
  const png = new PNG({ width: S, height: S });
  cols.forEach((c, i) => {
    if (!c) return;
    png.data.set([...c, 255], i * 4);
  });
  return PNG.sync.write(png);
}

if (require.main === module) {
  fs.writeFileSync(path.join(__dirname, 'bobee-master.png'), toPng(draw({ mug: true })));
  fs.writeFileSync(path.join(__dirname, 'bobee-master-nomug.png'), toPng(draw({ mug: false })));
  console.log('wrote art/bobee-master.png and art/bobee-master-nomug.png');
}

module.exports = { draw, C };
