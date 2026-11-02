import { it, expect } from 'vitest';
import { createBrain } from '../renderer/brain.js';
it('gets mopey, walks to a jar, eats once and perks up, with no away debt', async () => {
  const { createSnack } = await import('../renderer/snack.js');
  const events = []; const s = createSnack({ walk: x => events.push(['walk', x]), eat: () => events.push(['eat']), moment: name => events.push([name]) });
  s.jar(200); s.tick(29000, true, 0); expect(events).toEqual([]);
  s.tick(1000, true, 0); expect(s.phase()).toBe('mopey');
  s.tick(3000, true, 0); expect(events).toContainEqual(['walk', 200]);
  s.tick(100, true, 198); expect(events).toContainEqual(['eat']);
  s.tick(10000, true, 198); expect(events.filter(e => e[0] === 'eat')).toHaveLength(1);
  s.jar(300); s.tick(100000, false, 0); s.tick(100000, true, 0); expect(s.phase()).toBe(null);
});
it('brain walks to a snack target without random walking replacing it', () => {
  const b = createBrain({ minX: 0, maxX: 1000, x: 500, visits: false, random: () => 0 });
  b.walkTo(600);
  b.tick(100); b.keyPulse();
  let out; for (let i = 0; i < 200; i++) out = b.tick(100);
  expect(out.x).toBe(600); b.endSnack();
});
