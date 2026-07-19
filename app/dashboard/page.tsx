import type { Metadata } from 'next';
import type React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  adminQueues,
  automations,
  dropInOffers,
  ownedMemberships,
  ownedSchedule,
  studioMetrics,
} from '@/lib/rhyze-platform';

export const metadata: Metadata = {
  title: 'Studio OS',
  robots: { index: false },
};

const sidebarItems = [
  'Overview',
  'Calendar',
  'Booking',
  'Classes',
  'Memberships',
  'Sales',
  'Customers',
  'Waivers',
  'Automations',
  'Reports',
  'Staff',
  'Settings',
] as const;

const metricDeck = [
  ...studioMetrics,
  { label: 'Attendance rate', value: '86%', detail: '+7% vs last week' },
  { label: 'Active members', value: '142', detail: '+16 this month' },
] as const;

const revenueBars = [42, 58, 52, 74, 68, 86, 94] as const;

const membershipRules = [
  'Credits reset monthly by package rules',
  'Membership waiver required before first booking',
  'Failed payments enter owner queue automatically',
  'Renewal reminders send 5 days before billing',
  'Upgrade/downgrade actions stay inside Rhyze portal',
  'Specialty class access can be included or restricted',
] as const;

const waiverItems = [
  'General studio waiver',
  'Membership terms',
  'Guardian signature queue',
  'Send waiver reminder',
] as const;

export default function DashboardPage() {
  const nextClass =
    ownedSchedule.find((slot) => slot.className.includes('Rhyze Up')) ??
    ownedSchedule[0];
  const previewClass =
    ownedSchedule.find((slot) => slot.className.includes('Pilates Pulse')) ??
    ownedSchedule[0];

  return (
    <main className="studio-os-shell relative z-[60] -mt-44 min-h-screen bg-rhyze-black text-rhyze-cream">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(240,90,60,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,199,44,0.1),transparent_24%)]" />
      <div className="grid min-h-screen xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-rhyze-black/95 p-4 xl:sticky xl:top-0 xl:flex xl:h-screen xl:flex-col xl:border-b-0 xl:border-r xl:p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center border border-rhyze-gold/40 bg-rhyze-gradient font-display text-2xl text-rhyze-black">
              RZ
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rhyze-orange">
                RHYZE FITNESS
              </p>
              <h1 className="font-display text-4xl leading-none tracking-wider">
                Studio OS
              </h1>
            </div>
          </div>

          <nav
            aria-label="Studio OS sections"
            className="mt-7 grid grid-cols-2 gap-2 text-sm font-bold text-rhyze-cream/65 sm:grid-cols-3 xl:grid-cols-1"
          >
            {sidebarItems.map((item) => (
              <a
                key={item}
                href={`#${item.toLowerCase()}`}
                className={[
                  'focus-ring border px-3 py-2.5 transition hover:border-rhyze-coral/50 hover:bg-rhyze-coral/10 hover:text-rhyze-cream',
                  item === 'Overview' || item === 'Classes' || item === 'Memberships'
                    ? 'border-rhyze-coral/40 bg-rhyze-coral/10 text-rhyze-cream'
                    : 'border-transparent',
                ].join(' ')}
              >
                {item}
              </a>
            ))}
          </nav>

          <div className="mt-7 border border-white/10 bg-rhyze-charcoal/80 p-4 xl:mt-auto">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-rhyze-orange">
              NEXT CLASS
            </p>
            <strong className="mt-2 block text-sm">{nextClass.className}</strong>
            <span className="mt-2 block text-xs text-rhyze-cream/55">
              {nextClass.time} - {nextClass.booked}/{nextClass.capacity} booked
            </span>
          </div>
        </aside>

        <div className="min-w-0 px-4 py-6 md:px-7">
          <header className="border-b border-white/10 pb-7">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.34em] text-rhyze-orange">
                  Opening summer 2026 - Lafayette, NJ
                </p>
                <h2 className="mt-3 font-display text-6xl leading-none tracking-wider md:text-8xl">
                  IN RHYTHM WE RISE
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolbarLink active href="/dashboard">
                  Admin View
                </ToolbarLink>
                <ToolbarLink href="/signin">Customer View</ToolbarLink>
                <ToolbarLink href="/classes#schedule">Book Class</ToolbarLink>
                <ToolbarLink tone="primary" href="#automations">
                  Send Reminder
                </ToolbarLink>
              </div>
            </div>
          </header>

          <section id="overview" className="scroll-mt-8 pt-8">
            <SectionHeading
              eyebrow="Control room"
              title="TODAY AT RHYZE"
              action="Live prototype data"
            />
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {metricDeck.map((metric, index) => (
                <article
                  key={metric.label}
                  className="border border-white/10 bg-rhyze-charcoal/75 p-5 shadow-2xl shadow-black/20"
                >
                  <div
                    className={[
                      'mb-5 h-1 w-14',
                      index % 3 === 0
                        ? 'bg-rhyze-gold'
                        : index % 3 === 1
                          ? 'bg-rhyze-coral'
                          : 'bg-rhyze-orange',
                    ].join(' ')}
                  />
                  <p className="text-sm font-bold text-rhyze-cream/55">
                    {metric.label}
                  </p>
                  <strong className="mt-3 block font-display text-5xl leading-none tracking-wider">
                    {metric.value}
                  </strong>
                  <span className="mt-3 block text-sm font-bold text-rhyze-cream/55">
                    {metric.detail}
                  </span>
                </article>
              ))}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <article className="border border-white/10 bg-rhyze-charcoal/75 p-5 shadow-2xl shadow-black/20">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <h3 className="font-display text-4xl tracking-wider">
                    INCOME + GROWTH
                  </h3>
                  <span className="text-xs font-bold text-rhyze-cream/55">
                    $24,921 projected this month
                  </span>
                </div>
                <div className="flex h-56 items-end gap-3" aria-label="Revenue trend">
                  {revenueBars.map((height, index) => (
                    <span
                      key={height}
                      title={`Week ${index + 1}`}
                      className="flex-1 bg-rhyze-gradient"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
              </article>

              <article className="border border-white/10 bg-rhyze-charcoal/75 p-5 shadow-2xl shadow-black/20">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <h3 className="font-display text-4xl tracking-wider">
                    NEEDS ATTENTION
                  </h3>
                  <span className="text-xs font-bold text-rhyze-cream/55">
                    Owner queue
                  </span>
                </div>
                <ul className="grid gap-3">
                  {adminQueues.map((item) => (
                    <li
                      key={item}
                      className="border-l-4 border-rhyze-coral bg-rhyze-coral/10 px-4 py-3 text-sm font-bold text-rhyze-cream/80"
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </section>

          <section
            id="classes"
            aria-label="Class Manager"
            className="scroll-mt-8 pt-8"
          >
            <SectionHeading
              eyebrow="Admin tools"
              title="ADD, EDIT + DELETE CLASSES"
              action={`${ownedSchedule.length} active class templates`}
            />
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_29rem]">
              <article className="border border-white/10 bg-rhyze-charcoal/75 p-4 shadow-2xl shadow-black/20">
                <form className="grid gap-3 md:grid-cols-2">
                  <Field label="Class name" value="New Rhyze Flow" />
                  <Field label="Instructor name" value="Vanessa Ramos" />
                  <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-rhyze-gold">
                      Instructor photo
                    </span>
                    <select className="border border-white/10 bg-rhyze-black px-3 py-3 text-sm font-bold text-rhyze-cream">
                      <option>Vanessa</option>
                      <option>Melissa</option>
                      <option>Adrianna</option>
                      <option>Jessica</option>
                      <option>Julie</option>
                    </select>
                  </label>
                  <Field label="Price" value="$28" />
                  <label className="grid gap-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-rhyze-gold">
                      Category
                    </span>
                    <select className="border border-white/10 bg-rhyze-black px-3 py-3 text-sm font-bold text-rhyze-cream">
                      <option>Dance</option>
                      <option>Yoga & Pilates</option>
                      <option>Strength & HIIT</option>
                      <option>Workshop</option>
                    </select>
                  </label>
                  <Field label="Capacity" value="20" />
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-rhyze-gold">
                      Description
                    </span>
                    <textarea
                      className="min-h-24 border border-white/10 bg-rhyze-black px-3 py-3 text-sm font-bold text-rhyze-cream"
                      defaultValue="A new Rhyze class concept with music-led movement, confidence-building coaching, and a strong community floor."
                    />
                  </label>
                  <button
                    type="button"
                    className="md:col-span-2 bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest text-rhyze-black"
                  >
                    Add Class
                  </button>
                </form>

                <div className="mt-6 grid gap-3">
                  {ownedSchedule.slice(0, 6).map((slot) => (
                    <article
                      key={slot.id}
                      className="grid gap-3 border border-white/10 bg-rhyze-black/45 p-3 md:grid-cols-[4rem_1fr_auto_auto] md:items-center"
                    >
                      <div className="relative h-16 w-16 overflow-hidden bg-rhyze-black">
                        <Image
                          src={slot.photo}
                          alt={slot.instructor}
                          fill
                          sizes="64px"
                          className="object-cover object-[center_18%]"
                        />
                      </div>
                      <div>
                        <strong className="block text-sm">{slot.className}</strong>
                        <span className="text-xs font-bold text-rhyze-cream/55">
                          {slot.instructor} - {slot.price} - {slot.room}
                        </span>
                      </div>
                      <Link
                        href={slot.bookingHref}
                        className="focus-ring border border-white/10 px-4 py-2 text-center text-xs font-black uppercase hover:border-rhyze-gold hover:text-rhyze-gold"
                      >
                        Preview
                      </Link>
                      <button
                        type="button"
                        className="border border-rhyze-coral/30 bg-rhyze-coral/10 px-4 py-2 text-xs font-black uppercase text-rhyze-coral"
                      >
                        Delete
                      </button>
                    </article>
                  ))}
                </div>
              </article>

              <aside className="border border-rhyze-gold/20 bg-rhyze-charcoal/75 p-4 shadow-2xl shadow-black/20">
                <div className="relative aspect-[16/10] overflow-hidden bg-rhyze-black">
                  <Image
                    src={previewClass.photo}
                    alt={previewClass.instructor}
                    fill
                    sizes="(min-width: 1536px) 420px, 100vw"
                    className="object-cover object-[center_18%]"
                  />
                </div>
                <p className="mt-5 text-[10px] font-black uppercase tracking-[0.28em] text-rhyze-cream/50">
                  Yoga & Pilates
                </p>
                <h3 className="mt-2 font-display text-4xl tracking-wider">
                  {previewClass.className}
                </h3>
                <p className="mt-4 text-sm font-bold leading-relaxed text-rhyze-cream/60">
                  A functional Pilates flow focused on strength, stability,
                  mobility, intelligent alignment, joint health, and balance.
                </p>
                <dl className="mt-5 divide-y divide-white/10 text-sm">
                  <Detail label="Instructor" value={previewClass.instructor} />
                  <Detail label="Price" value={previewClass.price} />
                  <Detail label="Capacity" value={`${previewClass.capacity}`} />
                  <Detail label="Customer action" value="Book / Join waitlist" />
                </dl>
                <Link
                  href={previewClass.bookingHref}
                  className="focus-ring mt-5 block bg-rhyze-gradient px-5 py-3 text-center text-xs font-black uppercase tracking-widest text-rhyze-black"
                >
                  Preview Booking
                </Link>
              </aside>
            </div>
          </section>

          <section id="memberships" className="scroll-mt-8 pt-8">
            <SectionHeading
              eyebrow="Admin tools"
              title="MEMBERSHIPS"
              action="Create Membership"
            />
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {ownedMemberships.map((plan) => (
                <article
                  key={plan.id}
                  className="border border-white/10 bg-rhyze-charcoal/75 p-4 shadow-2xl shadow-black/20"
                >
                  <span className="border border-rhyze-gold/40 bg-rhyze-gold/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-rhyze-gold">
                    {plan.id === 'intro-offer' ? 'Trial' : 'Membership'}
                  </span>
                  <h3 className="mt-5 font-display text-4xl tracking-wider">
                    {plan.name}
                  </h3>
                  <p className="mt-4 font-display text-5xl tracking-wider">
                    {plan.price}
                  </p>
                  <p className="mt-3 text-sm font-bold text-rhyze-cream/55">
                    {plan.eyebrow}
                  </p>
                  <div className="my-6 h-px bg-white/10" />
                  <p className="text-sm font-bold text-rhyze-cream/60">
                    {plan.credits}
                  </p>
                  <ul className="mt-5 grid gap-2 text-sm font-bold">
                    {plan.perks.map((perk) => (
                      <li key={perk} className="border-l-2 border-rhyze-gold pl-3">
                        {perk}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.href}
                    className="focus-ring mt-6 block bg-rhyze-gradient px-5 py-3 text-center text-xs font-black uppercase tracking-widest text-rhyze-black"
                  >
                    Edit Package
                  </Link>
                </article>
              ))}
            </div>

            <article className="mt-4 border border-white/10 bg-rhyze-charcoal/75 p-5 shadow-2xl shadow-black/20">
              <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <h3 className="font-display text-4xl tracking-wider">
                  MEMBERSHIP RULES
                </h3>
                <span className="text-xs font-bold text-rhyze-cream/45">
                  Prototype controls for the owned platform
                </span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {membershipRules.map((rule) => (
                  <article
                    key={rule}
                    className="border border-white/10 bg-rhyze-black/35 p-4 text-sm font-bold text-rhyze-cream/80"
                  >
                    {rule}
                  </article>
                ))}
              </div>
            </article>
          </section>

          <section
            id="waivers"
            className="grid scroll-mt-8 gap-4 py-8 xl:grid-cols-2"
          >
            <AdminPanel title="Waivers" items={waiverItems} />
            <AdminPanel title="Automations" items={automations} id="automations" />
            <AdminPanel title="Drop-ins" items={dropInOffers.map((offer) => `${offer.name} - ${offer.price}`)} />
            <AdminPanel title="Customer Queue" items={adminQueues} />
          </section>
        </div>
      </div>
    </main>
  );
}

function ToolbarLink({
  href,
  active = false,
  tone = 'default',
  children,
}: {
  href: string;
  active?: boolean;
  tone?: 'default' | 'primary';
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        'focus-ring border px-4 py-2.5 text-xs font-black uppercase tracking-wide',
        tone === 'primary'
          ? 'border-transparent bg-rhyze-gradient text-rhyze-black'
          : active
            ? 'border-rhyze-gold/50 bg-rhyze-gold/10 text-rhyze-gold'
            : 'border-white/10 bg-rhyze-charcoal/70 text-rhyze-cream hover:border-rhyze-coral hover:text-rhyze-coral',
      ].join(' ')}
    >
      {children}
    </Link>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action: string;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.34em] text-rhyze-orange">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-display text-5xl leading-none tracking-wider md:text-6xl">
          {title}
        </h2>
      </div>
      <span className="w-max border border-rhyze-gold/40 bg-rhyze-gold/10 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rhyze-gold">
        {action}
      </span>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <label className="grid gap-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-rhyze-gold">
        {label}
      </span>
      <input
        className="border border-white/10 bg-rhyze-black px-3 py-3 text-sm font-bold text-rhyze-cream"
        defaultValue={value}
      />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <dt className="text-xs font-black uppercase tracking-wide text-rhyze-cream/45">
        {label}
      </dt>
      <dd className="text-right font-black text-rhyze-cream">{value}</dd>
    </div>
  );
}

function AdminPanel({
  title,
  items,
  id,
}: {
  title: string;
  items: readonly string[];
  id?: string;
}) {
  return (
    <article
      id={id}
      className="border border-white/10 bg-rhyze-charcoal/75 p-5 shadow-2xl shadow-black/20"
    >
      <h2 className="font-display text-4xl tracking-wider">{title}</h2>
      <ul className="mt-5 grid gap-3">
        {items.map((item) => (
          <li
            key={item}
            className="border-l-2 border-rhyze-gold bg-rhyze-black/35 px-4 py-3 text-sm font-bold text-rhyze-cream/75"
          >
            {item}
          </li>
        ))}
      </ul>
    </article>
  );
}
