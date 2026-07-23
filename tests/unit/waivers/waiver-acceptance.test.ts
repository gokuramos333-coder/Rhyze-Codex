import { describe, expect, it } from 'vitest';
import {
  parseAgreementAcceptance,
  parseSignedDate,
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
});
