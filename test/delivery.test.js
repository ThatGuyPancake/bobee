import { it, expect, vi, afterEach } from 'vitest';
afterEach(() => vi.useRealTimers());
async function setup(extra = {}) {
  vi.useFakeTimers(); const { createDelivery } = await import('../renderer/delivery.js');
  const done = vi.fn(), announce = vi.fn(), changed = vi.fn();
  const delivery = createDelivery({ done, announce, changed, random: () => 0, ...extra });
  return { delivery, done, announce, changed };
}
it('announces and waits for Bobee to be clicked without consuming the drawing', async () => {
  const { delivery: d, done, announce } = await setup();
  d.show({ id: 'a' }); expect(d.phase()).toBe('waiting');
  expect(announce).toHaveBeenCalledWith('I have something for you');
  vi.advanceTimersByTime(3600000); expect(done).not.toHaveBeenCalled(); expect(d.active()).toBe(true);
  expect(d.dismiss()).toBe(false);
  expect(d.reveal()).toBe(true); expect(d.phase()).toBe('revealing');
  expect(d.reveal()).toBe(false);
  vi.advanceTimersByTime(950); expect(d.phase()).toBe('showing');
  vi.advanceTimersByTime(19999); expect(done).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(d.phase()).toBe('stowing'); expect(done).not.toHaveBeenCalled();
  vi.advanceTimersByTime(949); expect(done).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(done).toHaveBeenCalledExactlyOnceWith('a');
});
it('cancels old timers on deferral or queue advance and invites for each new drawing', async () => {
  const { delivery: d, done, announce } = await setup({ random: () => 0.9 });
  d.show({ id: 'a' }); expect(announce).toHaveBeenCalledWith('Special delivery');
  d.reveal(); vi.advanceTimersByTime(400); d.show(null);
  vi.advanceTimersByTime(30000); expect(done).not.toHaveBeenCalled(); expect(d.active()).toBe(false);
  d.show({ id: 'a' }); expect(d.phase()).toBe('waiting'); d.reveal(); vi.advanceTimersByTime(950);
  expect(d.dismiss()).toBe(true); expect(d.phase()).toBe('stowing'); expect(done).not.toHaveBeenCalled();
  expect(d.dismiss()).toBe(false); vi.advanceTimersByTime(950); expect(done).toHaveBeenCalledWith('a');
  d.show({ id: 'b' }); vi.advanceTimersByTime(30000);
  expect(d.phase()).toBe('waiting'); expect(done).toHaveBeenCalledTimes(1);
});
it('does not complete an interrupted put-away or leak its timer into the next drawing', async () => {
  const { delivery: d, done } = await setup();
  d.show({ id: 'a' }); d.reveal(); vi.advanceTimersByTime(950); d.dismiss();
  vi.advanceTimersByTime(400); d.show(null); vi.advanceTimersByTime(1000);
  expect(done).not.toHaveBeenCalled();
  d.show({ id: 'a' }); d.reveal(); vi.advanceTimersByTime(950); d.dismiss();
  d.show({ id: 'b' }); vi.advanceTimersByTime(5000);
  expect(done).not.toHaveBeenCalled(); expect(d.phase()).toBe('waiting');
});
it('respects reduced motion and still waits for a deliberate click', async () => {
  const { delivery: d, done } = await setup({ reduced: () => true });
  d.show({ id: 'a' }); expect(d.phase()).toBe('waiting'); d.reveal();
  expect(d.phase()).toBe('showing'); vi.advanceTimersByTime(20000);
  expect(done).toHaveBeenCalledExactlyOnceWith('a');
});
