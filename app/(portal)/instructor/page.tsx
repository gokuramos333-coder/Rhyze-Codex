import Link from 'next/link';

export default function InstructorHomePage() {
  return (
    <>
      <p className="text-xs font-black uppercase tracking-[0.3em] text-rhyze-coral">
        Instructor workspace
      </p>
      <h1 className="mt-3 font-display text-6xl tracking-wider md:text-8xl">
        LEAD THE FLOOR
      </h1>
      <p className="mt-4 max-w-2xl text-rhyze-black/60">
        See every assigned class, open its live roster, and record check-ins,
        attendance, late cancellations, and no-shows.
      </p>
      <Link href="/instructor/schedule" className="mt-8 inline-block bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest">Open my schedule</Link>
    </>
  );
}
