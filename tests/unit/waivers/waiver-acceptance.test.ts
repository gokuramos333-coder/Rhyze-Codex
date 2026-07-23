import { describe, expect, it } from 'vitest';
import { parseAgreementAcceptance } from '@/lib/domain/waivers/acceptance';

describe('digital agreement acceptance', () => {
  it('requires agreement acceptance but keeps media consent optional', () => {
    expect(
      parseAgreementAcceptance({ accepted: 'on', mediaConsent: null }),
    ).toEqual({ accepted: true, mediaConsent: false });
    expect(() =>
      parseAgreementAcceptance({ accepted: null, mediaConsent: 'on' }),
    ).toThrow('Agreement acceptance is required.');
  });
});
