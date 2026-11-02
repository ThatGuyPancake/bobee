import { it, expect, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const load = () => require('../lib/linkInbox');
const drawing = (id, sequence) => ({ id, sequence, pixels: '00'.repeat(64 * 64 * 4) });
const tempDirs = [];
afterEach(() => { for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const file = () => { const dir = fs.mkdtempSync(path.join(path.resolve('test'), 'bobee-link-')); tempDirs.push(dir); return path.join(dir, 'inbox.json'); };
it('durably queues, orders, deduplicates and recovers unfinished presentations', () => {
  const { createInbox } = load(); const f = file(); const q = createInbox(f);
  q.ingest([drawing('b', 2), drawing('a', 1), drawing('a', 1)]);
  expect(q.next().id).toBe('a'); expect(q.next().id).toBe('a');
  expect(createInbox(f).next().id).toBe('a');
  expect(q.complete('b')).toBe(false); expect(q.complete('a')).toBe(true);
  q.ingest([drawing('a', 1)]); expect(q.next().id).toBe('b');
  expect(createInbox(f).receipts()).toContainEqual({ id: 'a', status: 'completed' });
});
it('rejects malformed payload and never acknowledges failed disk persistence', () => {
  const { createInbox } = load(); const q = createInbox(file());
  expect(() => q.ingest([drawing('x', 1), { id: 'bad' }])).toThrow();
  expect(q.next()).toBe(null);
  const fail = createInbox(file(), { fs: { ...fs, writeFileSync() { throw Error('full'); } } });
  expect(() => fail.ingest([drawing('a', 1)])).toThrow('full'); expect(fail.receipts()).toEqual([]);
  const broken = file(); fs.writeFileSync(broken, '{broken');
  expect(() => createInbox(broken)).toThrow();
});
it('serializes polls/presentations, retries offline acknowledgements, and defers locked screens', async () => {
  const { createInbox } = load(); const { createReceiver } = require('../lib/linkReceiver');
  const q = createInbox(file()); let offline = true, calls = 0; const boards = [];
  const r = createReceiver({ inbox: q, request: async (route) => {
    if (offline) throw Error('offline');
    if (route === '/api/inbox') { calls++; await Promise.resolve(); return { deliveries: [drawing('a', 1), drawing('b', 2)] }; }
    return {};
  }, show: d => boards.push(d?.id || null) });
  await r.poll(); expect(boards).toEqual([]);
  offline = false; r.defer(true); await Promise.all([r.poll(), r.poll()]);
  expect(calls).toBe(1); expect(boards.filter(Boolean)).toEqual([]);
  r.defer(false); expect(boards.at(-1)).toBe('a');
  expect(r.finish('b')).toBe(false); expect(r.finish('a')).toBe(true); expect(boards.at(-1)).toBe('b');
  r.defer(true); expect(boards.at(-1)).toBe(null); r.defer(false); expect(boards.at(-1)).toBe('b');
  r.finish('b'); await r.poll(); expect(boards.at(-1)).toBe(null);
  expect(q.next()).toBe(null);
});
