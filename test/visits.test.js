import { describe, it, expect } from 'vitest';
import {
  HOUR_MS,
  VISITS_PER_HOUR,
  VISIT_BUDGET_MS,
  VISIT_MIN_MS,
  VISIT_MAX_MS,
  VISIT_JITTER_MS,
  makePlan,
} from '../renderer/visits.js';

describe('visit plan', () => {
  it('has the same constants as before', () => {
    expect(HOUR_MS).toBe(3600000);
    expect(VISITS_PER_HOUR).toBe(6);
    expect(VISIT_BUDGET_MS).toBe(600000);
    expect(VISIT_MIN_MS).toBe(85000);
    expect(VISIT_MAX_MS).toBe(100000);
    expect(VISIT_JITTER_MS).toBe(120000);
  });

  it('spaces six visits evenly, the hello right away', () => {
    const plan = makePlan(() => 0, true);
    expect(plan.length).toBe(6);
    expect(plan[0].start).toBe(0);
    for (let i = 1; i < 6; i++) expect(plan[i].start).toBe(i * 600000);
  });

  it('scales each visit by durFactor', () => {
    for (const v of makePlan(() => 0.5, false, 0.7)) expect(v.dur).toBe((85000 + 0.5 * 15000) * 0.7);
  });

  it('keeps starts strictly increasing', () => {
    const plan = makePlan(() => 0.999, false);
    for (let i = 1; i < plan.length; i++) expect(plan[i].start).toBeGreaterThan(plan[i - 1].start);
  });
});
