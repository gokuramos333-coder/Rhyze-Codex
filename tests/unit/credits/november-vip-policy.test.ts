import { describe, expect, it } from 'vitest';
import { eventCreditCanBook } from '@/lib/domain/bookings/booking-rules';
import { vipMonthlyBenefitWindow } from '@/lib/domain/credits/vip-monthly-benefits';
const input = { label: 'Event credit — November 2026 VIP complimentary event credit', sourceProductKind: null, isEvent: true, instructorName: 'Tricia Johnsen', occurrenceStartsAt: new Date('2026-11-15T17:00Z'), now: new Date('2026-11-01T04:00Z'), validFrom: new Date('2026-11-01T04:00Z'), validUntil: new Date('2026-12-01T05:00Z') };
describe('November-only VIP ANY-event policy', () => {
  it('accepts Tricia with an existing valid monthly event credit', () => expect(eventCreditCanBook(input)).toBe(true));
  it.each(['Tricia Johnsen', 'Vanessa', 'Other instructor'])('accepts ANY November event: %s', instructorName => expect(eventCreditCanBook({ ...input, instructorName })).toBe(true));
  it.each(['2026-11-01T03:59:59.999Z', '2026-12-01T05:00:00Z', '2027-11-15T17:00Z'])('retains exclusions outside November Eastern: %s', date => expect(eventCreditCanBook({ ...input, occurrenceStartsAt: new Date(date) })).toBe(false));
  it('allows both Eastern month boundaries inside the month', () => {
    for (const date of ['2026-11-01T04:00Z', '2026-12-01T04:59:59.999Z']) expect(eventCreditCanBook({ ...input, occurrenceStartsAt: new Date(date) })).toBe(true);
  });
  it.each([
    { validUntil: new Date('2026-11-15T17:00Z') },
    { validFrom: new Date('2026-11-16T17:00Z') },
    { now: new Date('2026-12-01T05:00Z') },
    { validUntil: null }, { validFrom: undefined },
    { label: 'Ordinary class credit' }, { sourceProductKind: 'VIP' },
  ])('does not bypass validity or credit kind: %j', change => expect(eventCreditCanBook({ ...input, ...change })).toBe(false));
  it('does not reinterpret absent dates as November', () => expect(eventCreditCanBook({ ...input, occurrenceStartsAt: undefined })).toBe(false));
  it('keeps previous/future grant copy and November expiry/no rollover', () => {
    const november = vipMonthlyBenefitWindow({ year: 2026, monthIndex: 10 });
    expect(november.eventGrantReason).toContain('ANY event');
    expect(november.eventGrantReason).not.toContain('excludes Tricia');
    expect(november.eventGrantReason).toContain('no rollover');
    expect(november.validUntil.toISOString()).toBe('2026-12-01T05:00:00.000Z');
    for (const monthIndex of [9, 11]) expect(vipMonthlyBenefitWindow({ year: 2026, monthIndex }).eventGrantReason).toContain('excludes Tricia');
  });
});
