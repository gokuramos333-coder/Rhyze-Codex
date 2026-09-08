import { instructors } from '@/lib/instructors';

export function resolvePublicInstructorPhoto({
  assignedInstructorName,
  displayInstructorName,
  assignedProfile,
}: {
  assignedInstructorName: string;
  displayInstructorName: string;
  assignedProfile?: { isActive?: boolean | null; photoUrl?: string | null } | null;
}) {
  if (
    assignedInstructorName === displayInstructorName &&
    assignedProfile?.isActive &&
    assignedProfile.photoUrl
  ) {
    return assignedProfile.photoUrl;
  }

  const canonicalInstructor = instructors.find((item) => {
    const fullName = `${item.firstName} ${item.lastName}`.trim().toLowerCase();
    const candidate = displayInstructorName.toLowerCase();
    return candidate === fullName || candidate.startsWith(item.firstName.toLowerCase());
  });

  return canonicalInstructor?.photo || '/brand/rhyze-logo-header.png';
}
