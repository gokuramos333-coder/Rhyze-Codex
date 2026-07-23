import { redirect } from 'next/navigation';
import { dashboardPathForRole } from '@/lib/auth/authorization';
import { requireActiveUser } from '@/lib/auth/session';

export default async function ContinuePage() {
  const user = await requireActiveUser();
  redirect(dashboardPathForRole(user.role));
}
