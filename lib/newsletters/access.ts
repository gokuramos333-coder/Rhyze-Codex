import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { isApprovedOwner } from '@/lib/auth/owner-access';
export async function newsletterActor(staff = false) {
  const session = await auth();
  if (!session?.user?.id) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, role: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') return null;
  return staff
    ? isApprovedOwner(user) || ['ADMIN', 'MANAGER'].includes(user.role)
      ? user
      : null
    : isApprovedOwner(user) || user.role === 'ADMIN'
      ? user
      : null;
}
