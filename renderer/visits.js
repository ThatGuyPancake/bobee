// Visits: each hour of active screen time gets VISITS_PER_HOUR evenly spaced
// visits, each nudged later by up to VISIT_JITTER_MS so it doesn't feel
// mechanical. Visits last VISIT_MIN_MS to VISIT_MAX_MS (waking and walking
// home included) and add up to at most VISIT_BUDGET_MS per hour. Between
// visits he naps at home.
export const HOUR_MS = 60 * 60 * 1000;
export const VISITS_PER_HOUR = 6;
export const VISIT_BUDGET_MS = 10 * 60 * 1000;
export const VISIT_MIN_MS = 85 * 1000;
export const VISIT_MAX_MS = 100 * 1000;
export const VISIT_JITTER_MS = 2 * 60 * 1000;

// One hour's visits as { start, dur } in ms into the hour. withHello starts
// the first one right away; durFactor scales every visit (evening: 0.7).
export function makePlan(random, withHello, durFactor = 1) {
  const rand = (a, b) => a + random() * (b - a);
  const slot = HOUR_MS / VISITS_PER_HOUR;
  const out = [];
  for (let i = 0; i < VISITS_PER_HOUR; i++) {
    const dur = rand(VISIT_MIN_MS, VISIT_MAX_MS) * durFactor;
    const start = withHello && i === 0 ? 0 : i * slot + rand(0, VISIT_JITTER_MS);
    out.push({ start, dur });
  }
  return out;
}
