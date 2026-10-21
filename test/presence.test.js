import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const { presenceFrom } = createRequire(import.meta.url)('../lib/presence.js');

describe('presenceFrom', () => {
  it('is active below 300s', () => {
    expect(presenceFrom(0)).toBe('active');
    expect(presenceFrom(299)).toBe('active');
  });
  it('is idle at 300s and above', () => {
    expect(presenceFrom(300)).toBe('idle');
    expect(presenceFrom(9999)).toBe('idle');
  });
});
