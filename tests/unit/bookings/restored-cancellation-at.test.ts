import { describe, expect, it } from 'vitest';
import { restoredCancellationAt } from '@/lib/domain/bookings/restored-cancellation-at';

describe('restored cancellation history', () => {
  const early = new Date('2026-09-27T20:24:09.334Z');
  const overwritten = new Date('2026-09-29T16:52:42.579Z');
  const now = new Date('2026-10-27T01:00:00Z');
  it('recovers the original early cancellation from its existing replacement grant', () => {
    expect(restoredCancellationAt(overwritten, now, { createdAt: early, reason: 'Early event cancellation replacement credit' })).toEqual(early);
  });
  it('never moves an earlier cancellation forward', () => {
    const original = new Date('2026-09-27T20:24:09.305Z');
    expect(restoredCancellationAt(original, now, { createdAt: early, reason: 'Early event cancellation replacement credit' })).toEqual(original);
  });
  it('does not backdate history from an unrelated manual grant', () => {
    expect(restoredCancellationAt(overwritten, now, { createdAt: early, reason: 'Manual event cancellation credit restore' })).toEqual(overwritten);
  });
  it('uses the restore time only when no cancellation or early grant exists', () => {
    expect(restoredCancellationAt(null, now, null)).toEqual(now);
  });
});
