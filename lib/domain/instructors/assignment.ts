import { prisma } from '@/lib/db/prisma';
import { assignableInstructorWhere } from '@/lib/admin/assignable-instructors';

export async function requireAssignableInstructor(id: string | null): Promise<string> {
  if (!id?.trim()) throw new Error('Choose an active instructor account');
  const instructor = await prisma.user.findFirst({
    where: { id, ...assignableInstructorWhere },
    select: { id: true },
  });
  if (!instructor) throw new Error('Choose an active instructor account');
  return instructor.id;
}
