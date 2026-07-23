import type { Metadata } from 'next';
import type React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  adminQueues,
  automations,
  dropInOffers,
  ownedEvents,
  ownedMemberships,
  ownedSchedule,
  studioMetrics,
  studioSignups,
} from '@/lib/rhyze-platform';
import { StudioOSCalendarBoard } from '@/components/sections/StudioOSCalendarBoard';
import { StudioOSDetailLayer } from '@/components/sections/StudioOSDetailLayer';

export const metadata: Metadata = {
  title: 'Studio OS',
  robots: { index: false },
};

const sidebarItems = [
  'Overview',
  'Calendar',
  'Booking',
  'Classes',
  'Events',
  'Memberships',
  'Sales',
  'Customers',
  'Signups',
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

const salesItems = [
  'Daily revenue closes at 9 PM',
  'Membership charges reconcile nightly',
  'Failed cards enter owner review',
  'Drop-ins and workshops export separately',
] as const;

const customerItems = [
  'New customers: 27 this month',
  'All signups: customer and newsletter leads',
  '12 members have not attended in 21 days',
  '86% average weekly attendance',
  'VIP members receive specialty access',
] as const;

const reportItems = [
  'Revenue by package',
  'Attendance by instructor',
  'Class fill rate by weekday',
  'Customer retention and churn',
] as const;

const staffItems = [
  'Vanessa Ramos - Rhyze Up',
  'Melissa Llanos - Rhyze Ritmo',
  'Adrianna - Pilates Pulse',
  'Jessica - Hypnotic Heels',
  'Julie - Ignite',
] as const;

const settingItems = [
  'Studio capacity rules',
  'Booking cancellation window',
  'Reminder timing',
  'Waiver requirements',
  'Membership credit reset day',
] as const;

const metricDetailIds: Record<string, string> = {
  "Today's income": 'today-income',
  'Monthly recurring': 'monthly-recurring',
  'Bookings this week': 'bookings-this-week',
  'Waivers needed': 'waivers-needed',
  'Attendance rate': 'attendance-rate',
  'Active members': 'active-members',
};

export default function DashboardPage() {
  const nextClass =
    ownedSchedule.find((slot) => slot.className.includes('Rhyze Up')) ??
    ownedSchedule[0];
  const previewClass =
    ownedSchedule.find((slot) => slot.className.includes('Pilates Pulse')) ??
    ownedSchedule[0];

  return (
    <main className="studio-os-shell relative z-[60] min-h-screen bg-rhyze-black text-rhyze-cream">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(240,90,60,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,199,44,0.1),transparent_24%)]" />
      <div className="grid min-h-screen xl:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-rhyze-black/95 p-4 xl:sticky xl:top-0 xl:flex xl:h-screen xl:flex-col xl:border-b-0 xl:border-r xl:p-5">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Rhyze Fitness home"
              className="focus-ring relative h-14 w-14 shrink-0 overflow-hidden rounded-md"
            >
              <Image
                src="/brand/rhyze-logo.png"
                alt=""
                fill
                sizes="56px"
                className="object-contain"
              />
            </Link>
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
                  item === 'Overview' ||
                  item === 'Classes' ||
                  item === 'Memberships' ||
                  item === 'Events'
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
            <strong className="mt-2 block text-sm">
              {nextClass.className}
            </strong>
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
                  Rhyze #2 New - Studio command center
                </p>
                <h2 className="mt-3 font-display text-6xl leading-none tracking-wider md:text-8xl">
                  IN RHYTHM WE RISE
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <ToolbarLink active href="/dashboard">
                  Admin View
                </ToolbarLink>
                <ToolbarLink href="/sign-in">Customer View</ToolbarLink>
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
                <button
                  type="button"
                  data-studio-detail={metricDetailIds[metric.label]}
                  key={metric.label}
                  className="focus-ring group border border-white/10 bg-rhyze-charcoal/75 p-5 text-left shadow-2xl shadow-black/20 transition hover:border-rhyze-gold/40 hover:bg-rhyze-charcoal"
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
                  <span className="mt-4 block text-xs font-black uppercase tracking-widest text-rhyze-gold opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                    View detail
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
              <button
                type="button"
                data-studio-detail="income-growth"
                className="focus-ring group border border-white/10 bg-rhyze-charcoal/75 p-5 text-left shadow-2xl shadow-black/20 transition hover:border-rhyze-gold/40 hover:bg-rhyze-charcoal"
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <h3 className="font-display text-4xl tracking-wider">
                    INCOME + GROWTH
                  </h3>
                  <span className="text-xs font-bold text-rhyze-cream/55">
                    $24,921 projected this month
                  </span>
                </div>
                <div
                  className="flex h-56 items-end gap-3"
                  aria-label="Revenue trend"
                >
                  {revenueBars.map((height, index) => (
                    <span
                      key={height}
                      title={`Week ${index + 1}`}
                      className="flex-1 bg-rhyze-gradient"
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
                <span className="mt-4 block text-xs font-black uppercase tracking-widest text-rhyze-gold opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  View projection
                </span>
              </button>

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
                    <li key={item}>
                      <button
                        type="button"
                        data-studio-detail="owner-queue"
                        className="focus-ring w-full border-l-4 border-rhyze-coral bg-rhyze-coral/10 px-4 py-3 text-left text-sm font-bold text-rhyze-cream/80 transition hover:bg-rhyze-coral/20"
                      >
                        {item}
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            </div>
          </section>

          <section id="calendar" className="scroll-mt-8 pt-8">
            <SectionHeading
              eyebrow="Schedule"
              title="CALENDAR + CLASS DETAILS"
              action="Daily / Weekly / Monthly"
            />
            <StudioOSCalendarBoard />
          </section>

          <section id="booking" className="scroll-mt-8 pt-8">
            <SectionHeading
              eyebrow="Customer flow"
              title="BOOK A CLASS"
              action="Confirmation + reminders"
            />
            <div className="grid gap-4 xl:grid-cols-3">
              <BookingStep
                detailId="booking"
                step="1"
                title="Select class"
                body={`${nextClass.className} - ${nextClass.date} at ${nextClass.time}`}
              />
              <BookingStep
                detailId="booking"
                step="2"
                title="Select access"
                body={`${ownedMemberships[1].name} membership or ${dropInOffers[0].name}`}
              />
              <BookingStep
                detailId="booking"
                step="3"
                title="Confirm"
                body="Waiver checked, credit reserved, confirmation email queued."
              />
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
                    data-studio-detail="add-class"
                    className="bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest text-rhyze-black md:col-span-2"
                  >
                    Add Class
                  </button>
                </form>

                <div className="mt-6 grid gap-3">
                  {ownedSchedule.slice(0, 6).map((slot) => (
                    <article
                      key={slot.id}
                      className="grid gap-3 border border-white/10 bg-rhyze-black/45 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                    >
                      <button
                        type="button"
                        data-studio-detail="class-template"
                        className="focus-ring grid grid-cols-[4rem_1fr] items-center gap-3 text-left"
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
                          <strong className="block text-sm">
                            {slot.className}
                          </strong>
                          <span className="text-xs font-bold text-rhyze-cream/55">
                            {slot.instructor} - {slot.price} - {slot.room}
                          </span>
                        </div>
                      </button>
                      <Link
                        href={slot.bookingHref}
                        className="focus-ring border border-white/10 px-4 py-2 text-center text-xs font-black uppercase hover:border-rhyze-gold hover:text-rhyze-gold"
                      >
                        Preview
                      </Link>
                      <button
                        type="button"
                        data-studio-detail="class-template"
                        className="border border-rhyze-coral/30 bg-rhyze-coral/10 px-4 py-2 text-xs font-black uppercase text-rhyze-coral"
                      >
                        Delete
                      </button>
                    </article>
                  ))}
                </div>
              </article>

              <aside
                data-studio-detail="class-template"
                className="cursor-pointer border border-rhyze-gold/20 bg-rhyze-charcoal/75 p-4 shadow-2xl shadow-black/20 transition hover:border-rhyze-gold/50"
              >
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
                  <Detail
                    label="Customer action"
                    value="Book / Join waitlist"
                  />
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

          <section id="events" className="scroll-mt-8 pt-8">
            <SectionHeading
              eyebrow="Admin tools"
              title="EVENTS"
              action={`${ownedEvents.length} upcoming events`}
            />
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_29rem]">
              <article className="border border-white/10 bg-rhyze-charcoal/75 p-4 shadow-2xl shadow-black/20">
                <form className="grid gap-3 md:grid-cols-2">
                  <Field label="Event name" value="New Rhyze Specialty Event" />
                  <Field label="Instructor name" value="Vanessa Ramos" />
                  <Field label="Event date" value="August 28, 2026" />
                  <Field label="Time" value="6:45 PM" />
                  <Field label="Price" value="$30" />
                  <Field label="Capacity" value="18" />
                  <label className="grid gap-1 md:col-span-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-rhyze-gold">
                      Event details
                    </span>
                    <textarea
                      className="min-h-24 border border-white/10 bg-rhyze-black px-3 py-3 text-sm font-bold text-rhyze-cream"
                      defaultValue="A specialty event with photo, date, instructor, description, price, capacity, VIP eligibility, and booking flow."
                    />
                  </label>
                  <button
                    type="button"
                    data-studio-detail="add-event"
                    className="bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest text-rhyze-black md:col-span-2"
                  >
                    Add Event
                  </button>
                </form>

                <div className="mt-6 grid gap-3">
                  {ownedEvents.map((event) => (
                    <article
                      key={event.id}
                      className="grid gap-3 border border-white/10 bg-rhyze-black/45 p-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                    >
                      <button
                        type="button"
                        data-studio-detail="event-template"
                        className="focus-ring grid grid-cols-[4rem_1fr] items-center gap-3 text-left"
                      >
                        <div className="relative h-16 w-16 overflow-hidden bg-rhyze-black">
                          <Image
                            src={event.photo}
                            alt={event.instructor}
                            fill
                            sizes="64px"
                            className="object-cover object-[center_18%]"
                          />
                        </div>
                        <div>
                          <strong className="block text-sm">
                            {event.name}
                          </strong>
                          <span className="text-xs font-bold text-rhyze-cream/55">
                            {event.fullDate} - {event.time} - {event.price}
                          </span>
                        </div>
                      </button>
                      <Link
                        href={`/events/${event.slug}`}
                        className="focus-ring border border-white/10 px-4 py-2 text-center text-xs font-black uppercase hover:border-rhyze-gold hover:text-rhyze-gold"
                      >
                        Preview
                      </Link>
                      <button
                        type="button"
                        data-studio-detail="event-template"
                        className="border border-rhyze-coral/30 bg-rhyze-coral/10 px-4 py-2 text-xs font-black uppercase text-rhyze-coral"
                      >
                        Delete
                      </button>
                    </article>
                  ))}
                </div>
              </article>

              <aside
                data-studio-detail="event-template"
                className="cursor-pointer border border-rhyze-gold/20 bg-rhyze-charcoal/75 p-4 shadow-2xl shadow-black/20 transition hover:border-rhyze-gold/50"
              >
                <div className="relative aspect-[16/10] overflow-hidden bg-rhyze-black">
                  <Image
                    src={ownedEvents[0].photo}
                    alt={ownedEvents[0].name}
                    fill
                    sizes="(min-width: 1536px) 420px, 100vw"
                    className="object-cover object-[center_18%]"
                  />
                </div>
                <p className="mt-5 text-[10px] font-black uppercase tracking-[0.28em] text-rhyze-cream/50">
                  {ownedEvents[0].category}
                </p>
                <h3 className="mt-2 font-display text-4xl tracking-wider">
                  {ownedEvents[0].name}
                </h3>
                <ul className="mt-4 grid gap-2 text-sm font-bold leading-relaxed text-rhyze-cream/60">
                  {ownedEvents[0].bullets.slice(0, 3).map((bullet) => (
                    <li
                      key={bullet}
                      className="border-l-2 border-rhyze-gold pl-3"
                    >
                      {bullet}
                    </li>
                  ))}
                </ul>
                <dl className="mt-5 divide-y divide-white/10 text-sm">
                  <Detail
                    label="Instructor"
                    value={ownedEvents[0].instructor}
                  />
                  <Detail label="Price" value={ownedEvents[0].price} />
                  <Detail
                    label="Booked"
                    value={`${ownedEvents[0].booked}/${ownedEvents[0].capacity}`}
                  />
                  <Detail
                    label="Customer action"
                    value="Claim spot / waitlist"
                  />
                </dl>
                <Link
                  href={ownedEvents[0].bookingHref}
                  className="focus-ring mt-5 block bg-rhyze-gradient px-5 py-3 text-center text-xs font-black uppercase tracking-widest text-rhyze-black"
                >
                  Preview Event Booking
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
                  data-studio-detail="memberships"
                  key={plan.id}
                  className="cursor-pointer border border-white/10 bg-rhyze-charcoal/75 p-4 shadow-2xl shadow-black/20 transition hover:border-rhyze-gold/40 hover:bg-rhyze-charcoal"
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
                    {plan.details.map((perk) => (
                      <li
                        key={perk}
                        className="border-l-2 border-rhyze-gold pl-3"
                      >
                        {perk}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={plan.href}
                    data-studio-detail="memberships"
                    className="focus-ring mt-6 block bg-rhyze-gradient px-5 py-3 text-center text-xs font-black uppercase tracking-widest text-rhyze-black"
                  >
                    Edit Package
                  </Link>
                </article>
              ))}
            </div>

            <article
              data-studio-detail="membership-rules"
              className="mt-4 cursor-pointer border border-white/10 bg-rhyze-charcoal/75 p-5 shadow-2xl shadow-black/20 transition hover:border-rhyze-gold/40"
            >
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
                  <button
                    type="button"
                    data-studio-detail="membership-rules"
                    key={rule}
                    className="focus-ring border border-white/10 bg-rhyze-black/35 p-4 text-left text-sm font-bold text-rhyze-cream/80 transition hover:border-rhyze-gold/40"
                  >
                    {rule}
                  </button>
                ))}
              </div>
            </article>
          </section>

          <section id="sales" className="scroll-mt-8 pt-8">
            <SectionHeading
              eyebrow="Revenue"
              title="SALES"
              action="Owner finance queue"
            />
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <article
                data-studio-detail="sales"
                className="cursor-pointer border border-white/10 bg-rhyze-charcoal/75 p-5 transition hover:border-rhyze-gold/40"
              >
                <h3 className="font-display text-4xl tracking-wider">
                  REVENUE SNAPSHOT
                </h3>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  {studioMetrics.slice(0, 2).map((metric) => (
                    <button
                      type="button"
                      data-studio-detail={metricDetailIds[metric.label]}
                      key={metric.label}
                      className="focus-ring border border-white/10 bg-rhyze-black/35 p-4 text-left transition hover:border-rhyze-gold/40"
                    >
                      <p className="text-sm font-bold text-rhyze-cream/55">
                        {metric.label}
                      </p>
                      <strong className="mt-2 block font-display text-4xl tracking-wider">
                        {metric.value}
                      </strong>
                    </button>
                  ))}
                </div>
              </article>
              <AdminPanel
                title="Sales Queue"
                items={salesItems}
                detailId="sales"
              />
            </div>
          </section>

          <section id="customers" className="scroll-mt-8 pt-8">
            <SectionHeading
              eyebrow="Member activity"
              title="CUSTOMERS"
              action="Attendance and retention"
            />
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <AdminPanel
                title="Customer Activity"
                items={customerItems}
                detailId="customer-activity"
                itemDetailIds={{
                  'New customers: 27 this month': 'new-customers',
                  'All signups: customer and newsletter leads': 'all-signups',
                }}
              />
              <article className="border border-white/10 bg-rhyze-charcoal/75 p-5">
                <h3 className="font-display text-4xl tracking-wider">
                  NEW CUSTOMER DETAIL
                </h3>
                <div className="mt-5 grid gap-3">
                  {[
                    'Maya Collins - 5 credits left',
                    'Priya Santos - waiver signed',
                    'Jordan Lee - first class booked',
                  ].map((item) => (
                    <button
                      type="button"
                      data-studio-detail="customer-activity"
                      key={item}
                      className="focus-ring border-l-2 border-rhyze-gold bg-rhyze-black/35 px-4 py-3 text-left text-sm font-bold text-rhyze-cream/75 transition hover:bg-rhyze-black/55"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </article>
            </div>
          </section>

          <section id="signups" className="scroll-mt-8 pt-8">
            <SectionHeading
              eyebrow="Contacts"
              title="ALL SIGNUPS"
              action={`${studioSignups.length} prototype records`}
            />
            <article className="border border-white/10 bg-rhyze-charcoal/75 p-5 shadow-2xl shadow-black/20">
              <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h3 className="font-display text-4xl tracking-wider">
                    CUSTOMER + LEAD LIST
                  </h3>
                  <p className="mt-2 text-sm font-bold text-rhyze-cream/55">
                    Includes members, drop-ins, event buyers, and email-only
                    leads.
                  </p>
                </div>
                <button
                  type="button"
                  data-studio-detail="email-blast"
                  className="focus-ring bg-rhyze-gradient px-5 py-3 text-xs font-black uppercase tracking-widest text-rhyze-black"
                >
                  Send Email Blast
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[58rem] border-collapse text-left text-sm">
                  <thead className="text-[10px] font-black uppercase tracking-widest text-rhyze-gold">
                    <tr className="border-b border-white/10">
                      <th className="py-3 pr-4">Name</th>
                      <th className="py-3 pr-4">Email</th>
                      <th className="py-3 pr-4">Phone</th>
                      <th className="py-3 pr-4">Address</th>
                      <th className="py-3 pr-4">Bought / Source</th>
                      <th className="py-3">Activity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {studioSignups.map((signup) => (
                      <tr
                        key={signup.email}
                        data-studio-detail="signup-record"
                        className="cursor-pointer transition hover:bg-rhyze-coral/10"
                      >
                        <td className="py-4 pr-4 font-black text-rhyze-cream">
                          {signup.name}
                        </td>
                        <td className="py-4 pr-4 text-rhyze-cream/70">
                          {signup.email}
                        </td>
                        <td className="py-4 pr-4 text-rhyze-cream/70">
                          {signup.phone}
                        </td>
                        <td className="py-4 pr-4 text-rhyze-cream/70">
                          {signup.address}
                        </td>
                        <td className="py-4 pr-4 text-rhyze-cream/70">
                          <span className="block font-bold text-rhyze-gold">
                            {signup.purchase}
                          </span>
                          <span>{signup.source}</span>
                        </td>
                        <td className="py-4 text-rhyze-cream/70">
                          {signup.activity}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>

          <section
            id="waivers"
            className="grid scroll-mt-8 gap-4 py-8 xl:grid-cols-2"
          >
            <AdminPanel
              title="Waivers"
              items={waiverItems}
              detailId="waivers"
            />
            <AdminPanel
              title="Automations"
              items={automations}
              id="automations"
              detailId="automations"
            />
            <AdminPanel
              title="Drop-ins"
              items={dropInOffers.map(
                (offer) => `${offer.name} - ${offer.price}`,
              )}
              detailId="sales"
            />
            <AdminPanel
              title="Customer Queue"
              items={adminQueues}
              detailId="owner-queue"
            />
          </section>

          <section className="grid scroll-mt-8 gap-4 pb-8 xl:grid-cols-3">
            <AdminPanel
              title="Reports"
              items={reportItems}
              id="reports"
              detailId="reports"
            />
            <AdminPanel
              title="Staff"
              items={staffItems}
              id="staff"
              detailId="staff"
            />
            <AdminPanel
              title="Settings"
              items={settingItems}
              id="settings"
              detailId="settings"
            />
          </section>
        </div>
      </div>
      <StudioOSDetailLayer />
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

function BookingStep({
  detailId,
  step,
  title,
  body,
}: {
  detailId: string;
  step: string;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      data-studio-detail={detailId}
      className="focus-ring border border-white/10 bg-rhyze-charcoal/75 p-5 text-left transition hover:border-rhyze-gold/40 hover:bg-rhyze-charcoal"
    >
      <span className="grid h-10 w-10 place-items-center border border-rhyze-gold/40 bg-rhyze-gold/10 font-display text-3xl text-rhyze-gold">
        {step}
      </span>
      <h3 className="mt-5 font-display text-4xl tracking-wider">{title}</h3>
      <p className="mt-3 text-sm font-bold leading-relaxed text-rhyze-cream/60">
        {body}
      </p>
    </button>
  );
}

function AdminPanel({
  title,
  items,
  id,
  detailId,
  itemDetailIds = {},
}: {
  title: string;
  items: readonly string[];
  id?: string;
  detailId: string;
  itemDetailIds?: Record<string, string>;
}) {
  return (
    <article
      id={id}
      data-studio-detail={detailId}
      className="cursor-pointer border border-white/10 bg-rhyze-charcoal/75 p-5 shadow-2xl shadow-black/20 transition hover:border-rhyze-gold/40"
    >
      <h2 className="font-display text-4xl tracking-wider">{title}</h2>
      <ul className="mt-5 grid gap-3">
        {items.map((item) => (
          <li key={item}>
            <button
              type="button"
              data-studio-detail={itemDetailIds[item] ?? detailId}
              className="focus-ring w-full border-l-2 border-rhyze-gold bg-rhyze-black/35 px-4 py-3 text-left text-sm font-bold text-rhyze-cream/75 transition hover:bg-rhyze-black/55"
            >
              {item}
            </button>
          </li>
        ))}
      </ul>
    </article>
  );
}
