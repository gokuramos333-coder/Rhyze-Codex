import { describe, expect, it } from 'vitest';
import { agreementSnapshot, policySections } from '@/lib/policies';

describe('studio policies', () => {
  it('covers the complete member agreement and weather safeguards', () => {
    const ids = policySections.map((section) => section.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'waiver',
        'cancellation',
        'weather',
        'refunds',
        'conduct',
        'property',
        'electronic-records',
        'media',
      ]),
    );
    expect(agreementSnapshot).toContain('6 hours before class start time');
    expect(agreementSnapshot).toContain('restore the class credit');
    expect(agreementSnapshot).toContain('unsafe to travel');
    expect(agreementSnapshot).toContain('statutory cancellation rights');
    expect(agreementSnapshot).toContain(
      'withdraw permission for future use by contacting Rhyze Fitness',
    );
    expect(agreementSnapshot).toContain(
      'will not affect membership, booking, or class participation',
    );
  });
});
