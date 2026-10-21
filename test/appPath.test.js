import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const { resolveAppPath, resolveSafePath } = createRequire(import.meta.url)('../lib/appPath.js');

const root = path.resolve('/fake/root');
const top = new Set(['renderer', 'assets', 'messages.json']);
const r = (p) => resolveAppPath('bobee://app/' + p, root, top);

describe('resolveAppPath', () => {
  it('allows normal files', () => {
    expect(r('renderer/index.html')).toBe(path.join(root, 'renderer', 'index.html'));
    expect(r('messages.json')).toBe(path.join(root, 'messages.json'));
  });
  it('rejects traversal, other hosts, other top dirs, colons, NULs', () => {
    expect(r('renderer/../main.js')).toBeNull();
    expect(r('%2e%2e/main.js')).toBeNull();
    expect(r('main.js')).toBeNull();
    expect(r('renderer/a:b')).toBeNull();
    expect(r('renderer/a%00b')).toBeNull();
    expect(resolveAppPath('bobee://evil/renderer/x', root, top)).toBeNull();
  });
  it('rejects reserved device names', () => {
    for (const n of ['con', 'NUL', 'aux.txt', 'com1', 'lpt9.png', 'prn.x.y']) {
      expect(r('renderer/' + n)).toBeNull();
      expect(r('assets/' + n + '/f.png')).toBeNull();
    }
    expect(r('renderer/console.js')).not.toBeNull();
    expect(r('renderer/com10.js')).not.toBeNull();
  });
});

describe('resolveSafePath', () => {
  it('404s missing files and allows real ones', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobee-'));
    fs.mkdirSync(path.join(dir, 'renderer'));
    fs.writeFileSync(path.join(dir, 'renderer', 'a.js'), 'x');
    expect(await resolveSafePath('bobee://app/renderer/a.js', dir, top)).toBe(path.join(dir, 'renderer', 'a.js'));
    expect(await resolveSafePath('bobee://app/renderer/none.js', dir, top)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it('rejects symlink escapes', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bobee-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bobee-out-'));
    fs.writeFileSync(path.join(outside, 's.txt'), 'secret');
    fs.mkdirSync(path.join(dir, 'renderer'));
    try {
      fs.symlinkSync(outside, path.join(dir, 'renderer', 'link'), 'junction');
    } catch {
      return; // cannot create links here
    }
    expect(await resolveSafePath('bobee://app/renderer/link/s.txt', dir, top)).toBeNull();
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });
});
