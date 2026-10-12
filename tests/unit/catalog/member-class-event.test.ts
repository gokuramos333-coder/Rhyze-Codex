import { describe, expect, it } from 'vitest';
import { isMemberClassEvent, isPublicEvent } from '@/lib/catalog/member-class-event';
import { prioritizeMemberEventCredits } from '@/lib/domain/bookings/member-event-credits';
import { cancellationCreditDecision } from '@/lib/domain/bookings/cancellation-credit';
import { cancellationPolicyDecision } from '@/lib/domain/bookings/cancellation-policy';

const rachel = { slug: 'soul-line-dancing-rachel', isEvent: false };
describe('Rachel member-credit event boundary', () => {
  it('advertises only the named class as an event without changing specialty admission', () => {
    expect(isPublicEvent(rachel)).toBe(true);
    expect(isMemberClassEvent(rachel)).toBe(true);
    expect(isPublicEvent({ slug: 'other-class', isEvent: false })).toBe(false);
    expect(isPublicEvent({ slug: 'mommy-and-me-dennisse', isEvent: true })).toBe(true);
    expect(isMemberClassEvent({ ...rachel, isEvent: true })).toBe(false);
  });
  it('does not spend a finite event credit before unlimited or ordinary class credits', () => {
    const accounts = [
      { label: 'Event credit — VIP complimentary', isUnlimited: false },
      { label: 'Ritual class credits', isUnlimited: false },
      { label: 'VIP', isUnlimited: true },
    ];
    expect(prioritizeMemberEventCredits(accounts, rachel)).toEqual([accounts[2], accounts[1], accounts[0]]);
    expect(accounts[0].label).toContain('Event credit');
    expect(prioritizeMemberEventCredits(accounts, { slug: 'other-event', isEvent: true })).toBe(accounts);
  });
  it('an early VIP cancellation cannot manufacture a replacement event credit', () => {
    const decision = cancellationPolicyDecision({ startAt: new Date('2026-10-16T23:30Z'), requestedAt: new Date('2026-10-15T12:00Z'), accessType: 'VIP', isEvent: rachel.isEvent, hasReservedCredit: false });
    expect(decision).toMatchObject({ feeCents: 0, restoreCredit: false });
    expect(cancellationCreditDecision({ isEvent: rachel.isEvent, restoreCredit: decision.restoreCredit, hasReservation: false })).toBe('NONE');
  });
});
