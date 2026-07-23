import { describe, expect, it } from 'vitest';
import { generateReferralCode } from '@/lib/domain/onboarding/referral-code';

describe('instructor referral code generation', () => {
  it('uses the normalized first name and RZ26 suffix', () => {
    expect(generateReferralCode('Tricia Jones', [])).toBe('TRICIARZ26');
  });

  it('removes punctuation and accents', () => {
    expect(generateReferralCode("Éva-Marie Stone", [])).toBe('EVAMARIERZ26');
  });

  it('adds a collision suffix deterministically', () => {
    expect(generateReferralCode('Tricia Smith', ['TRICIARZ26', 'TRICIARZ26-2'])).toBe('TRICIARZ26-3');
  });
});
