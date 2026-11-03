import { expect, it } from 'vitest';
import * as domain from '@/lib/newsletters/domain';
it('formats outreach in explicit Eastern time, including daylight savings', () => {
  expect(typeof (domain as any).outreachTimestamp).toBe('function');
  const format = (domain as any).outreachTimestamp;
  expect(format('2026-11-03T16:00:22.770Z')).toBe('11/3/2026, 11:00:22 AM EST');
  expect(format('2026-10-20T15:22:33Z')).toBe('10/20/2026, 11:22:33 AM EDT');
});
