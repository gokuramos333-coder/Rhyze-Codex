import { describe, expect, it } from 'vitest';
import { membershipDisplayDetails } from '@/lib/catalog/membership-copy';

describe('membership display copy', () => {
  it('removes repeated meaning from imported paragraph and line copy', () => {
    expect(
      membershipDisplayDetails({
        description:
          'Includes 7 consecutive days of unlimited access to all standard classes. Valid for first-time clients only.\nUnlimited standard classes during the trial window\nValid for first-time clients only',
        isUnlimited: true,
        includedCredits: null,
        cancellationPolicy: null,
      }),
    ).toEqual([
      'Includes 7 consecutive days of unlimited access to all standard classes.',
      'Valid for first-time clients only.',
    ]);
  });

  it('keeps distinct admin-authored details and cancellation terms', () => {
    expect(
      membershipDisplayDetails({
        description:
          'Eight standard classes each month.\nCredits do not roll over.',
        isUnlimited: false,
        includedCredits: 8,
        cancellationPolicy: 'Cancel before the next billing date.',
      }),
    ).toEqual([
      'Eight standard classes each month.',
      'Credits do not roll over.',
      'Cancel before the next billing date.',
    ]);
  });
});
