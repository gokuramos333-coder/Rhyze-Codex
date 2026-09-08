import type { Role } from '@prisma/client';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import {
  canAccessArea,
  dashboardPathForRole,
  type PortalArea,
} from '@/lib/auth/authorization';
import { prisma } from '@/lib/db/prisma';
import { isApprovedOwner } from '@/lib/auth/owner-access';

export type ActiveUser = {
  id: string;
  email: string;
  name: string | null;
  role: Role;
};

export async function requireActiveUser(): Promise<ActiveUser> {
  const session = await auth();
  if (!session?.user?.id) redirect('/sign-in');

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
    },
  });

  if (!user || user.status !== 'ACTIVE') redirect('/sign-in?error=inactive');

  return user;
}

export async function requireArea(area: PortalArea): Promise<ActiveUser> {
  const user = await requireActiveUser();

  if (!canAccessArea(user.role, area)) {
    redirect(dashboardPathForRole(user.role));
  }

  return user;
}

export async function requireAdminAccess(): Promise<ActiveUser> {
  const user = await requireActiveUser();

  if (!canAccessArea(user.role, 'admin') && !isApprovedOwner({ ...user, status: 'ACTIVE' })) {
    redirect(dashboardPathForRole(user.role));
  }

  return user;
}

export async function requireApprovedOwner(): Promise<ActiveUser> {
  const user = await requireActiveUser();

  if (!isApprovedOwner({ ...user, status: 'ACTIVE' })) {
    redirect('/member');
  }

  return user;
}
