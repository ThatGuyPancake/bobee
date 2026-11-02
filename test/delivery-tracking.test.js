import { it, expect, vi } from 'vitest';
async function setup(extra = {}) {
  const { createTracking } = await import('../link/public/tracking.js');
  let saved = []; const changed = vi.fn();
  const request = vi.fn(async ids => ({ deliveries: ids.map(id => ({ id, status: 'received' })) }));
  const options = { read: () => saved, write: rows => { saved = rows; }, changed, request, now: () => 10, ...extra };
  const tracker = createTracking(options);
  return { tracker, request, changed, options, saved: () => saved };
}
it('persists recent accepted IDs and resumes checking after page refresh', async () => {
  const s = await setup(); s.tracker.sent('one'); expect(s.saved()).toEqual([{ id: 'one', status: 'queued', sentAt: 10 }]);
  const { createTracking } = await import('../link/public/tracking.js');
  const restored = createTracking(s.options); await restored.poll();
  expect(s.saved()[0].status).toBe('received');
  for (let i = 0; i < 25; i++) restored.sent('art-' + i);
  expect(restored.rows()).toHaveLength(20); expect(restored.rows()[0].id).toBe('art-24');
});
it('keeps confirmed receipts during disconnection, retries, and stops checking displayed art', async () => {
  const s = await setup(); s.tracker.sent('one'); await s.tracker.poll();
  s.request.mockRejectedValueOnce(Error('offline')); await s.tracker.poll();
  expect(s.tracker.rows()[0].status).toBe('received'); expect(s.changed.mock.calls.at(-1)[1]).toBe(true);
  s.request.mockResolvedValue({ deliveries: [{ id: 'one', status: 'displayed' }] }); await s.tracker.poll();
  expect(s.tracker.rows()[0].status).toBe('displayed'); const n = s.request.mock.calls.length;
  await s.tracker.poll(); expect(s.request).toHaveBeenCalledTimes(n);
});
it('serializes checks, rejects backward status changes and ignores stale responses after forgetting', async () => {
  let resolve; const s = await setup({ request: () => new Promise(r => { resolve = r; }) });
  s.tracker.sent('one'); const checking = s.tracker.poll(); await s.tracker.poll();
  s.tracker.clear(); resolve({ deliveries: [{ id: 'one', status: 'received' }] }); await checking;
  expect(s.tracker.rows()).toEqual([]);
  const t = await setup(); t.tracker.sent('two'); await t.tracker.poll();
  t.request.mockResolvedValue({ deliveries: [{ id: 'two', status: 'queued' }] }); await t.tracker.poll();
  expect(t.tracker.rows()[0].status).toBe('received');
});
it('recovers past sends from the service even when this browser has no local tracking history', async () => {
  const s = await setup({ request: async () => ({ deliveries: [{ id: 'past', sentAt: 1, status: 'received' }] }) });
  await s.tracker.history(); expect(s.tracker.rows()).toEqual([{ id: 'past', sentAt: 1, status: 'received' }]);
});
it('keeps the most recent service receipts when old cached history is full', async () => {
  const old = Array.from({ length: 20 }, (_, i) => ({ id: 'old-' + i, status: 'received', sentAt: i }));
  const fresh = Array.from({ length: 20 }, (_, i) => ({ id: 'new-' + i, status: 'received', sentAt: 100 + i }));
  const s = await setup({ read: () => old, request: async () => ({ deliveries: fresh }) });
  await s.tracker.history(); expect(s.tracker.rows().every(row => row.id.startsWith('new-'))).toBe(true);
});
it('retries failed startup recovery even when no local IDs are available to poll', async () => {
  const request = vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({ deliveries: [{ id: 'past', status: 'received', sentAt: 1 }] });
  const s = await setup({ request }); await s.tracker.history(); expect(s.tracker.rows()).toEqual([]);
  await s.tracker.poll(); expect(s.tracker.rows()[0]?.id).toBe('past');
});
