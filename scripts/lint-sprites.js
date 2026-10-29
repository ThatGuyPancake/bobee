// Checks Bobee's sprite PNGs for common pixel-art mistakes.
// Usage: node scripts/lint-sprites.js [file.png ...]
// With no arguments it checks every strip in assets/bobee/ and the masters in art/.
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const FRAME = 96;
const TOP_MARGIN = 4; // masters keep this many empty rows at the top for hearts and Zs
const HOPS = new Set(['happy']); // strips whose frames jump on purpose, so their feet leave the ground

// image: { width, height, data } with RGBA bytes. Returns a list of problem strings.
function lintImage(img, { master = false, hops = false } = {}) {
  const { width: w, height: h, data } = img;
  const problems = [];
  const alpha = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : data[(y * w + x) * 4 + 3]);
  const where = (x, y) => `frame ${Math.floor(x / FRAME)} pixel (${x % FRAME},${y})`;

  if (h !== FRAME) problems.push(`height is ${h}, expected ${FRAME}`);
  if (w % FRAME !== 0) {
    problems.push(`width ${w} is not a multiple of ${FRAME}`);
    return problems;
  }
  if (master && w !== FRAME) problems.push(`master should be one ${FRAME}x${FRAME} frame, got width ${w}`);

  const frames = w / FRAME;
  // Opaque within the same frame only, so frames don't count as each other's neighbours.
  const solid = (x, y, f) => x >= f * FRAME && x < (f + 1) * FRAME && alpha(x, y) === 255;
  const grounds = [];

  for (let f = 0; f < frames; f++) {
    let ground = -1;
    let top = -1;
    for (let y = 0; y < h; y++) {
      for (let x = f * FRAME; x < (f + 1) * FRAME; x++) {
        const a = alpha(x, y);
        if (a === 0) continue;
        if (a !== 255) {
          problems.push(`${where(x, y)} is partly transparent (alpha ${a})`);
          continue;
        }
        if (top < 0) top = y;
        ground = y;
        const lx = x - f * FRAME;
        // The bottom row is the ground, so feet may touch it.
        if (lx === 0 || lx === FRAME - 1 || y === 0) problems.push(`${where(x, y)} touches the frame edge`);
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => solid(x + dx, y + dy, f)).length;
        if (n <= 1) problems.push(`${where(x, y)} is an isolated pixel (${n} opaque neighbour${n === 1 ? '' : 's'})`);
      }
    }
    if (ground < 0) problems.push(`frame ${f} is empty`);
    grounds.push(ground);
    if (master && ground >= 0) {
      if (ground !== h - 1) problems.push(`frame ${f} feet are on row ${ground}, expected the bottom row ${h - 1}`);
      if (top < TOP_MARGIN) problems.push(`frame ${f} starts on row ${top}, keep the top ${TOP_MARGIN} rows free`);
    }
  }

  const used = grounds.filter((g) => g >= 0);
  if (!hops && used.length > 1 && new Set(used).size > 1) {
    problems.push(`feet are not on the same ground row: ${grounds.map((g, f) => `frame ${f}: row ${g}`).join(', ')}`);
  }
  return problems;
}

function lintFile(file) {
  const img = PNG.sync.read(fs.readFileSync(file));
  const name = path.basename(file);
  return lintImage(img, { master: /^bobee-master.*\.png$/.test(name), hops: HOPS.has(name.replace(/\.png$/, '')) });
}

function defaultFiles(root = path.join(__dirname, '..')) {
  const list = (dir, re) =>
    fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort().map((f) => path.join(dir, f)) : [];
  return [...list(path.join(root, 'assets', 'bobee'), /\.png$/), ...list(path.join(root, 'assets', 'props'), /\.png$/), ...list(path.join(root, 'art'), /^bobee-master.*\.png$/)];
}

if (require.main === module) {
  const files = process.argv.length > 2 ? process.argv.slice(2) : defaultFiles();
  let failed = 0;
  for (const file of files) {
    const problems = lintFile(file);
    const name = path.relative(process.cwd(), file);
    if (!problems.length) {
      console.log(`ok   ${name}`);
      continue;
    }
    failed++;
    console.log(`FAIL ${name} (${problems.length} problem${problems.length === 1 ? '' : 's'})`);
    for (const p of problems.slice(0, 20)) console.log(`     ${p}`);
    if (problems.length > 20) console.log(`     ...and ${problems.length - 20} more`);
  }
  process.exitCode = failed ? 1 : 0;
}

module.exports = { FRAME, TOP_MARGIN, HOPS, lintImage, lintFile, defaultFiles };
