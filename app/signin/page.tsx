import type { Metadata } from 'next';
import type React from 'react';
import Link from 'next/link';
import { CalendarCheck, ShieldCheck, Ticket, TrendingUp } from 'lucide-react';
import { categoryLabel } from '@/lib/classes';
import { customerPortal, ownedMemberships } from '@/lib/rhyze-platform';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Member Portal',
  robots: { index: false },
};

export default function SignInPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-16 md:py-20">
      <section className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-orange">
            Member Portal
          </p>
          <h1 className="font-display text-5xl tracking-wider md:text-7xl">
            MY RHYZE
          </h1>
          <p className="mt-4 max-w-2xl text-rhyze-cream/70">
            Preview the customer side: memberships, schedule, attendance,
            credits, waiver status, and class recommendations.
          </p>
        </div>
        <Button href="/classes#schedule">Book a Class</Button>
      </section>

      <section className="grid gap-5 md:grid-cols-4">
        <PortalMetric
          icon={<Ticket className="h-5 w-5" aria-hidden />}
          label="Membership"
          value={customerPortal.membership}
          detail={`${customerPortal.creditsLeft} credits left`}
        />
        <PortalMetric
          icon={<TrendingUp className="h-5 w-5" aria-hidden />}
          label="Attendance"
          value="92%"
          detail="38 total visits"
        />
        <PortalMetric
          icon={<CalendarCheck className="h-5 w-5" aria-hidden />}
          label="Next Class"
          value={customerPortal.nextClass.className}
          detail={`${customerPortal.nextClass.date} · ${customerPortal.nextClass.time}`}
        />
        <PortalMetric
          icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
          label="Waiver status"
          value={customerPortal.waiverStatus}
          detail="Ready for check-in"
        />
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
          <div className="mb-6 flex items-end justify-between gap-4">
            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
                Attendance History
              </p>
              <h2 className="font-display text-4xl tracking-wider">
                RECENT MOVEMENT
              </h2>
            </div>
            <span className="rounded-full border border-rhyze-gold/30 px-3 py-1 text-xs uppercase tracking-widest text-rhyze-gold">
              {customerPortal.memberName}
            </span>
          </div>
          <div className="space-y-3">
            {customerPortal.attendanceHistory.map((visit) => (
              <div
                key={`${visit.date}-${visit.className}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-rhyze-black/50 p-4"
              >
                <div>
                  <p className="font-semibold">{visit.className}</p>
                  <p className="text-sm text-rhyze-cream/50">{visit.date}</p>
                </div>
                <span className="text-xs font-bold uppercase tracking-widest text-rhyze-gold">
                  {visit.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            Recommended Classes
          </p>
          <h2 className="font-display text-4xl tracking-wider">
            KEEP YOUR RHYTHM
          </h2>
          <div className="mt-6 space-y-4">
            {customerPortal.recommendations.map((item) => (
              <Link
                key={item.slug}
                href={item.href}
                className="focus-ring block rounded-2xl border border-white/10 bg-rhyze-black/50 p-4 hover:border-rhyze-coral"
              >
                <p className="text-xs uppercase tracking-widest text-rhyze-gold">
                  {categoryLabel[item.category]} · {item.duration} min
                </p>
                <h3 className="mt-2 font-display text-2xl tracking-wider">
                  {item.name}
                </h3>
                <p className="mt-1 text-sm text-rhyze-cream/60">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-12">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
              Memberships
            </p>
            <h2 className="font-display text-4xl tracking-wider">
              CHANGE YOUR PLAN
            </h2>
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {ownedMemberships.map((plan) => (
            <article
              key={plan.id}
              className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6"
            >
              <h3 className="font-display text-2xl tracking-wider">
                {plan.name}
              </h3>
              <p className="mt-3 font-display text-5xl text-rhyze-cream">
                {plan.price}
              </p>
              <p className="mt-2 text-xs uppercase tracking-widest text-rhyze-gold">
                {plan.eyebrow}
              </p>
              <p className="mt-4 text-sm text-rhyze-cream/65">{plan.credits}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function PortalMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-5">
      <div className="mb-4 inline-flex rounded-full bg-rhyze-coral/10 p-3 text-rhyze-coral">
        {icon}
      </div>
      <p className="text-xs uppercase tracking-[0.25em] text-rhyze-cream/45">
        {label}
      </p>
      <h2 className="mt-2 font-display text-3xl tracking-wider">{value}</h2>
      <p className="mt-2 text-sm text-rhyze-cream/60">{detail}</p>
    </article>
  );
}
