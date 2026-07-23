import { requireArea } from '@/lib/auth/session';

export default async function AdminMembersPage() {
  await requireArea('admin');

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Members
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">MEMBER ACCESS</h1>
      <p className="mt-4 text-rhyze-black/60">
        Member management is permission-protected. Search, role management, and
        account actions arrive with the full admin workspace in Phase 6.
      </p>
    </>
  );
}
