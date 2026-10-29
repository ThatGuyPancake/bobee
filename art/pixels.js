const fs = require('fs');
const { PNG } = require('pngjs');
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
    const copy = new Img(this.w, this.h, Buffer.from(this.d));
    copy.headOffset = this.headOffset;
    return copy;
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


module.exports = { C, Img, lum, sat, paint, readPng, writePng };
