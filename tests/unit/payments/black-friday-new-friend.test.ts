import { describe, expect, it } from 'vitest';
import { blackFridayOffer, assessNewFriend, normalizeFriendPhone } from '@/lib/payments/black-friday-new-friend';

const terms = { templateId:'cmvv992ko0001l809nmth9b44', occurrenceId: 'cmvv9bp4g0001gt09ewtk8n57', slug: 'rhyzology-black-friday-neon-choreo-party-mvv992kn', startAt: new Date('2026-11-28T00:30:00Z'), endAt: new Date('2026-11-28T01:45:00Z'), priceCents: 2500, isEvent: true };
const friend = { fullName: 'New Friend', phone: '(201) 555-0123' };
const candidate = { id: 'friend', name: 'New Friend', phone: '+12015550123', attended: false, unresolvedPastBooking: false, importedWorkouts: 0, importedLastWorkoutAt: null };

describe('canonical Black Friday new-friend policy', () => {
  it('binds only the exact live occurrence and approved server terms', () => {
    expect(blackFridayOffer(terms)).toEqual({ singlePriceCents: 2500, pairPriceCents: 4000, singleLabel: 'One person — $25', pairLabel: 'Me + a NEW friend — $40 total' });
    for (const changed of [{ occurrenceId: 'other' }, { slug: 'rhyzology-the-black-friday-neon-edition-mvv3ymfj' }, { priceCents: 4000 }, { isEvent: false }, { endAt: new Date('2026-11-28T01:30:00Z') }, { startAt: new Date('2026-11-27T00:30:00Z') }]) expect(blackFridayOffer({ ...terms, ...changed })).toBeNull();
  });
  it('normalizes US formatting but rejects ambiguous international local numbers', () => {
    expect(normalizeFriendPhone(friend.phone)).toBe('+12015550123');
    expect(normalizeFriendPhone('1-201-555-0123')).toBe('+12015550123');
    expect(normalizeFriendPhone('+44 20 7946 0958')).toBe('+442079460958');
    for (const phone of ['442079460958', '2015550123 ext 9', 'abc2015550123', '', '+0123456789']) expect(normalizeFriendPhone(phone)).toBeNull();
  });
  it('requires a full name and phone; no record is not evidence of a new visitor', () => {
    expect(assessNewFriend({ ...friend, fullName: 'New' }, 'buyer', [])).toMatchObject({ status: 'INVALID_CONTACT' });
    expect(assessNewFriend(friend, 'buyer', [])).toMatchObject({ status: 'DECLARATION_REQUIRED', reason: 'FIRST_VISIT_DECLARATION_REQUIRED' });
  });
  it('rejects the buyer and known native or imported attendance', () => {
    expect(assessNewFriend(friend, 'friend', [candidate])).toMatchObject({ status: 'INELIGIBLE', reason: 'BUYER_IS_FRIEND' });
    for (const history of [{ attended: true }, { importedWorkouts: 1 }, { importedLastWorkoutAt: new Date('2020-01-01') }]) expect(assessNewFriend(friend, 'buyer', [{ ...candidate, ...history }])).toMatchObject({ status: 'INELIGIBLE', reason: 'PRIOR_ATTENDANCE' });
  });
  it('fails closed for shared phones, name collisions, changed contact and incomplete history', () => {
    expect(assessNewFriend(friend, 'buyer', [candidate, { ...candidate, id: 'other' }])).toMatchObject({ status: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_IDENTITY' });
    expect(assessNewFriend(friend, 'buyer', [{ ...candidate, name: 'Other Person' }])).toMatchObject({ status: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_IDENTITY' });
    expect(assessNewFriend(friend, 'buyer', [{ ...candidate, phone: '+12015550999' }])).toMatchObject({ status: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_IDENTITY' });
    expect(assessNewFriend(friend, 'buyer', [{ ...candidate, id: 'other', name: 'Other Person', attended: true }])).toMatchObject({ status: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_IDENTITY' });
    expect(assessNewFriend(friend, 'buyer', [{ ...candidate, unresolvedPastBooking: true }])).toMatchObject({ status: 'REVIEW_REQUIRED', reason: 'UNRESOLVED_ATTENDANCE' });
    expect(assessNewFriend(friend, 'buyer', [candidate])).toMatchObject({ status: 'DECLARATION_REQUIRED', reason: 'FIRST_VISIT_DECLARATION_REQUIRED' });
  });
});
