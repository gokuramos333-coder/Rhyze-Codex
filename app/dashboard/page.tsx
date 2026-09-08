import { redirect } from 'next/navigation';
import { requireAdminAccess } from '@/lib/auth/session';

export default async function DashboardPage() {
  await requireAdminAccess();
  redirect('/admin');
}
