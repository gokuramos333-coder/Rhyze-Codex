import { describe, expect, it } from 'vitest';
import { resolvePublicInstructorPhoto } from '@/lib/domain/schedule/public-instructor-photo';

describe('public schedule instructor photos', () => {
  it('uses static instructor photos when the assigned profile is inactive or missing a photo', () => {
    expect(
      resolvePublicInstructorPhoto({
        assignedInstructorName: 'Vanessa Ramos',
        displayInstructorName: 'Vanessa Ramos',
        assignedProfile: { isActive: false, photoUrl: null },
      }),
    ).toBe('/founders/instructor-vanessa.jpg');

    expect(
      resolvePublicInstructorPhoto({
        assignedInstructorName: 'Julie Reese',
        displayInstructorName: 'Julie Reese',
        assignedProfile: { isActive: true, photoUrl: null },
      }),
    ).toBe('/founders/instructor-julie.jpg');
  });

  it('prefers active uploaded instructor photos over static fallbacks', () => {
    expect(
      resolvePublicInstructorPhoto({
        assignedInstructorName: 'Julie Reese',
        displayInstructorName: 'Julie Reese',
        assignedProfile: { isActive: true, photoUrl: '/uploads/profiles/julie.jpg' },
      }),
    ).toBe('/uploads/profiles/julie.jpg');
  });
});
