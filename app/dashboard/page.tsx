import type { Metadata } from 'next';
import type React from 'react';
import Link from 'next/link';
import {
  Activity,
  Bell,
  FileSignature,
  Plus,
} from 'lucide-react';
import {
  adminQueues,
  automations,
  dropInOffers,
  ownedMemberships,
  ownedSchedule,
  studioMetrics,
} from '@/lib/rhyze-platform';
import { Button } from '@/components/ui/Button';

export const metadata: Metadata = {
  title: 'Studio OS',
  robots: { index: false },
};

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-16 md:py-20">
      <section className="mb-10 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-orange">
            Rhyze #2 New
          </p>
          <h1 className="font-display text-5xl tracking-wider md:text-7xl">
            STUDIO OS
          </h1>
          <p className="mt-4 max-w-2xl text-rhyze-cream/70">
            Admin-side preview for class management, memberships, waivers,
            automations, customer activity, and revenue reporting.
          </p>
        </div>
        <Button href="/classes#schedule">Review Customer Schedule</Button>
      </section>

      <section className="grid gap-5 md:grid-cols-4">
        {studioMetrics.map((metric) => (
          <article
            key={metric.label}
            className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-5"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-rhyze-cream/45">
              {metric.label}
            </p>
            <h2 className="mt-3 font-display text-5xl tracking-wider text-rhyze-cream">
              {metric.value}
            </h2>
            <p className="mt-2 text-sm text-rhyze-cream/60">{metric.detail}</p>
          </article>
        ))}
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
                Class Manager
              </p>
              <h2 className="font-display text-4xl tracking-wider">
                ADD, EDIT, DELETE CLASSES
              </h2>
            </div>
            <Button href="/classes" variant="outline">
              <Plus className="h-4 w-4" aria-hidden />
              Add Class
            </Button>
          </div>
          <div className="space-y-3">
            {ownedSchedule.map((slot) => (
              <article
                key={slot.id}
                className="grid gap-4 rounded-2xl border border-white/10 bg-rhyze-black/50 p-4 md:grid-cols-[1fr_auto_auto]"
              >
                <div>
                  <p className="font-display text-2xl tracking-wider">
                    {slot.className}
                  </p>
                  <p className="mt-1 text-sm text-rhyze-cream/60">
                    {slot.instructor} · {slot.date} · {slot.time} · {slot.price}
                  </p>
                </div>
                <span className="self-center text-xs uppercase tracking-widest text-rhyze-gold">
                  {slot.booked}/{slot.capacity} booked
                </span>
                <Link
                  href={slot.bookingHref}
                  className="focus-ring inline-flex items-center justify-center rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest hover:border-rhyze-coral hover:text-rhyze-coral"
                >
                  Preview
                </Link>
              </article>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <DashboardPanel
            icon={<FileSignature className="h-5 w-5" aria-hidden />}
            title="Waivers"
            items={[
              'General studio waiver',
              'Membership terms',
              'Guardian signature queue',
              'Send waiver reminder',
            ]}
          />
          <DashboardPanel
            icon={<Bell className="h-5 w-5" aria-hidden />}
            title="Automations"
            items={automations}
          />
        </div>
      </section>

      <section className="mt-12 grid gap-8 lg:grid-cols-2">
        <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            Memberships
          </p>
          <h2 className="font-display text-4xl tracking-wider">
            PACKAGES + SINGLE CLASSES
          </h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[...ownedMemberships, ...dropInOffers].map((offer) => (
              <article
                key={offer.id}
                className="rounded-2xl border border-white/10 bg-rhyze-black/50 p-4"
              >
                <p className="font-display text-2xl tracking-wider">{offer.name}</p>
                <p className="mt-2 font-display text-4xl text-rhyze-gold">
                  {offer.price}
                </p>
                <p className="mt-2 text-sm text-rhyze-cream/60">
                  {'detail' in offer ? offer.detail : offer.credits}
                </p>
              </article>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
          <p className="mb-3 text-xs uppercase tracking-[0.3em] text-rhyze-coral">
            Customers
          </p>
          <h2 className="font-display text-4xl tracking-wider">
            ATTENTION QUEUE
          </h2>
          <div className="mt-6 space-y-3">
            {adminQueues.map((item) => (
              <div
                key={item}
                className="flex items-center gap-3 rounded-2xl border border-white/10 bg-rhyze-black/50 p-4"
              >
                <Activity className="h-5 w-5 text-rhyze-gold" aria-hidden />
                <span className="text-sm text-rhyze-cream/75">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function DashboardPanel({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: readonly string[];
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-rhyze-charcoal p-6">
      <div className="mb-4 inline-flex rounded-full bg-rhyze-coral/10 p-3 text-rhyze-coral">
        {icon}
      </div>
      <h2 className="font-display text-4xl tracking-wider">{title}</h2>
      <ul className="mt-5 space-y-3 text-sm text-rhyze-cream/70">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rhyze-gold" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
