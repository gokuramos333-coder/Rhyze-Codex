import { requireApprovedOwner } from '@/lib/auth/session';
import { NewsletterWorkspace } from '@/components/newsletters/NewsletterWorkspace';
export default async function NewslettersPage() {
  await requireApprovedOwner();
  return <NewsletterWorkspace />;
}
