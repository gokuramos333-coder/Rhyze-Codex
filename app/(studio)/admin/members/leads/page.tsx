import { requireArea } from '@/lib/auth/session';
import { LeadsWorkspace } from '@/components/newsletters/LeadsWorkspace';
export default async function LeadsPage() {
  await requireArea('admin');
  return <LeadsWorkspace />;
}
