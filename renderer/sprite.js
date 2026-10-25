export const FRAME = 64;
// Canvas size in px. Frames are square and drawn at the largest whole
// scale that fits: 96px art at 1x, 64px placeholders at 1x.
export const CANVAS = 96;

export const NAMES = ['idle', 'walk', 'sleep', 'drag', 'happy', 'wave', 'sip', 'yawn', 'pet', 'sleep-pet'];
export const DEFAULT_FPS = { idle: 4, walk: 9, sleep: 2, drag: 8, happy: 9, wave: 8, sip: 5, yawn: 5, pet: 7, 'sleep-pet': 4 };
const OVERRIDE_FPS = 6;

// Frames are square: the strip's height is the frame size.
export function stripInfo(width, height = FRAME) {
  const size = height > 0 ? height : FRAME;
  if (width > 0 && width % size === 0) {
    return { count: width / size, frameWidth: size, frameHeight: size };
  }
  return { count: 1, frameWidth: width > 0 ? width : size, frameHeight: size };
}

function infoOf(img) {
  return stripInfo(img.naturalWidth || img.width, img.naturalHeight || img.height);
}

export function frameIndex(elapsedMs, fps, count) {
  if (count <= 1) return 0;
  return Math.floor((Math.max(0, elapsedMs) * fps) / 1000) % count;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export class SpritePlayer {
  constructor(canvas, { baseUrl = '/assets' } = {}) {
    this.canvas = canvas;
    this.baseUrl = baseUrl;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.ctx.imageSmoothingEnabled = false;
    canvas.width = CANVAS;
    canvas.height = CANVAS;
    this.strips = {};
    this.current = 'idle';
    this.startMs = null;
    this.facing = 'right';
    this.override = null;
  }

  async load(fpsOverrides = {}) {
    for (const name of NAMES) {
      const img =
        (await loadImage(`${this.baseUrl}/bobee/${name}.png`)) ||
        (await loadImage(`${this.baseUrl}/placeholder/${name}.png`));
      if (!img) continue;
      const { count, frameWidth, frameHeight } = infoOf(img);
      this.strips[name] = {
        img,
        count,
        frameWidth,
        frameHeight,
        fps: fpsOverrides[name] ?? DEFAULT_FPS[name],
      };
    }
  }

  play(name) {
    if (name === this.current) return;
    this.current = name;
    this.startMs = null;
  }

  setFacing(dir) {
    this.facing = dir === 'left' ? 'left' : 'right';
  }

  playOverride(img, { durationMs }) {
    const { count, frameWidth, frameHeight } = infoOf(img);
    this.override = {
      img,
      count,
      frameWidth,
      frameHeight,
      durationMs,
      startMs: null,
    };
  }

  durationOf(name, loops = 1) {
    const s = this.strips[name];
    if (!s) return 0;
    return (s.count / s.fps) * 1000 * loops;
  }

  draw(nowMs) {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    ctx.clearRect(0, 0, w, h);

    let strip;
    let elapsed;
    let fps;
    if (this.override) {
      const o = this.override;
      if (o.startMs === null) o.startMs = nowMs;
      if (nowMs - o.startMs >= o.durationMs) {
        this.override = null;
      } else {
        strip = o;
        elapsed = nowMs - o.startMs;
        fps = OVERRIDE_FPS;
      }
    }
    if (!strip) {
      strip = this.strips[this.current];
      if (!strip) return;
      if (this.startMs === null) this.startMs = nowMs;
      elapsed = nowMs - this.startMs;
      fps = strip.fps;
    }

    const idx = frameIndex(elapsed, fps, strip.count);
    const scale = Math.max(1, Math.floor(h / strip.frameHeight));
    const dw = strip.frameWidth * scale;
    const dh = strip.frameHeight * scale;
    const dy = h - dh;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (this.facing === 'left') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    const dx = Math.floor((w - dw) / 2);
    ctx.drawImage(
      strip.img,
      idx * strip.frameWidth,
      0,
      strip.frameWidth,
      strip.frameHeight,
      dx,
      dy,
      dw,
      dh
    );
    ctx.restore();
  }

  isOpaqueAt(canvasX, canvasY) {
    const x = Math.floor(canvasX);
    const y = Math.floor(canvasY);
    if (x < 0 || y < 0 || x >= this.canvas.width || y >= this.canvas.height) {
      return false;
    }
    return this.ctx.getImageData(x, y, 1, 1).data[3] > 0;
  }
}
