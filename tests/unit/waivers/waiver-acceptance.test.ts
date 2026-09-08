import { describe, expect, it } from 'vitest';
import {
  bookingWaiverDestination,
  eventCheckoutWaiverDestination,
  membershipWaiverDestination,
  parseAgreementAcceptance,
  parseSignedDate,
  waiverCompletionDestination,
} from '@/lib/domain/waivers/acceptance';

describe('digital agreement acceptance', () => {
  it('requires agreement acceptance but keeps media consent optional', () => {
    expect(
      parseAgreementAcceptance({ accepted: 'on', mediaConsent: null }),
    ).toEqual({ accepted: true, mediaConsent: false });
    expect(() =>
      parseAgreementAcceptance({ accepted: null, mediaConsent: 'on' }),
    ).toThrow('Agreement acceptance is required.');
  });

  it('requires and stores a valid signing date', () => {
    expect(parseSignedDate('2026-07-23').toISOString()).toBe(
      '2026-07-23T12:00:00.000Z',
    );
    expect(() => parseSignedDate('')).toThrow('Signing date is required.');
    expect(() => parseSignedDate('not-a-date')).toThrow(
      'Enter a valid signing date.',
    );
  });

  it('returns a member to the same class after signing a missing waiver', () => {
    expect(bookingWaiverDestination('class occurrence/1')).toBe(
      '/member/waiver?returnTo=%2Fmember%2Fbookings%2Fnew%3Foccurrence%3Dclass%2520occurrence%252F1',
    );
    expect(
      waiverCompletionDestination(
        '/member/bookings/new?occurrence=class%20occurrence%2F1',
      ),
    ).toBe('/member/bookings/new?occurrence=class%20occurrence%2F1');
  });

  it('returns a member to paid access after signing a missing waiver', () => {
    expect(membershipWaiverDestination()).toBe(
      '/member/waiver?returnTo=%2Fmember%2Fmembership',
    );
    expect(eventCheckoutWaiverDestination('rhyze-workshop')).toBe(
      '/member/waiver?returnTo=%2Fbook%2Fevent%2Frhyze-workshop',
    );
    expect(waiverCompletionDestination('/member/membership')).toBe(
      '/member/membership?saved=agreement',
    );
    expect(waiverCompletionDestination('/book/event/rhyze-workshop')).toBe(
      '/book/event/rhyze-workshop',
    );
  });

  it('does not allow an external waiver return destination', () => {
    expect(waiverCompletionDestination('https://example.com/phishing')).toBe(
      '/member/waiver?saved=1',
    );
    expect(waiverCompletionDestination('//example.com/phishing')).toBe(
      '/member/waiver?saved=1',
    );
  });
});
