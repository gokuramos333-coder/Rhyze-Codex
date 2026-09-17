import type { Prisma } from '@prisma/client';

export const ownerInstructorEmails = ['vanessa@rhyzefit.com', 'melissa@rhyzefit.com'] as const;

export const assignableInstructorWhere = {
  status: 'ACTIVE',
  role: { in: ['INSTRUCTOR', 'OWNER', 'ADMIN', 'MANAGER'] },
  passwordHash: { not: null },
  NOT: { email: { endsWith: '@rhyze.local', mode: 'insensitive' } },
  OR: [
    { instructorProfile: { is: { isActive: true } } },
    { email: { in: [...ownerInstructorEmails] } },
  ],
} satisfies Prisma.UserWhereInput;

type AssignableInstructor = {
  id: string;
  name: string | null;
  email: string;
};

function normalizedInstructorName(instructor: AssignableInstructor) {
  return (instructor.name || instructor.email)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isPlaceholderInstructor(instructor: AssignableInstructor) {
  return instructor.email.toLowerCase().endsWith('@rhyze.local');
}

function preferredInstructor(
  current: AssignableInstructor,
  candidate: AssignableInstructor,
) {
  if (isPlaceholderInstructor(current) && !isPlaceholderInstructor(candidate)) {
    return candidate;
  }
  if (!current.name && candidate.name) return candidate;
  return current;
}

export function dedupeAssignableInstructors<T extends AssignableInstructor>(
  instructors: T[],
): T[] {
  const byName = new Map<string, T>();
  for (const instructor of instructors) {
    const key = normalizedInstructorName(instructor);
    const existing = byName.get(key);
    byName.set(key, existing ? (preferredInstructor(existing, instructor) as T) : instructor);
  }

  return [...byName.values()].sort((a, b) =>
    instructorOptionLabel(a).localeCompare(instructorOptionLabel(b)),
  );
}

export function instructorOptionLabel(instructor: AssignableInstructor) {
  return instructor.name?.trim() || instructor.email;
}
