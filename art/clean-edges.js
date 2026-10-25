// Shaves the outer edge of a sprite frame so it has one clean dark outline:
// - pale anti-alias leftovers on the edge are removed (one pass, so fur is never peeled)
// - stray pixels sticking out (1 or fewer opaque neighbours, or 1px spikes) are removed
// - any edge pixel that isn't dark already becomes the outline colour
// Works on an Img-like object { w, h, get(x,y) -> [r,g,b]|null, set(x,y,c|null) }.
const OUTLINE = [84, 35, 34];
const PALE = 125; // fur is about 107, its highlight about 121; leftovers are paler
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

function cleanEdges(img, { x0 = 0, x1 = img.w - 1, ground = null, keep = () => false, log = null } = {}) {
  const solid = (x, y) => x >= x0 && x <= x1 && y >= 0 && y < img.h && img.get(x, y) !== null;
  const isEdge = (x, y) => N4.some(([dx, dy]) => !solid(x + dx, y + dy) && !(ground !== null && y + dy > ground));
  const note = (msg) => log && log.push(msg);
  // 1. one pass over the original edge: pale anti-alias leftovers go (fur itself is darker than this)
  const pale = [];
  for (let y = 0; y < img.h; y++)
    for (let x = x0; x <= x1; x++)
      if (solid(x, y) && !keep(x, y) && isEdge(x, y) && lum(img.get(x, y)) > PALE) pale.push([x, y]);
  for (const [x, y] of pale) {
    note(`removed (${x - x0},${y}) rgb ${img.get(x, y)}`);
    img.set(x, y, null);
  }
  // 2. drop lone pixels and 1px spikes until none are left
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 0; y < img.h; y++)
      for (let x = x0; x <= x1; x++) {
        if (!solid(x, y) || keep(x, y)) continue;
        const n = N4.filter(([dx, dy]) => solid(x + dx, y + dy)).length;
        const onGround = ground !== null && y === ground;
        const spike = (!solid(x - 1, y) && !solid(x + 1, y)) || (!solid(x, y - 1) && !solid(x, y + 1) && !onGround);
        if (n <= 1 || spike) {
          note(`removed (${x - x0},${y}) rgb ${img.get(x, y)}`);
          img.set(x, y, null);
          changed = true;
        }
      }
  }
  // 3. whatever edge pixel isn't dark yet becomes outline
  for (let y = 0; y < img.h; y++)
    for (let x = x0; x <= x1; x++) {
      if (!solid(x, y) || keep(x, y) || !isEdge(x, y)) continue;
      const c = img.get(x, y);
      if (lum(c) >= 75) {
        note(`outlined (${x - x0},${y}) was rgb ${c}`);
        img.set(x, y, OUTLINE);
      }
    }
  return img;
}

module.exports = { cleanEdges, OUTLINE };
