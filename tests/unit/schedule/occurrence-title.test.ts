import { describe, expect, it } from 'vitest';
import { occurrenceTitleWithInstructor } from '@/lib/domain/schedule/occurrence-management';

describe('occurrence title with instructor', () => {
  it('adds the instructor first name when the title does not already include one', () => {
    expect(occurrenceTitleWithInstructor('Yoga Sculpt', 'Adrianna Jones')).toBe(
      'Yoga Sculpt with Adrianna',
    );
    expect(occurrenceTitleWithInstructor('Real Riddim', 'Dennisse')).toBe(
      'Real Riddim with Dennisse',
    );
  });

  it('does not duplicate an existing with-instructor title', () => {
    expect(
      occurrenceTitleWithInstructor('Ignite with Vanessa', 'Vanessa Ramos'),
    ).toBe('Ignite with Vanessa');
  });

  it('keeps the full TBA label when an instructor has not been assigned', () => {
    expect(
      occurrenceTitleWithInstructor('Mommy & Me', 'Instructor TBA'),
    ).toBe('Mommy & Me with Instructor TBA');
  });
});
