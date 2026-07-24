import { redirect } from 'next/navigation';
import { requireApprovedOwner } from '@/lib/auth/session';

export default async function DashboardPage() {
  await requireApprovedOwner();
  redirect('/admin');
}
