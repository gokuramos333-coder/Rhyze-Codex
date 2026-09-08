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
    expect(agreementSnapshot).toContain('More than 6 hours before a standard class');
    expect(agreementSnapshot).toContain('$5 transfer fee');
    expect(agreementSnapshot).toContain('$10 late-cancellation fee');
    expect(agreementSnapshot).toContain('VIP clients may reschedule within 14 days with no transfer fee');
    expect(agreementSnapshot).toContain('$10 for standard clients');
    expect(agreementSnapshot).toContain('$10 for intro-trial clients');
    expect(agreementSnapshot).toContain('$10 for VIP clients');
    expect(agreementSnapshot).not.toContain('VIP Access transfer fees are waived');
    expect(agreementSnapshot).toContain('more than 6 hours before the event');
    expect(agreementSnapshot).toContain('30 days from the cancellation date');
    expect(agreementSnapshot).not.toContain('end of the following calendar month');
    expect(agreementSnapshot).not.toContain('event-only credit valid for 14 days');
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
