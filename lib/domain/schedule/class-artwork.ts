import { resolvePublicInstructorPhoto } from './public-instructor-photo';

type ArtworkOccurrence = {
  imageUrl?: string | null;
  template?: { imageUrl?: string | null } | null;
  substituteInstructorName?: string | null;
  instructor?: {
    name?: string | null;
    instructorProfile?: { isActive?: boolean | null; photoUrl?: string | null } | null;
  } | null;
};

export function resolveClassArtwork(occurrence: ArtworkOccurrence, displayInstructorName?: string) {
  return occurrence.imageUrl || occurrence.template?.imageUrl || resolvePublicInstructorPhoto({
    assignedInstructorName: occurrence.instructor?.name || '',
    displayInstructorName: displayInstructorName ?? occurrence.substituteInstructorName ?? occurrence.instructor?.name ?? '',
    assignedProfile: occurrence.instructor?.instructorProfile,
  });
}
