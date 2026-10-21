'use strict';
const fs = require('node:fs');
const path = require('node:path');

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

// Lexical gate for bobee://app/<path> URLs. Returns an absolute path or null.
function resolveAppPath(urlStr, root, allowedTop) {
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    return null;
  }
  if (url.host !== 'app') return null;
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (rel.includes('\0')) return null;
  const full = path.resolve(root, '.' + path.sep + rel.replace(/^(?:\/|\\)+/, ''));
  const r = path.relative(root, full);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) return null;
  const parts = r.split(path.sep);
  if (parts.some((p) => p.includes(':') || RESERVED.test(p))) return null;
  if (!allowedTop.has(parts[0].toLowerCase())) return null;
  return full;
}

function inside(root, target) {
  const r = path.relative(root, target);
  return !!r && !r.startsWith('..') && !path.isAbsolute(r);
}

// Lexical gate plus a realpath re-check (symlink/junction escape).
// realpath is skipped for paths inside app.asar, which has no symlinks.
async function resolveSafePath(urlStr, root, allowedTop) {
  const full = resolveAppPath(urlStr, root, allowedTop);
  if (!full) return null;
  if (/\.asar([\\/]|$)/i.test(full)) return full;
  try {
    const [realRoot, realFull] = await Promise.all([fs.promises.realpath(root), fs.promises.realpath(full)]);
    return inside(realRoot, realFull) ? full : null;
  } catch {
    return null;
  }
}

module.exports = { resolveAppPath, resolveSafePath };
