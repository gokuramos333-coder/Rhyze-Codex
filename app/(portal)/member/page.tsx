import Link from 'next/link';
import { requireArea } from '@/lib/auth/session';

export default async function MemberHomePage() {
  const user = await requireArea('member');

  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Member home
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">
        WELCOME, {(user.name || 'Rhyzer').split(' ')[0].toUpperCase()}
      </h1>
      <p className="mt-4 max-w-2xl text-rhyze-black/60">
        Phase 1 is active. Complete your profile and current waiver now;
        bookings, attendance, credits, and billing arrive in the next phases.
      </p>
      <div className="mt-10 grid gap-4 md:grid-cols-2">
        <Link
          href="/member/profile"
          className="focus-ring border-t-4 border-rhyze-coral bg-white p-6 shadow-sm"
        >
          <span className="text-xs font-black uppercase tracking-widest text-rhyze-coral">
            Account
          </span>
          <h2 className="mt-3 font-display text-4xl tracking-wider">
            COMPLETE YOUR PROFILE
          </h2>
        </Link>
        <Link
          href="/member/waiver"
          className="focus-ring border-t-4 border-rhyze-gold bg-white p-6 shadow-sm"
        >
          <span className="text-xs font-black uppercase tracking-widest text-rhyze-orange">
            Required to book
          </span>
          <h2 className="mt-3 font-display text-4xl tracking-wider">
            REVIEW YOUR WAIVER
          </h2>
        </Link>
      </div>
    </>
  );
}
