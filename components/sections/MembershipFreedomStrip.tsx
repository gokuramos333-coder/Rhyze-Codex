import Link from 'next/link';

type MembershipFreedomStripProps = {
  showCta?: boolean;
};

export function MembershipFreedomStrip({ showCta = true }: MembershipFreedomStripProps) {
  const layoutClassName = showCta
    ? 'mx-auto flex max-w-7xl flex-col gap-5 text-center lg:flex-row lg:items-center lg:justify-between lg:text-left'
    : 'mx-auto flex max-w-7xl flex-col items-center justify-center gap-5 text-center';

  return (
    <section className="border-y border-rhyze-orange/30 bg-rhyze-gradient px-6 py-8 text-rhyze-black">
      <div className={layoutClassName}>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.3em]">Membership freedom</p>
          <h2 className="mt-2 font-display text-4xl tracking-wider md:text-5xl">FREEZE ANYTIME. NO CONTRACTS. NO CANCELLATION FEES.</h2>
          <p className="mt-1 text-sm font-black uppercase tracking-widest">Month-to-month memberships built around real life.</p>
        </div>
        {showCta ? (
          <Link href="/join" className="focus-ring shrink-0 bg-rhyze-black px-6 py-4 text-xs font-black uppercase tracking-widest text-white">Explore memberships →</Link>
        ) : null}
      </div>
    </section>
  );
}
