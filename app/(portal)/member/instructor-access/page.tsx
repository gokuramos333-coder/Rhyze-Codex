import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireArea } from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { submitInstructorCodeAction } from './actions';

export default async function InstructorAccessPage(props: {
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const user = await requireArea('member');
  const searchParams = await props.searchParams;
  const [application, invitation] = await Promise.all([
    prisma.instructorApplication.findUnique({
      where: { userId: user.id },
      select: { status: true },
    }),
    prisma.inAppNotification.findUnique({
      where: { dedupeKey: `manual-instructor-invite:${user.id}` },
      select: { userId: true },
    }),
  ]);
  if (invitation?.userId !== user.id) redirect('/member');
  const pending = Boolean(searchParams.submitted) || application?.status === 'PENDING';

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">Rhyze Tribe team</p>
      <h1 className="mt-3 font-display text-6xl tracking-wider">INSTRUCTOR ACCESS</h1>
      {pending ? (
        <section className="mt-8 border-t-4 border-rhyze-gold bg-white p-6">
          <h2 className="font-display text-4xl tracking-wider">PENDING APPROVAL</h2>
          <p className="mt-3 max-w-2xl leading-7 text-rhyze-black/65">
            Your instructor code was accepted. Management must approve your application before the instructor portal becomes available.
          </p>
          <Link href="/member" className="mt-6 inline-block text-xs font-black uppercase tracking-widest text-rhyze-coral">Return to My Rhyze →</Link>
        </section>
      ) : (
        <form action={submitInstructorCodeAction} className="mt-8 max-w-xl border-t-4 border-rhyze-orange bg-white p-6">
          <h2 className="font-display text-4xl tracking-wider">WELCOME TO THE TEAM</h2>
          <p className="mt-3 leading-7 text-rhyze-black/65">
            Enter the instructor access code from your welcome email. Your instructor portal will stay locked until management approves you.
          </p>
          {searchParams.error === 'code' && (
            <p className="mt-5 border-l-4 border-rhyze-coral bg-rhyze-coral/10 p-4 text-sm font-bold">That instructor access code is not valid.</p>
          )}
          <label className="mt-6 grid gap-2">
            <span className="text-xs font-black uppercase tracking-widest">Instructor access code</span>
            <input name="instructorCode" required autoComplete="off" className="min-h-14 border px-4 text-base" />
          </label>
          <button className="mt-5 min-h-14 w-full bg-rhyze-gradient px-6 text-sm font-black uppercase tracking-widest">Submit for management approval</button>
        </form>
      )}
    </>
  );
}
