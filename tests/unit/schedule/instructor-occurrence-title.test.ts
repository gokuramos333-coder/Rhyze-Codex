import { describe, it, expect } from 'vitest';
import { instructorOccurrenceTitle } from '@/lib/domain/schedule/occurrence-management';
describe('instructor date-specific titles', () => {
  it('uses the date title rather than the shared Vanessa template', () => {
    expect(
      instructorOccurrenceTitle({
        template: { name: 'Real Riddim with Vanessa' },
        titleOverride: 'Real Riddim with Dennisse',
        instructor: { name: 'Dennisse Mendoza' },
      }),
    ).toBe('Real Riddim with Dennisse');
  });
  it('uses the assigned instructor on a shared format without duplicating the format', () => {
    for (const name of ['Dennisse Mendoza', 'Vanessa Ramos'])
      expect(
        instructorOccurrenceTitle({
          template: { name: 'Real Riddim' },
          instructor: { name },
        }),
      ).toBe(`Real Riddim with ${name.split(' ')[0]}`);
  });
  it('retains custom occurrence titles and a substitute display', () => {
    expect(
      instructorOccurrenceTitle({
        template: { name: 'Real Riddim' },
        titleOverride: 'Dance Party',
        substituteInstructorName: 'Julie Reese',
        instructor: { name: 'Vanessa Ramos' },
      }),
    ).toBe('Dance Party with Julie');
  });
});
